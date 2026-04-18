// controllers/subscriptionController.js
'use strict';

const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription     = require('../models/Subscription');
const Business         = require('../models/Business');
const { pool }         = require('../config/db');
const { expireOverdueSubscriptions } = require('../jobs/subscriptionExpiryJob');
const axios            = require('axios');

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

async function getBusinessIdFromUser(userId) {
  const result = await pool.query(
    'SELECT id FROM businesses WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0]?.id || null;
}

function getAppBaseUrl() {
  return process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:4200';
}

function getApiBaseUrl() {
  return process.env.API_URL || process.env.BACKEND_URL || `http://localhost:${process.env.PORT || 3000}`;
}

const isSandbox = () => process.env.PAYMENT_MODE !== 'live';

// ─────────────────────────────────────────────────────────────
// PLANS
// ─────────────────────────────────────────────────────────────

exports.getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.getAll();
    res.json(plans);
  } catch (error) {
    console.error('Erreur récupération plans:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.getPlanById = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.getById(req.params.id);
    if (!plan) return res.status(404).json({ error: 'Plan non trouvé' });
    res.json(plan);
  } catch (error) {
    console.error('Erreur récupération plan:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// ABONNEMENT COURANT
// ─────────────────────────────────────────────────────────────

exports.getCurrentSubscription = async (req, res) => {
  try {
    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);
    if (!businessId) return res.status(400).json({ error: 'Aucun établissement trouvé' });

    const subscription = await Subscription.getByBusinessId(businessId);
    if (!subscription) return res.status(404).json({ error: 'Aucun abonnement actif' });

    res.json(subscription);
  } catch (error) {
    console.error('Erreur récupération abonnement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// SOUSCRIRE (plan gratuit ou simulation sandbox)
// ─────────────────────────────────────────────────────────────

exports.subscribe = async (req, res) => {
  try {
    const { plan_id, simulate_payment = true } = req.body;

    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);
    if (!businessId) return res.status(400).json({ error: 'Aucun établissement trouvé' });

    const plan = await SubscriptionPlan.getById(plan_id);
    if (!plan) return res.status(404).json({ error: 'Plan non trouvé' });

    // Annuler l'abonnement actuel
    const currentSub = await Subscription.getByBusinessId(businessId);
    if (currentSub) {
      await pool.query(
        'UPDATE business_subscriptions SET status = $1 WHERE id = $2',
        ['cancelled', currentSub.id]
      );
    }

    const startDate = new Date();
    let endDate = null;
    let nextBillingDate = null;

    if (plan.billing_period !== 'lifetime') {
      endDate = new Date(startDate);
      if (plan.billing_period === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (plan.billing_period === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }
      nextBillingDate = endDate;
    }

    const subscription = await Subscription.create({
      business_id:       businessId,
      plan_id,
      start_date:        startDate,
      end_date:          endDate,
      next_billing_date: nextBillingDate,
      auto_renew:        true
    });

    if (plan.price > 0) {
      await pool.query(
        `INSERT INTO subscription_payments
         (subscription_id, business_id, plan_id, amount, currency, payment_status,
          payment_method, billing_period_start, billing_period_end)
         VALUES ($1, $2, $3, $4, 'XOF', 'success', 'simulation', $5, $6)`,
        [subscription.id, businessId, plan_id, plan.price, startDate, endDate]
      );
    }

    res.status(201).json({
      success: true,
      message: 'Abonnement créé avec succès',
      subscription: {
        ...subscription,
        plan_name:      plan.name,
        display_name:   plan.display_name,
        billing_period: plan.billing_period
      }
    });

  } catch (error) {
    console.error('Erreur souscription:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur', message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// UPGRADE
// ─────────────────────────────────────────────────────────────

exports.upgrade = async (req, res) => {
  try {
    const { plan_id } = req.body;

    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);
    if (!businessId) return res.status(400).json({ error: 'Aucun établissement trouvé' });

    const currentSub = await Subscription.getByBusinessId(businessId);
    if (!currentSub) return res.status(404).json({ error: 'Aucun abonnement actif' });

    const newPlan     = await SubscriptionPlan.getById(plan_id);
    const currentPlan = await SubscriptionPlan.getById(currentSub.plan_id);
    if (!newPlan) return res.status(404).json({ error: 'Plan non trouvé' });

    const isSamePeriod = currentPlan.billing_period === newPlan.billing_period;
    const isUpgrade    = newPlan.price > currentPlan.price;

    if (isSamePeriod && !isUpgrade) {
      return res.status(400).json({ error: 'Ce n\'est pas un upgrade.' });
    }

    await pool.query(
      'UPDATE business_subscriptions SET status = $1 WHERE id = $2',
      ['cancelled', currentSub.id]
    );

    const startDate = new Date();
    let endDate = null;
    let nextBillingDate = null;

    if (newPlan.billing_period !== 'lifetime') {
      endDate = new Date(startDate);
      if (newPlan.billing_period === 'monthly') {
        endDate.setMonth(endDate.getMonth() + 1);
      } else if (newPlan.billing_period === 'yearly') {
        endDate.setFullYear(endDate.getFullYear() + 1);
      }
      nextBillingDate = endDate;
    }

    const subscription = await Subscription.create({
      business_id:       businessId,
      plan_id,
      start_date:        startDate,
      end_date:          endDate,
      next_billing_date: nextBillingDate,
      auto_renew:        true
    });

    if (newPlan.price > 0) {
      await pool.query(
        `INSERT INTO subscription_payments
         (subscription_id, business_id, plan_id, amount, currency, payment_status,
          payment_method, billing_period_start, billing_period_end)
         VALUES ($1, $2, $3, $4, 'XOF', 'success', 'simulation', $5, $6)`,
        [subscription.id, businessId, plan_id, newPlan.price, startDate, endDate]
      );
    }

    res.json({
      success: true,
      message: 'Changement de plan effectué avec succès',
      subscription: {
        ...subscription,
        plan_name:      newPlan.name,
        display_name:   newPlan.display_name,
        billing_period: newPlan.billing_period
      }
    });

  } catch (error) {
    console.error('Erreur upgrade:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// ANNULATION
// ─────────────────────────────────────────────────────────────

exports.cancel = async (req, res) => {
  try {
    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);
    if (!businessId) return res.status(400).json({ error: 'Aucun établissement trouvé' });

    const subscription = await Subscription.cancel(businessId);
    if (!subscription) return res.status(404).json({ error: 'Aucun abonnement actif' });

    res.json({ success: true, message: 'Abonnement annulé avec succès', subscription });

  } catch (error) {
    console.error('Erreur annulation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// STATISTIQUES D'UTILISATION
// ─────────────────────────────────────────────────────────────

exports.getUsageStats = async (req, res) => {
  try {
    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);
    if (!businessId) return res.status(400).json({ error: 'Aucun établissement trouvé' });

    const subscription = await Subscription.getByBusinessId(businessId);
    if (!subscription) return res.status(404).json({ error: 'Aucun abonnement actif' });

    const planResult = await pool.query(
      `SELECT max_special_orders_per_month, max_reservations_per_month,
              analytics_access, custom_branding, priority_support,
              can_accept_online_orders, can_accept_reservations, can_accept_special_orders,
              name AS plan_code, display_name AS plan_display_name
       FROM subscription_plans WHERE id = $1`,
      [subscription.plan_id]
    );
    if (!planResult.rows.length) return res.status(404).json({ error: 'Plan introuvable' });

    const plan = planResult.rows[0];

    const menuItems    = await pool.query(`SELECT COUNT(*) as count FROM menu_items mi JOIN menus m ON mi.menu_id = m.id WHERE m.business_id = $1`, [businessId]);
    const orders       = await pool.query(`SELECT COUNT(*) as count FROM orders WHERE business_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE) AND status != 'cancelled'`, [businessId]);
    const specialOrders = await pool.query(`SELECT COUNT(*) as count FROM special_orders WHERE business_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE) AND status != 'cancelled'`, [businessId]);
    const reservations  = await pool.query(`SELECT COUNT(*) as count FROM reservations WHERE restaurant_id = $1 AND created_at >= date_trunc('month', CURRENT_DATE) AND status != 'cancelled'`, [businessId]);
    const photos       = await pool.query(`SELECT COUNT(*) as count FROM menu_items WHERE menu_id IN (SELECT id FROM menus WHERE business_id = $1) AND image_url IS NOT NULL`, [businessId]);

    res.json({
      subscription: {
        plan_name:      subscription.display_name,
        status:         subscription.status,
        end_date:       subscription.end_date,
        billing_period: subscription.billing_period
      },
      plan: {
        name:         plan.plan_code,
        display_name: plan.plan_display_name
      },
      limits: {
        menu_items:               subscription.max_menu_items,
        orders_per_month:         subscription.max_orders_per_month,
        special_orders_per_month: plan.max_special_orders_per_month  || null,
        reservations_per_month:   plan.max_reservations_per_month    || null,
        photos:                   subscription.max_photos
      },
      usage: {
        menu_items:                parseInt(menuItems.rows[0].count),
        orders_this_month:         parseInt(orders.rows[0].count),
        special_orders_this_month: parseInt(specialOrders.rows[0].count),
        reservations_this_month:   parseInt(reservations.rows[0].count),
        photos:                    parseInt(photos.rows[0].count)
      },
      features: {
        analytics_access:          plan.analytics_access           === true,
        custom_branding:           plan.custom_branding            === true,
        priority_support:          plan.priority_support           === true,
        can_accept_online_orders:  plan.can_accept_online_orders   === true,
        can_accept_reservations:   plan.can_accept_reservations    === true,
        can_accept_special_orders: plan.can_accept_special_orders  === true
      }
    });

  } catch (error) {
    console.error('Erreur stats utilisation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// ✅ INITIER PAIEMENT ABONNEMENT (Sandbox ou CinetPay live)
// ─────────────────────────────────────────────────────────────

exports.initiateSubscriptionPayment = async (req, res) => {
  try {
    const { plan_id } = req.body;

    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);
    if (!businessId) return res.status(400).json({ error: 'Aucun établissement trouvé' });

    const plan = await SubscriptionPlan.getById(plan_id);
    if (!plan)       return res.status(404).json({ error: 'Plan introuvable' });
    if (plan.price === 0) return res.status(400).json({ error: 'Utilisez /subscribe pour les plans gratuits' });

    // ══════════════════════════════════════════════════════════
    // MODE SANDBOX — simulation immédiate, aucun appel CinetPay
    // ══════════════════════════════════════════════════════════
    if (isSandbox()) {
      console.log('[SANDBOX] Paiement abonnement simulé — plan:', plan.display_name);

      const transactionId = `SANDBOX_SUB_${businessId}_${plan_id}_${Date.now()}`;

      // Activer directement l'abonnement
      const newSub = await activateSubscriptionAfterPayment(
        { business_id: businessId, plan_id },
        transactionId
      );

      return res.json({
        success:        true,
        sandbox:        true,
        payment_url:    null,
        transaction_id: transactionId,
        amount:         plan.price,
        plan_name:      plan.display_name,
        subscription:   newSub,
        message:        `[SANDBOX] Abonnement ${plan.display_name} activé immédiatement`
      });
    }

    // ══════════════════════════════════════════════════════════
    // MODE LIVE — Flow CinetPay réel
    // ══════════════════════════════════════════════════════════
    const businessResult = await pool.query(
      `SELECT b.*, u.email, u.first_name, u.last_name, u.phone
       FROM businesses b JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [businessId]
    );
    if (!businessResult.rows[0]) return res.status(404).json({ error: 'Établissement introuvable' });
    const business = businessResult.rows[0];

    const transactionId = `SUB_${businessId}_${plan_id}_${Date.now()}`;

    // Sauvegarder la tentative (subscription_id NULL car pas encore activé)
    await pool.query(
      `INSERT INTO subscription_payments
       (subscription_id, business_id, plan_id, amount, currency, payment_status,
        payment_method, transaction_id, billing_period_start, billing_period_end)
       VALUES (NULL, $1, $2, $3, 'XOF', 'pending', 'cinetpay', $4, NOW(), NOW())`,
      [businessId, plan_id, plan.price, transactionId]
    );

    // Construire le payload CinetPay
    const appUrl = getAppBaseUrl();
    const apiUrl = getApiBaseUrl();

    const cinetpayPayload = {
      apikey:                process.env.CINETPAY_API_KEY,
      site_id:               process.env.CINETPAY_SITE_ID,
      transaction_id:        transactionId,
      amount:                plan.price,
      currency:              'XOF',
      description:           `Abonnement ${plan.display_name} — ${business.name}`,
      return_url:            `${appUrl}/restaurant/dashboard?tab=subscription&payment=return&tx=${transactionId}`,
      notify_url:            `${apiUrl}/api/subscriptions/payment-notify`,
      customer_name:         `${business.first_name} ${business.last_name}`,
      customer_email:        business.email,
      customer_phone_number: business.phone || '',
      customer_address:      business.address || '',
      customer_city:         'Lomé',
      customer_country:      'TG',
      customer_state:        'TG',
      customer_zip_code:     '00228',
      channels:              'ALL',
      metadata:              JSON.stringify({ businessId, plan_id, transactionId }),
    };

    const cpResponse = await axios.post(
      'https://api-checkout.cinetpay.com/v2/payment',
      cinetpayPayload,
      { headers: { 'Content-Type': 'application/json' }, timeout: 15000 }
    );

    const cpData = cpResponse.data;
    if (cpData.code !== '201') {
      console.error('CinetPay erreur:', cpData);
      return res.status(400).json({
        error:  'Impossible d\'initier le paiement CinetPay',
        detail: cpData.message || cpData.description,
      });
    }

    return res.json({
      success:        true,
      sandbox:        false,
      payment_url:    cpData.data.payment_url,
      transaction_id: transactionId,
      amount:         plan.price,
      plan_name:      plan.display_name,
    });

  } catch (error) {
    const detail = error.response?.data || error.message;
    console.error('Erreur initiation paiement abonnement:', detail);
    res.status(500).json({ error: 'Erreur serveur', message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────
// ✅ WEBHOOK CINETPAY
// ─────────────────────────────────────────────────────────────

exports.handlePaymentNotify = async (req, res) => {
  try {
    const { cpm_trans_id } = req.body;
    if (!cpm_trans_id) return res.status(400).json({ error: 'transaction_id manquant' });

    // Vérifier auprès de CinetPay
    const verifyResponse = await axios.post(
      'https://api-checkout.cinetpay.com/v2/payment/check',
      {
        apikey:         process.env.CINETPAY_API_KEY,
        site_id:        process.env.CINETPAY_SITE_ID,
        transaction_id: cpm_trans_id,
      },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );

    const verifyData = verifyResponse.data;

    const paymentResult = await pool.query(
      `SELECT * FROM subscription_payments WHERE transaction_id = $1 AND payment_status = 'pending' LIMIT 1`,
      [cpm_trans_id]
    );
    if (!paymentResult.rows[0]) return res.json({ message: 'Déjà traité' });

    const payment = paymentResult.rows[0];

    if (verifyData.code === '00' && verifyData.data?.status === 'ACCEPTED') {
      await activateSubscriptionAfterPayment(payment, cpm_trans_id);
      return res.json({ message: 'OK' });
    } else {
      await pool.query(
        `UPDATE subscription_payments SET payment_status = 'failed', updated_at = NOW() WHERE transaction_id = $1`,
        [cpm_trans_id]
      );
      return res.json({ message: 'Paiement refusé' });
    }

  } catch (error) {
    console.error('Erreur webhook:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// ✅ VÉRIFIER STATUT PAIEMENT (polling frontend)
// ─────────────────────────────────────────────────────────────

exports.checkPaymentStatus = async (req, res) => {
  try {
    const { transaction_id } = req.params;

    let businessId = req.user.business_id;
    if (!businessId) businessId = await getBusinessIdFromUser(req.user.id);

    // ── Sandbox : transaction déjà activée ──────────────────
    if (transaction_id.startsWith('SANDBOX_SUB_')) {
      const result = await pool.query(
        `SELECT sp_pay.payment_status, sp.display_name as plan_name
         FROM subscription_payments sp_pay
         JOIN subscription_plans sp ON sp_pay.plan_id = sp.id
         WHERE sp_pay.transaction_id = $1 LIMIT 1`,
        [transaction_id]
      );
      if (result.rows[0]) {
        return res.json({ status: result.rows[0].payment_status === 'success' ? 'success' : 'pending', plan_name: result.rows[0].plan_name });
      }
      return res.json({ status: 'success', plan_name: 'Plan activé' });
    }

    // ── Live : vérification réelle ───────────────────────────
    const result = await pool.query(
      `SELECT sp_pay.payment_status, sp_pay.plan_id, sp.display_name as plan_name
       FROM subscription_payments sp_pay
       JOIN subscription_plans sp ON sp_pay.plan_id = sp.id
       WHERE sp_pay.transaction_id = $1 AND sp_pay.business_id = $2 LIMIT 1`,
      [transaction_id, businessId]
    );

    if (!result.rows[0]) return res.status(404).json({ error: 'Transaction introuvable' });

    const payment = result.rows[0];

    // Si déjà résolu en base, renvoyer directement
    if (payment.payment_status === 'success') {
      return res.json({ status: 'success', plan_name: payment.plan_name });
    }
    if (payment.payment_status === 'failed') {
      return res.json({ status: 'failed', plan_name: payment.plan_name });
    }

    // Encore pending → vérifier CinetPay
    try {
      const verifyResponse = await axios.post(
        'https://api-checkout.cinetpay.com/v2/payment/check',
        {
          apikey:         process.env.CINETPAY_API_KEY,
          site_id:        process.env.CINETPAY_SITE_ID,
          transaction_id: transaction_id,
        },
        { headers: { 'Content-Type': 'application/json' }, timeout: 8000 }
      );

      const verifyData = verifyResponse.data;

      if (verifyData.code === '00' && verifyData.data?.status === 'ACCEPTED') {
        const freshPayment = await pool.query(
          `SELECT * FROM subscription_payments WHERE transaction_id = $1 LIMIT 1`,
          [transaction_id]
        );
        if (freshPayment.rows[0]?.payment_status === 'pending') {
          await activateSubscriptionAfterPayment(freshPayment.rows[0], transaction_id);
        }
        return res.json({ status: 'success', plan_name: payment.plan_name });
      }

      if (verifyData.data?.status === 'REFUSED' || verifyData.data?.status === 'CANCELLED') {
        await pool.query(
          `UPDATE subscription_payments SET payment_status = 'failed', updated_at = NOW() WHERE transaction_id = $1`,
          [transaction_id]
        );
        return res.json({ status: 'failed', plan_name: payment.plan_name });
      }
    } catch (verifyErr) {
      console.error('Erreur vérification CinetPay:', verifyErr.message);
    }

    return res.json({ status: 'pending', plan_name: payment.plan_name });

  } catch (error) {
    console.error('Erreur checkPaymentStatus:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ─────────────────────────────────────────────────────────────
// HELPER : activer l'abonnement après paiement confirmé
// ─────────────────────────────────────────────────────────────

async function activateSubscriptionAfterPayment(payment, transactionId) {
  const { business_id, plan_id } = payment;

  const plan = await SubscriptionPlan.getById(plan_id);
  if (!plan) throw new Error('Plan introuvable');

  // Annuler l'abonnement existant
  const currentSub = await Subscription.getByBusinessId(business_id);
  if (currentSub) {
    await pool.query(
      'UPDATE business_subscriptions SET status = $1 WHERE id = $2',
      ['cancelled', currentSub.id]
    );
  }

  const startDate = new Date();
  let endDate = null;
  let nextBillingDate = null;

  if (plan.billing_period !== 'lifetime') {
    endDate = new Date(startDate);
    if (plan.billing_period === 'monthly') {
      endDate.setMonth(endDate.getMonth() + 1);
    } else if (plan.billing_period === 'yearly') {
      endDate.setFullYear(endDate.getFullYear() + 1);
    }
    nextBillingDate = endDate;
  }

  const newSub = await Subscription.create({
    business_id,
    plan_id,
    start_date:        startDate,
    end_date:          endDate,
    next_billing_date: nextBillingDate,
    auto_renew:        true,
  });

  // Marquer le paiement comme success et lier l'abonnement
  await pool.query(
    `UPDATE subscription_payments
     SET payment_status = 'success',
         subscription_id = $1,
         billing_period_start = $2,
         billing_period_end   = $3,
         updated_at = NOW()
     WHERE transaction_id = $4`,
    [newSub.id, startDate, endDate, transactionId]
  );

  // Si pas encore de ligne en base pour sandbox (INSERT au lieu de UPDATE)
  const existing = await pool.query(
    `SELECT id FROM subscription_payments WHERE transaction_id = $1`,
    [transactionId]
  );
  if (!existing.rows.length) {
    await pool.query(
      `INSERT INTO subscription_payments
       (subscription_id, business_id, plan_id, amount, currency, payment_status,
        payment_method, transaction_id, billing_period_start, billing_period_end)
       VALUES ($1, $2, $3, $4, 'XOF', 'success', 'sandbox', $5, $6, $7)`,
      [newSub.id, business_id, plan_id, plan.price, transactionId, startDate, endDate]
    );
  }

  console.log(`✅ Abonnement activé: business=${business_id} plan=${plan_id} sub=${newSub.id} tx=${transactionId}`);
  return newSub;
}

// ─────────────────────────────────────────────────────────────
// ADMIN
// ─────────────────────────────────────────────────────────────

exports.getAllSubscriptions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query  = `SELECT bs.*, b.name as business_name, sp.display_name as plan_name, sp.price as plan_price, sp.billing_period FROM business_subscriptions bs JOIN businesses b ON bs.business_id = b.id JOIN subscription_plans sp ON bs.plan_id = sp.id`;
    const params = [];
    if (status) { query += ' WHERE bs.status = $1'; params.push(status); }
    query += ` ORDER BY bs.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    let countQuery = 'SELECT COUNT(*) FROM business_subscriptions';
    const countParams = [];
    if (status) { countQuery += ' WHERE status = $1'; countParams.push(status); }
    const countResult = await pool.query(countQuery, countParams);

    res.json({
      subscriptions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page:  parseInt(page),
      limit: parseInt(limit)
    });
  } catch (error) {
    console.error('Erreur liste abonnements:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.getExpiringSubscriptions = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const subscriptions = await Subscription.getExpiring(days);
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.getSubscriptionStats = async (req, res) => {
  try {
    const planStats   = await pool.query(`SELECT sp.display_name, sp.price, sp.billing_period, COUNT(bs.id) as active_subscriptions, SUM(sp.price) as total_revenue FROM subscription_plans sp LEFT JOIN business_subscriptions bs ON sp.id = bs.plan_id AND bs.status = 'active' GROUP BY sp.id, sp.display_name, sp.price, sp.billing_period ORDER BY sp.price DESC`);
    const totalActive = await pool.query(`SELECT COUNT(*) as count FROM business_subscriptions WHERE status = 'active'`);
    const monthlyRev  = await pool.query(`SELECT COALESCE(SUM(sp.price),0) as monthly_revenue FROM business_subscriptions bs JOIN subscription_plans sp ON bs.plan_id = sp.id WHERE bs.status = 'active' AND sp.billing_period = 'monthly'`);
    const yearlyRev   = await pool.query(`SELECT COALESCE(SUM(sp.price),0) as yearly_revenue FROM business_subscriptions bs JOIN subscription_plans sp ON bs.plan_id = sp.id WHERE bs.status = 'active' AND sp.billing_period = 'yearly'`);

    res.json({
      success: true,
      data: {
        total_active_subscriptions: parseInt(totalActive.rows[0].count),
        monthly_revenue: parseFloat(monthlyRev.rows[0].monthly_revenue),
        yearly_revenue:  parseFloat(yearlyRev.rows[0].yearly_revenue),
        plans_breakdown: planStats.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

exports.getPlatformCommissionStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    const dateFilters = {
      day:   "AND o.created_at >= CURRENT_DATE",
      week:  "AND o.created_at >= date_trunc('week', CURRENT_DATE)",
      month: "AND o.created_at >= date_trunc('month', CURRENT_DATE)",
      year:  "AND o.created_at >= date_trunc('year', CURRENT_DATE)"
    };
    const dateFilter = dateFilters[period] || dateFilters.month;

    const commissions = await pool.query(`
      SELECT b.name as business_name, b.type as business_type, sp.commission_rate,
             COUNT(o.id) as total_orders, COALESCE(SUM(o.total_amount), 0) as total_sales,
             COALESCE(SUM(o.total_amount * sp.commission_rate / 100), 0) as total_commission
      FROM businesses b
      LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
      LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
      LEFT JOIN orders o ON b.id = o.business_id AND o.payment_status = 'paid' ${dateFilter}
      GROUP BY b.id, b.name, b.type, sp.commission_rate HAVING COUNT(o.id) > 0 ORDER BY total_commission DESC`);

    const total = await pool.query(`
      SELECT COALESCE(SUM(o.total_amount * sp.commission_rate / 100), 0) as total_commission,
             COUNT(DISTINCT o.id) as total_orders, COALESCE(SUM(o.total_amount), 0) as total_sales
      FROM orders o JOIN businesses b ON o.business_id = b.id
      LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
      LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
      WHERE o.payment_status = 'paid' ${dateFilter}`);

    res.json({
      success: true,
      data: {
        period,
        total_commission: parseFloat(total.rows[0].total_commission),
        total_orders:     parseInt(total.rows[0].total_orders),
        total_sales:      parseFloat(total.rows[0].total_sales),
        businesses:       commissions.rows
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

exports.createPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json(plan);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.updatePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.update(req.params.id, req.body);
    if (!plan) return res.status(404).json({ error: 'Plan non trouvé' });
    res.json(plan);
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

exports.expireOverdue = async (req, res) => {
  try {
    const expired = await expireOverdueSubscriptions();
    res.json({
      success: true,
      message: `${expired.length} abonnement(s) expiré(s)`,
      expired
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};