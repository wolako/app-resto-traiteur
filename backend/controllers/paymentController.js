const Payment = require('../models/Payment');
const Order   = require('../models/Order');
const Business = require('../models/Business');
const { cinetpayService } = require('../services/cinetpayService');
const { HTTP_STATUS, ERROR_CODES, PAYMENT_STATUS, VALID_PAYMENT_METHODS } = require('../config/constants');
const { asyncHandler }       = require('../middleware/errorHandler');
const logger                 = require('../utils/logger');
const notificationService    = require('../services/notificationService');
const orderReceiptService    = require('../services/orderReceiptService');
const { pool }               = require('../config/db');
const Subscription           = require('../models/Subscription');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER : envoyer le reçu après paiement réussi
// ─────────────────────────────────────────────────────────────────────────────
async function _sendReceiptAfterPayment(orderId) {
  try {
    const result = await pool.query(
      `SELECT o.*, u.phone AS user_phone, u.email AS user_email
       FROM orders o
       LEFT JOIN users u ON o.client_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );
    if (result.rows.length === 0) return;

    const order = result.rows[0];
    const clientInfo = {
      email:      order.client_email || order.user_email,
      phone:      order.client_phone || order.user_phone,
      first_name: order.client_name,
      user_id:    order.client_id || null,
    };

    await orderReceiptService.sendOrderReceipt(orderId, clientInfo);
    logger.info(`[Reçu] ✅ Envoyé pour commande #${orderId}`);
  } catch (err) {
    logger.error(`[Reçu] ❌ Erreur commande #${orderId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// ✅ HELPER : Création commission avec SPLIT AUTOMATIQUE
// ─────────────────────────────────────────────────────────────────────────────
async function _createCommissionWithSplit(orderId, orderAmount, businessId, isSplitCompleted = false) {
  try {
    const existing = await pool.query(
      'SELECT id FROM commissions WHERE order_id = $1',
      [orderId]
    );
    if (existing.rows.length > 0) {
      logger.info(`Commission déjà existante pour commande #${orderId}`);
      return;
    }

    const subscription = await Subscription.getBusinessSubscription(businessId);
    const commissionRate = subscription?.commission_rate ?? 5.0;
    
    const commissionAmount = Math.round(orderAmount * (commissionRate / 100));
    const restaurantAmount = orderAmount - commissionAmount;
    
    await pool.query(
      `INSERT INTO commissions (
        business_id, order_id, order_amount,
        commission_rate, commission_amount,
        restaurant_amount, platform_amount,
        status, payment_split_completed
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        businessId, orderId, orderAmount,
        commissionRate, commissionAmount,
        restaurantAmount,
        commissionAmount,
        isSplitCompleted ? 'collected' : 'pending',
        isSplitCompleted
      ]
    );
    
    logger.info(`✅ Commission split: Restaurant=${restaurantAmount}, Platform=${commissionAmount} (${commissionRate}%)`);
  } catch (err) {
    logger.error(`❌ Erreur création commission #${orderId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
function validatePaymentMethod(method) {
  if (!method) return 'La méthode de paiement est requise';
  if (!VALID_PAYMENT_METHODS.includes(method)) {
    return `Méthode invalide. Valeurs acceptées : ${VALID_PAYMENT_METHODS.join(', ')}`;
  }
  return null;
}

const isSandbox = () => process.env.PAYMENT_MODE === 'sandbox';

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/initiate - AVEC SPLIT PAYMENT
// ═════════════════════════════════════════════════════════════════════════════
const initiatePayment = asyncHandler(async (req, res) => {
  const {
    order_id, amount, currency, payment_method,
    customer_name, customer_phone, customer_email,
  } = req.body;

  const methodError = validatePaymentMethod(payment_method);
  if (methodError) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: methodError, code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const order = await Order.findById(order_id);
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Commande introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  const existingPayment = await Payment.findByOrderId(order_id);
  if (existingPayment && existingPayment.status === PAYMENT_STATUS.PENDING) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'Un paiement est déjà en cours pour cette commande',
      code: ERROR_CODES.CONFLICT,
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE SANDBOX - SPLIT AUTOMATIQUE SIMULÉ
  // ══════════════════════════════════════════════════════════════════════════
  if (isSandbox()) {
    logger.info(`[SANDBOX] Paiement simulé commande #${order_id} (${payment_method})`);
    const fakePaymentId = `SANDBOX_${order_id}_${Date.now()}`;

    try {
      await Payment.create({
        order_id,
        payment_id:     fakePaymentId,
        amount:         amount || order.total_amount,
        currency:       currency || 'XOF',
        payment_method,
        status:         PAYMENT_STATUS.PAID,
      });

      await Order.updatePaymentStatus(order_id, PAYMENT_STATUS.PAID);

      // ✅ CRÉER COMMISSION AVEC SPLIT AUTOMATIQUE
      await _createCommissionWithSplit(
        order_id,
        amount || order.total_amount,
        order.business_id,
        true  // Split réussi en sandbox
      );

      const business = await Business.findById(order.business_id);
      if (business) {
        await notificationService.notifyPaymentSuccess(
          { id: fakePaymentId, amount: amount || order.total_amount, payment_method },
          order,
          business
        );
      }

      _sendReceiptAfterPayment(order_id).catch(err =>
        logger.error('[SANDBOX] Erreur reçu:', err.message)
      );

      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: `✅ [SANDBOX] Paiement ${payment_method} accepté avec split automatique`,
        data: {
          payment_id:   fakePaymentId,
          checkout_url: null,
          status:       PAYMENT_STATUS.PAID,
          sandbox:      true,
        },
      });
    } catch (error) {
      logger.error('[SANDBOX] Erreur:', { message: error.message });
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Erreur paiement sandbox',
        details: error.message,
      });
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // MODE PRODUCTION - CINETPAY AVEC SPLIT (À IMPLÉMENTER SELON VOTRE API)
  // ══════════════════════════════════════════════════════════════════════════
  try {
    // Récupérer le merchant ID du restaurant
    const businessResult = await pool.query(
      'SELECT cinetpay_merchant_id FROM businesses WHERE id = $1',
      [order.business_id]
    );

    const restaurantMerchantId = businessResult.rows[0]?.cinetpay_merchant_id;
    if (!restaurantMerchantId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'Le restaurant n\'a pas configuré son compte CinetPay pour le split payment'
      });
    }

    // Calculer le split
    const subscription = await Subscription.getBusinessSubscription(order.business_id);
    const commissionRate = subscription?.commission_rate ?? 5.0;
    const totalAmount = amount || order.total_amount;
    const commissionAmount = Math.round(totalAmount * (commissionRate / 100));
    const restaurantAmount = totalAmount - commissionAmount;

    const paymentResponse = await cinetpayService.initiatePayment({
      amount: totalAmount,
      currency:              currency || 'XOF',
      transaction_id:        `ORDER_${order_id}_${Date.now()}`,
      description:           `Commande #${order_id} - ${order.business_name || 'RestoTraiteur'}`,
      customer_name,
      customer_phone_number: customer_phone,
      customer_email,
      payment_method,
      
      // ✅ SPLIT CONFIG pour CinetPay (adapter selon votre API)
      split: [
        {
          merchant_id: restaurantMerchantId,
          amount: restaurantAmount,
          description: `Montant net restaurant (${commissionRate}% commission déduite)`
        },
        {
          merchant_id: process.env.CINETPAY_SITE_ID,
          amount: commissionAmount,
          description: `Commission plateforme (${commissionRate}%)`
        }
      ]
    });

    const payment = await Payment.create({
      order_id,
      payment_id:     paymentResponse.data.payment_id,
      amount: totalAmount,
      currency:       currency || 'XOF',
      payment_method,
      status:         PAYMENT_STATUS.PENDING,
    });

    // Créer commission (sera finalisée par webhook)
    await _createCommissionWithSplit(
      order_id,
      totalAmount,
      order.business_id,
      false
    );

    logger.info('Paiement initié avec split', {
      paymentId: payment.payment_id,
      orderId: order_id,
      total: totalAmount,
      restaurant: restaurantAmount,
      platform: commissionAmount
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Paiement initié avec succès',
      data: {
        payment_id:   payment.payment_id,
        checkout_url: paymentResponse.data.payment_url,
        status:       payment.status,
        sandbox:      false,
        split: {
          total: totalAmount,
          restaurant_receives: restaurantAmount,
          platform_receives: commissionAmount,
          commission_rate: commissionRate
        }
      },
    });
  } catch (error) {
    logger.error('Erreur initiation paiement', { orderId: order_id, error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de l\'initiation du paiement',
      code: ERROR_CODES.PAYMENT_ERROR,
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook/cinetpay
// ─────────────────────────────────────────────────────────────────────────────
const cinetpayWebhook = asyncHandler(async (req, res) => {
  const webhookData = req.body;
  logger.info('Webhook CinetPay reçu', { data: webhookData });

  try {
    const isValidSignature = cinetpayService.verifyWebhookSignature(
      JSON.stringify(webhookData),
      req.headers['x-cinetpay-signature']
    );
    if (!isValidSignature) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: 'Signature invalide' });
    }

    const { cpm_trans_id, cpm_result } = webhookData;
    const payment = await Payment.findByPaymentId(cpm_trans_id);
    if (!payment) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Paiement introuvable' });
    }

    const newStatus = cpm_result === '00' ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED;

    const updatedPayment = await Payment.updateStatus(
      cpm_trans_id, newStatus, webhookData.cpm_trans_status, webhookData
    );
    await Order.updatePaymentStatus(payment.order_id, newStatus);

    if (newStatus === PAYMENT_STATUS.PAID) {
      const order    = await Order.findById(payment.order_id);
      const business = await Business.findById(order.business_id);
      
      // ✅ Finaliser la commission : split réussi
      await pool.query(
        `UPDATE commissions 
         SET status = 'collected',
             payment_split_completed = TRUE,
             collected_at = NOW()
         WHERE order_id = $1`,
        [payment.order_id]
      );

      logger.info('✅ Split payment confirmé par webhook', {
        transactionId: cpm_trans_id,
        orderId: payment.order_id
      });
      
      if (business) await notificationService.notifyPaymentSuccess(updatedPayment, order, business);
      _sendReceiptAfterPayment(payment.order_id).catch(err =>
        logger.error('[Webhook] Erreur reçu:', err.message)
      );
    }

    if (newStatus === PAYMENT_STATUS.FAILED) {
      const order    = await Order.findById(payment.order_id);
      const business = await Business.findById(order.business_id);
      if (business) {
        await notificationService.createNotification({
          business_id:    business.id,
          type:           'payment_failed',
          title:          'Paiement échoué',
          message:        `Paiement de ${updatedPayment.amount} FCFA pour commande #${order.id} échoué`,
          reference_id:   updatedPayment.id,
          reference_type: 'payment',
          priority:       'high',
        });
      }
    }

    res.json({ success: true, message: 'Webhook traité' });
  } catch (error) {
    logger.error('Erreur webhook CinetPay', { error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur webhook' });
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// POST /api/payments/webhook/cinetpay/deposit - WEBHOOK ACOMPTES COMMANDES SPÉCIALES
// ═════════════════════════════════════════════════════════════════════════════
const cinetpayDepositWebhook = asyncHandler(async (req, res) => {
  const {
    cpm_trans_id,        // ID transaction CinetPay
    cpm_custom,          // Notre order_id (format: SPECIAL-DEPOSIT-123-timestamp)
    cpm_amount,          // Montant payé
    cpm_currency,        // Devise (XOF)
    payment_method,      // Méthode utilisée
    cpm_trans_status,    // ACCEPTED ou REFUSED
    signature            // Signature de sécurité
  } = req.body;

  logger.info('Webhook CinetPay acompte reçu', {
    transactionId: cpm_trans_id,
    customId: cpm_custom,
    amount: cpm_amount,
    status: cpm_trans_status
  });

  try {
    // ✅ Vérifier signature (sécurité importante !)
    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHash('sha256')
      .update(cpm_trans_id + cpm_amount + process.env.CINETPAY_API_KEY)
      .digest('hex');

    if (signature !== expectedSignature) {
      logger.error('Signature invalide webhook CinetPay', { 
        received: signature, 
        expected: expectedSignature 
      });
      return res.status(403).json({ 
        success: false, 
        error: 'Signature invalide' 
      });
    }

    // ✅ Extraire l'order_id (format: SPECIAL-DEPOSIT-123-1234567890 → 123)
    const parts = cpm_custom.split('-');
    const orderId = parseInt(parts[2]); // Position 2 = l'ID
    
    if (!orderId) {
      logger.error('Order ID invalide dans webhook', { cpm_custom });
      return res.status(400).json({ 
        success: false, 
        error: 'Order ID invalide' 
      });
    }

    // ✅ Récupérer la commande spéciale
    const SpecialOrder = require('../models/SpecialOrder');
    const specialOrder = await SpecialOrder.findById(orderId);
    
    if (!specialOrder) {
      logger.error('Commande introuvable pour webhook', { orderId });
      return res.status(404).json({ 
        success: false, 
        error: 'Commande introuvable' 
      });
    }

    // ✅ PAIEMENT ACCEPTÉ
    if (cpm_trans_status === 'ACCEPTED') {
      
      // Mettre à jour le statut acompte
      await pool.query(
        `UPDATE special_orders 
         SET deposit_status = 'paid',
             deposit_payment_id = $1,
             deposit_paid_at = NOW(),
             status = 'confirmed',
             updated_at = NOW()
         WHERE id = $2`,
        [cpm_trans_id, orderId]
      );

      // ✅ Notification au traiteur
      const business = await Business.findById(specialOrder.business_id);
      if (business && business.user_id) {
        await notificationService.createNotification({
          user_id: business.user_id,
          type: 'deposit_paid',
          title: '✅ Acompte reçu !',
          message: `${specialOrder.client_name} a payé l'acompte de ${parseInt(cpm_amount).toLocaleString('fr-FR')} FCFA pour ${specialOrder.event_type}`,
          reference_id: orderId,
          reference_type: 'special_order',
          priority: 'high',
          metadata: {
            amount: cpm_amount,
            transaction_id: cpm_trans_id,
            payment_method
          }
        });
      }

      // ✅ Email de confirmation au traiteur
      const { emailService } = require('../services/emailService');
      if (business && business.email) {
        await emailService.sendEmail({
          to: business.email,
          subject: `✅ Acompte reçu - Commande #SP-${orderId}`,
          html: `
            <h2>Acompte reçu avec succès !</h2>
            <p>Bonjour,</p>
            <p>L'acompte de <strong>${parseInt(cpm_amount).toLocaleString('fr-FR')} FCFA</strong> a été payé par <strong>${specialOrder.client_name}</strong>.</p>
            <p><strong>Détails :</strong></p>
            <ul>
              <li>Commande : #SP-${orderId}</li>
              <li>Événement : ${specialOrder.event_type}</li>
              <li>Date : ${new Date(specialOrder.event_date).toLocaleDateString('fr-FR')}</li>
              <li>Invités : ${specialOrder.number_of_guests} personnes</li>
              <li>Transaction : ${cpm_trans_id}</li>
            </ul>
            <p>La commande est maintenant <strong>confirmée</strong>.</p>
          `
        });
      }

      // ✅ Notification au client (si connecté)
      if (specialOrder.client_id) {
        await notificationService.createNotification({
          user_id: specialOrder.client_id,
          type: 'payment_success',
          title: '✅ Paiement confirmé',
          message: `Votre acompte de ${parseInt(cpm_amount).toLocaleString('fr-FR')} FCFA a été confirmé. Votre commande est maintenant garantie !`,
          reference_id: orderId,
          reference_type: 'special_order',
          priority: 'high'
        });
      }

      // ✅ Email de confirmation au client
      if (specialOrder.client_email && business) {
        await emailService.sendEmail({
          to: specialOrder.client_email,
          subject: `✅ Paiement confirmé - ${business.name}`,
          html: `
            <h2>Votre acompte a été confirmé !</h2>
            <p>Bonjour <strong>${specialOrder.client_name}</strong>,</p>
            <p>Nous avons bien reçu votre acompte de <strong>${parseInt(cpm_amount).toLocaleString('fr-FR')} FCFA</strong>.</p>
            <p>Votre commande pour <strong>${specialOrder.event_type}</strong> le <strong>${new Date(specialOrder.event_date).toLocaleDateString('fr-FR')}</strong> est maintenant <strong>confirmée</strong> ! 🎉</p>
            <p><strong>Solde à payer le jour J :</strong> ${(specialOrder.final_amount - specialOrder.deposit_amount).toLocaleString('fr-FR')} FCFA</p>
            <p>Merci pour votre confiance !<br>${business.name}</p>
          `
        });
      }

      logger.info('Acompte confirmé via webhook', {
        orderId,
        transactionId: cpm_trans_id,
        amount: cpm_amount
      });

      return res.json({ 
        success: true, 
        message: 'Acompte confirmé' 
      });
    }

    // ✅ PAIEMENT REFUSÉ
    if (cpm_trans_status === 'REFUSED') {
      
      await pool.query(
        `UPDATE special_orders 
         SET deposit_status = 'failed',
             deposit_payment_id = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [cpm_trans_id, orderId]
      );

      // Notification au client
      if (specialOrder.client_id) {
        await notificationService.createNotification({
          user_id: specialOrder.client_id,
          type: 'payment_failed',
          title: '❌ Paiement échoué',
          message: 'Le paiement de votre acompte a échoué. Veuillez réessayer.',
          reference_id: orderId,
          reference_type: 'special_order',
          priority: 'high'
        });
      }

      logger.warn('Paiement acompte refusé', {
        orderId,
        transactionId: cpm_trans_id
      });

      return res.json({ 
        success: true, 
        message: 'Paiement refusé enregistré' 
      });
    }

    // Statut inconnu
    logger.warn('Statut paiement inconnu dans webhook', {
      status: cpm_trans_status,
      orderId
    });

    return res.json({ 
      success: true, 
      message: 'Webhook traité' 
    });

  } catch (error) {
    logger.error('Erreur webhook CinetPay acompte:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Erreur serveur' 
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/status/:paymentId
// ─────────────────────────────────────────────────────────────────────────────
const getPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await Payment.findByPaymentId(paymentId);
  if (!payment) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Paiement introuvable' });
  }

  if (isSandbox() || paymentId.startsWith('SANDBOX_')) {
    return res.json({
      success: true,
      data: {
        payment_id:     paymentId,
        status:         payment.status,
        amount:         payment.amount,
        currency:       payment.currency,
        payment_method: payment.payment_method,
        sandbox:        true,
      },
    });
  }

  try {
    const cinetpayStatus = await cinetpayService.checkPaymentStatus(paymentId);
    const statusMap = { ACCEPTED: PAYMENT_STATUS.PAID, REFUSED: PAYMENT_STATUS.FAILED };
    const newStatus = statusMap[cinetpayStatus.data.payment_status] || PAYMENT_STATUS.PENDING;

    if (payment.status !== newStatus) {
      await Payment.updateStatus(paymentId, newStatus, null, cinetpayStatus.data);
      await Order.updatePaymentStatus(payment.order_id, newStatus);

      if (newStatus === PAYMENT_STATUS.PAID) {
        const order    = await Order.findById(payment.order_id);
        const business = await Business.findById(order.business_id);
        
        // Finaliser commission
        await pool.query(
          `UPDATE commissions 
           SET status = 'collected',
               payment_split_completed = TRUE,
               collected_at = NOW()
           WHERE order_id = $1`,
          [payment.order_id]
        );
        
        if (business) await notificationService.notifyPaymentSuccess(payment, order, business);
        _sendReceiptAfterPayment(payment.order_id).catch(err =>
          logger.error('[VerifyStatus] Erreur reçu:', err.message)
        );
      }
    }

    return res.json({
      success: true,
      data: {
        payment_id:     paymentId,
        status:         newStatus,
        amount:         payment.amount,
        currency:       payment.currency,
        payment_method: payment.payment_method,
        sandbox:        false,
      },
    });
  } catch (error) {
    logger.error('Erreur vérification statut', { paymentId, error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur vérification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints divers (inchangés)
// ─────────────────────────────────────────────────────────────────────────────
const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPaymentId(req.params.id);
  if (!payment) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Introuvable' });
  res.json({ success: true, data: payment });
});

const getBusinessPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.getByBusinessId(req.params.businessId);
  res.json({ success: true, data: payments });
});

const getAllPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.getAll();
  res.json({ success: true, data: payments });
});

const getPaymentStatistics = asyncHandler(async (req, res) => {
  const businessId = req.query.business_id || req.business?.id;
  const statistics = await Payment.getStatistics(businessId);
  res.json({ success: true, data: statistics });
});

module.exports = {
  initiatePayment,
  cinetpayWebhook,
  cinetpayDepositWebhook,
  getPaymentStatus,
  getPaymentById,
  getBusinessPayments,
  getAllPayments,
  getPaymentStatistics,
};