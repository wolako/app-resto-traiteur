const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const Business = require('../models/Business');
const pool = require('../config/db');

// Obtenir tous les plans d'abonnement
exports.getAllPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.getAll();
    res.json(plans);
  } catch (error) {
    console.error('Erreur récupération plans:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir un plan par ID
exports.getPlanById = async (req, res) => {
  try {
    const { id } = req.params;
    const plan = await SubscriptionPlan.getById(id);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan non trouvé' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('Erreur récupération plan:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ✅ HELPER: Récupérer le business_id de l'utilisateur
async function getBusinessIdFromUser(userId) {
  const result = await pool.query(
    'SELECT id FROM businesses WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  return result.rows[0]?.id || null;
}

// Obtenir l'abonnement actuel du restaurant
exports.getCurrentSubscription = async (req, res) => {
  try {
    // ✅ CORRECTION: Récupérer le business_id via l'user_id
    let businessId = req.user.business_id;
    
    if (!businessId) {
      businessId = await getBusinessIdFromUser(req.user.id);
    }
    
    if (!businessId) {
      return res.status(400).json({ 
        error: 'Aucun établissement trouvé pour cet utilisateur' 
      });
    }
    
    const subscription = await Subscription.getByBusinessId(businessId);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Aucun abonnement actif' });
    }
    
    res.json(subscription);
  } catch (error) {
    console.error('Erreur récupération abonnement:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ✅ CORRECTION: Souscrire à un plan avec simulation de paiement
exports.subscribe = async (req, res) => {
  try {
    const { plan_id, simulate_payment = true } = req.body;
    
    // ✅ CORRECTION: Récupérer le business_id via l'user_id
    let businessId = req.user.business_id;
    
    if (!businessId) {
      businessId = await getBusinessIdFromUser(req.user.id);
    }
    
    if (!businessId) {
      return res.status(400).json({ 
        error: 'Aucun établissement trouvé pour cet utilisateur' 
      });
    }
    
    console.log('📝 Souscription:', { userId: req.user.id, businessId, plan_id });
    
    // Vérifier si le plan existe
    const plan = await SubscriptionPlan.getById(plan_id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan non trouvé' });
    }
    
    // Annuler l'abonnement actuel s'il existe
    const currentSub = await Subscription.getByBusinessId(businessId);
    if (currentSub) {
      await pool.query(
        'UPDATE business_subscriptions SET status = $1 WHERE id = $2',
        ['cancelled', currentSub.id]
      );
      console.log('✅ Ancien abonnement annulé:', currentSub.id);
    }
    
    // Calculer les dates
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
    
    // Créer le nouvel abonnement
    const subscription = await Subscription.create({
      business_id: businessId,
      plan_id: plan_id,
      start_date: startDate,
      end_date: endDate,
      next_billing_date: nextBillingDate,
      auto_renew: true
    });
    
    console.log('✅ Nouvel abonnement créé:', subscription.id);
    
    // Si le plan n'est pas gratuit, gérer le paiement
    if (plan.price > 0) {
      if (simulate_payment) {
        // 🆕 SIMULATION DE PAIEMENT
        await pool.query(
          `INSERT INTO subscription_payments 
           (subscription_id, business_id, plan_id, amount, currency, payment_status, 
            payment_method, billing_period_start, billing_period_end)
           VALUES ($1, $2, $3, $4, 'XOF', 'success', 'simulation', $5, $6)`,
          [subscription.id, businessId, plan_id, plan.price, startDate, endDate]
        );
        
        console.log('✅ Paiement simulé avec succès pour l\'abonnement:', subscription.id);
      } else {
        // Paiement réel via CinetPay (à implémenter)
        await pool.query(
          `INSERT INTO subscription_payments 
           (subscription_id, business_id, plan_id, amount, currency, payment_status, 
            billing_period_start, billing_period_end)
           VALUES ($1, $2, $3, $4, 'XOF', 'pending', $5, $6)`,
          [subscription.id, businessId, plan_id, plan.price, startDate, endDate]
        );
      }
    }
    
    res.status(201).json({
      success: true,
      message: 'Abonnement créé avec succès',
      subscription: {
        ...subscription,
        plan_name: plan.name,
        display_name: plan.display_name,
        billing_period: plan.billing_period
      }
    });
    
  } catch (error) {
    console.error('Erreur souscription:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erreur serveur',
      message: error.message 
    });
  }
};

// ✅ CORRECTION: Upgrade vers un plan supérieur
exports.upgrade = async (req, res) => {
  try {
    const { plan_id, simulate_payment = true } = req.body;
    
    // ✅ CORRECTION: Récupérer le business_id via l'user_id
    let businessId = req.user.business_id;
    
    if (!businessId) {
      businessId = await getBusinessIdFromUser(req.user.id);
    }
    
    if (!businessId) {
      return res.status(400).json({ 
        error: 'Aucun établissement trouvé pour cet utilisateur' 
      });
    }
    
    // Récupérer l'abonnement actuel
    const currentSub = await Subscription.getByBusinessId(businessId);
    if (!currentSub) {
      return res.status(404).json({ error: 'Aucun abonnement actif' });
    }
    
    // Récupérer les plans
    const newPlan = await SubscriptionPlan.getById(plan_id);
    const currentPlan = await SubscriptionPlan.getById(currentSub.plan_id);
    
    if (!newPlan) {
      return res.status(404).json({ error: 'Plan non trouvé' });
    }
    
    // Permettre le changement de période (monthly <-> yearly)
    const isSamePeriod = currentPlan.billing_period === newPlan.billing_period;
    const isUpgrade = newPlan.price > currentPlan.price;
    
    if (isSamePeriod && !isUpgrade) {
      return res.status(400).json({ 
        error: 'Ce n\'est pas un upgrade. Le nouveau plan doit avoir un prix supérieur.' 
      });
    }
    
    // Annuler l'ancien abonnement
    await pool.query(
      'UPDATE business_subscriptions SET status = $1 WHERE id = $2',
      ['cancelled', currentSub.id]
    );
    
    // Créer le nouvel abonnement
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
      business_id: businessId,
      plan_id: plan_id,
      start_date: startDate,
      end_date: endDate,
      next_billing_date: nextBillingDate,
      auto_renew: true
    });
    
    // Gérer le paiement
    if (newPlan.price > 0) {
      if (simulate_payment) {
        await pool.query(
          `INSERT INTO subscription_payments 
           (subscription_id, business_id, plan_id, amount, currency, payment_status, 
            payment_method, billing_period_start, billing_period_end)
           VALUES ($1, $2, $3, $4, 'XOF', 'success', 'simulation', $5, $6)`,
          [subscription.id, businessId, plan_id, newPlan.price, startDate, endDate]
        );
      }
    }
    
    res.json({
      success: true,
      message: isSamePeriod 
        ? 'Upgrade effectué avec succès'
        : 'Changement de plan effectué avec succès',
      subscription: {
        ...subscription,
        plan_name: newPlan.name,
        display_name: newPlan.display_name,
        billing_period: newPlan.billing_period
      }
    });
    
  } catch (error) {
    console.error('Erreur upgrade:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Annuler l'abonnement
exports.cancel = async (req, res) => {
  try {
    // ✅ CORRECTION: Récupérer le business_id via l'user_id
    let businessId = req.user.business_id;
    
    if (!businessId) {
      businessId = await getBusinessIdFromUser(req.user.id);
    }
    
    if (!businessId) {
      return res.status(400).json({ 
        error: 'Aucun établissement trouvé pour cet utilisateur' 
      });
    }
    
    const subscription = await Subscription.cancel(businessId);
    
    if (!subscription) {
      return res.status(404).json({ error: 'Aucun abonnement actif' });
    }
    
    res.json({
      success: true,
      message: 'Abonnement annulé avec succès',
      subscription
    });
    
  } catch (error) {
    console.error('Erreur annulation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Statistiques d'utilisation
exports.getUsageStats = async (req, res) => {
  try {
    // ✅ CORRECTION: Récupérer le business_id via l'user_id
    let businessId = req.user.business_id;
    
    if (!businessId) {
      businessId = await getBusinessIdFromUser(req.user.id);
    }
    
    if (!businessId) {
      return res.status(400).json({ 
        error: 'Aucun établissement trouvé pour cet utilisateur' 
      });
    }
    
    const subscription = await Subscription.getByBusinessId(businessId);
    if (!subscription) {
      return res.status(404).json({ error: 'Aucun abonnement actif' });
    }
    
    // Compter les items du menu
    const menuItemsResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM menu_items mi
       JOIN menus m ON mi.menu_id = m.id
       WHERE m.business_id = $1`,
      [businessId]
    );
    
    // Compter les commandes du mois
    const ordersResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM orders 
       WHERE business_id = $1 
       AND created_at >= date_trunc('month', CURRENT_DATE)`,
      [businessId]
    );
    
    // Compter les photos
    const photosResult = await pool.query(
      `SELECT COUNT(*) as count 
       FROM menu_items 
       WHERE menu_id IN (SELECT id FROM menus WHERE business_id = $1)
       AND image_url IS NOT NULL`,
      [businessId]
    );
    
    res.json({
      subscription: {
        plan_name: subscription.display_name,
        status: subscription.status,
        end_date: subscription.end_date,
        billing_period: subscription.billing_period
      },
      limits: {
        menu_items: subscription.max_menu_items,
        orders_per_month: subscription.max_orders_per_month,
        photos: subscription.max_photos
      },
      usage: {
        menu_items: parseInt(menuItemsResult.rows[0].count),
        orders_this_month: parseInt(ordersResult.rows[0].count),
        photos: parseInt(photosResult.rows[0].count)
      }
    });
    
  } catch (error) {
    console.error('Erreur stats utilisation:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Liste tous les abonnements
exports.getAllSubscriptions = async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT bs.*, 
             b.name as business_name,
             sp.display_name as plan_name,
             sp.price as plan_price,
             sp.billing_period
      FROM business_subscriptions bs
      JOIN businesses b ON bs.business_id = b.id
      JOIN subscription_plans sp ON bs.plan_id = sp.id
    `;
    const params = [];
    
    if (status) {
      query += ' WHERE bs.status = $1';
      params.push(status);
    }
    
    query += ` ORDER BY bs.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    
    // Compter le total
    let countQuery = 'SELECT COUNT(*) FROM business_subscriptions';
    const countParams = [];
    if (status) {
      countQuery += ' WHERE status = $1';
      countParams.push(status);
    }
    const countResult = await pool.query(countQuery, countParams);
    
    res.json({
      subscriptions: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit)
    });
    
  } catch (error) {
    console.error('Erreur liste abonnements:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Abonnements expirant bientôt
exports.getExpiringSubscriptions = async (req, res) => {
  try {
    const { days = 7 } = req.query;
    const subscriptions = await Subscription.getExpiring(days);
    res.json(subscriptions);
  } catch (error) {
    console.error('Erreur abonnements expirants:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Statistiques des abonnements
exports.getSubscriptionStats = async (req, res) => {
  try {
    const planStatsQuery = `
      SELECT 
        sp.display_name,
        sp.price,
        sp.billing_period,
        COUNT(bs.id) as active_subscriptions,
        SUM(sp.price) as total_revenue
      FROM subscription_plans sp
      LEFT JOIN business_subscriptions bs ON sp.id = bs.plan_id AND bs.status = 'active'
      GROUP BY sp.id, sp.display_name, sp.price, sp.billing_period
      ORDER BY sp.price DESC
    `;
    const planStats = await pool.query(planStatsQuery);

    const totalActiveQuery = `
      SELECT COUNT(*) as count 
      FROM business_subscriptions 
      WHERE status = 'active'
    `;
    const totalActive = await pool.query(totalActiveQuery);

    const monthlyRevenueQuery = `
      SELECT COALESCE(SUM(sp.price), 0) as monthly_revenue
      FROM business_subscriptions bs
      JOIN subscription_plans sp ON bs.plan_id = sp.id
      WHERE bs.status = 'active' 
      AND sp.billing_period = 'monthly'
    `;
    const monthlyRevenue = await pool.query(monthlyRevenueQuery);

    const yearlyRevenueQuery = `
      SELECT COALESCE(SUM(sp.price), 0) as yearly_revenue
      FROM business_subscriptions bs
      JOIN subscription_plans sp ON bs.plan_id = sp.id
      WHERE bs.status = 'active' 
      AND sp.billing_period = 'yearly'
    `;
    const yearlyRevenue = await pool.query(yearlyRevenueQuery);

    res.json({
      success: true,
      data: {
        total_active_subscriptions: parseInt(totalActive.rows[0].count),
        monthly_revenue: parseFloat(monthlyRevenue.rows[0].monthly_revenue),
        yearly_revenue: parseFloat(yearlyRevenue.rows[0].yearly_revenue),
        plans_breakdown: planStats.rows
      }
    });

  } catch (error) {
    console.error('Erreur statistiques abonnements:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// Admin: Statistiques des commissions
exports.getPlatformCommissionStats = async (req, res) => {
  try {
    const { period = 'month' } = req.query;
    
    let dateFilter = '';
    switch(period) {
      case 'day':
        dateFilter = "AND o.created_at >= CURRENT_DATE";
        break;
      case 'week':
        dateFilter = "AND o.created_at >= date_trunc('week', CURRENT_DATE)";
        break;
      case 'month':
        dateFilter = "AND o.created_at >= date_trunc('month', CURRENT_DATE)";
        break;
      case 'year':
        dateFilter = "AND o.created_at >= date_trunc('year', CURRENT_DATE)";
        break;
    }

    const commissionsQuery = `
      SELECT 
        b.name as business_name,
        b.type as business_type,
        sp.commission_rate,
        COUNT(o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_sales,
        COALESCE(SUM(o.total_amount * sp.commission_rate / 100), 0) as total_commission
      FROM businesses b
      LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
      LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
      LEFT JOIN orders o ON b.id = o.business_id 
        AND o.payment_status = 'paid' 
        ${dateFilter}
      GROUP BY b.id, b.name, b.type, sp.commission_rate
      HAVING COUNT(o.id) > 0
      ORDER BY total_commission DESC
    `;
    const commissions = await pool.query(commissionsQuery);

    const totalQuery = `
      SELECT 
        COALESCE(SUM(o.total_amount * sp.commission_rate / 100), 0) as total_commission,
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(o.total_amount), 0) as total_sales
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
      LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
      WHERE o.payment_status = 'paid'
      ${dateFilter}
    `;
    const total = await pool.query(totalQuery);

    res.json({
      success: true,
      data: {
        period,
        total_commission: parseFloat(total.rows[0].total_commission),
        total_orders: parseInt(total.rows[0].total_orders),
        total_sales: parseFloat(total.rows[0].total_sales),
        businesses: commissions.rows.map(row => ({
          business_name: row.business_name,
          business_type: row.business_type,
          commission_rate: parseFloat(row.commission_rate),
          total_orders: parseInt(row.total_orders),
          total_sales: parseFloat(row.total_sales),
          total_commission: parseFloat(row.total_commission)
        }))
      }
    });

  } catch (error) {
    console.error('Erreur statistiques commissions:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// Créer un nouveau plan (admin)
exports.createPlan = async (req, res) => {
  try {
    const planData = req.body;
    const plan = await SubscriptionPlan.create(planData);
    res.status(201).json(plan);
  } catch (error) {
    console.error('Erreur création plan:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Mettre à jour un plan (admin)
exports.updatePlan = async (req, res) => {
  try {
    const { id } = req.params;
    const planData = req.body;
    const plan = await SubscriptionPlan.update(id, planData);
    
    if (!plan) {
      return res.status(404).json({ error: 'Plan non trouvé' });
    }
    
    res.json(plan);
  } catch (error) {
    console.error('Erreur mise à jour plan:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};