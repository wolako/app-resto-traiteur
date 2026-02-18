const User = require('../models/User');
const Business = require('../models/Business');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const Reservation = require('../models/Reservation');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { pool } = require('../config/db');
const { runExpiryReminders } = require('../jobs/subscriptionExpiryJob');


// =============================================
// GESTION DES UTILISATEURS
// =============================================

// Obtenir tous les utilisateurs (uniquement les clients par défaut)
const getAllUsers = asyncHandler(async (req, res) => {
  const { role, is_active } = req.query;

  // Par défaut, récupérer uniquement les clients
  const users = await User.getAll({
    role: role || 'client', // Si aucun filtre, afficher uniquement les clients
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
  });

  res.json({
    success: true,
    data: users,
  });
});

// Mettre à jour le statut d'un utilisateur
const updateUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;

  // Empêcher la désactivation du propre compte admin
  if (userId == req.user.id && !is_active) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Vous ne pouvez pas désactiver votre propre compte',
      code: ERROR_CODES.FORBIDDEN,
    });
  }

  const user = await User.updateStatus(userId, is_active);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Utilisateur introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut utilisateur mis à jour par admin', {
    targetUserId: userId,
    isActive: is_active,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: `Utilisateur ${is_active ? 'activé' : 'désactivé'}`,
    data: user,
  });
});

// Supprimer un utilisateur
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  // Empêcher la suppression du propre compte admin
  if (userId == req.user.id) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Vous ne pouvez pas supprimer votre propre compte',
      code: ERROR_CODES.FORBIDDEN,
    });
  }

  // Vérifier que l'utilisateur existe
  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Utilisateur introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  // Empêcher la suppression d'un autre superadmin
  if (user.role === 'superadmin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Vous ne pouvez pas supprimer un autre administrateur',
      code: ERROR_CODES.FORBIDDEN,
    });
  }

  await User.delete(userId);

  logger.warn('Utilisateur supprimé par admin', {
    deletedUserId: userId,
    deletedUserEmail: user.email,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: 'Utilisateur supprimé avec succès',
  });
});

// =============================================
// GESTION DES ÉTABLISSEMENTS
// =============================================

// Obtenir tous les établissements
const getAllBusinesses = asyncHandler(async (req, res) => {
  const businesses = await Business.getAllForAdmin();
  console.log('📊 Businesses from DB (first one):', businesses[0]);
  // Formatter les données pour le frontend
  const formattedBusinesses = businesses.map(b => ({
    id: b.id,
    user_id: b.user_id,
    name: b.name,
    type: b.type,
    description: b.description,
    address: b.address,
    phone: b.phone, // ✅ Téléphone inclus
    opening_hour: b.opening_hour,
    closing_hour: b.closing_hour,
    availability_start: b.availability_start,
    availability_end: b.availability_end,
    is_available: b.is_available,
    is_active: b.is_active,
    created_at: b.created_at,
    updated_at: b.updated_at,
    owner: {
      first_name: b.first_name,
      last_name: b.last_name,
      email: b.owner_email,
    }
  }));
console.log('✅ Formatted businesses (first one):', formattedBusinesses[0]);
  res.json({
    success: true,
    data: formattedBusinesses,
  });
});

// Obtenir un établissement par ID
const getBusinessById = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  const business = await Business.findById(businessId);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({
    success: true,
    data: business,
  });
});

// Mettre à jour un établissement
const updateBusiness = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const updates = req.body;

  // Vérifier que l'établissement existe
  const existingBusiness = await Business.findById(businessId);
  if (!existingBusiness) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  // Champs autorisés pour la mise à jour
  const allowedFields = [
    'name', 'description', 'address', 'phone',
    'opening_hour', 'closing_hour',
    'availability_start', 'availability_end',
    'is_available', 'is_active'
  ];

  const filteredUpdates = {};
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      filteredUpdates[field] = updates[field];
    }
  });

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Aucune donnée valide à mettre à jour',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const updatedBusiness = await Business.update(businessId, filteredUpdates);

  logger.info('Établissement mis à jour par admin', {
    businessId,
    updates: Object.keys(filteredUpdates),
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: 'Établissement mis à jour avec succès',
    data: updatedBusiness,
  });
});

// Mettre à jour le statut d'un établissement
const updateBusinessStatus = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { is_active } = req.body;

  const business = await Business.updateStatus(businessId, is_active);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut établissement mis à jour par admin', {
    businessId,
    isActive: is_active,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: `Établissement ${is_active ? 'activé' : 'désactivé'}`,
    data: business,
  });
});

// Supprimer un établissement
const deleteBusiness = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  // Vérifier que l'établissement existe
  const business = await Business.findById(businessId);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  await Business.delete(businessId);

  logger.warn('Établissement supprimé par admin', {
    businessId,
    businessName: business.name,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: 'Établissement supprimé avec succès',
  });
});

// =============================================
// STATISTIQUES
// =============================================

// Obtenir les statistiques globales
const getGlobalStatistics = asyncHandler(async (req, res) => {
  try {
    const [
      userCount,
      businessCount,
      orderStats,
      paymentStats,
      reservationStats,
      usersByRole,
      businessesByType,
    ] = await Promise.all([
      User.getCount(),
      Business.getCount(),
      Order.getStatistics(),
      Payment.getStatistics(),
      Reservation.getStatistics(),
      User.getCountByRole(),
      Business.getCountByType(),
    ]);

    const statistics = {
      users: {
        total: userCount,
        byRole: usersByRole.reduce((acc, item) => {
          acc[item.role] = parseInt(item.count);
          return acc;
        }, {}),
      },
      businesses: {
        total: businessCount,
        byType: businessesByType.reduce((acc, item) => {
          acc[item.type] = parseInt(item.count);
          return acc;
        }, {}),
      },
      orders: {
        total: parseInt(orderStats.total_orders || 0),
        today: parseInt(orderStats.today_orders || 0),
        pending: parseInt(orderStats.pending_orders || 0),
        confirmed: parseInt(orderStats.confirmed_orders || 0),
        revenue: {
          total: parseFloat(orderStats.total_revenue || 0),
          today: parseFloat(orderStats.today_revenue || 0),
        },
      },
      payments: {
        total: parseInt(paymentStats.total_payments || 0),
        today: parseInt(paymentStats.today_payments || 0),
        successful: parseInt(paymentStats.successful_payments || 0),
        pending: parseInt(paymentStats.pending_payments || 0),
        failed: parseInt(paymentStats.failed_payments || 0),
        revenue: {
          total: parseFloat(paymentStats.total_revenue || 0),
          today: parseFloat(paymentStats.today_revenue || 0),
        },
      },
      reservations: {
        total: parseInt(reservationStats.total_reservations || 0),
        today: parseInt(reservationStats.today_reservations || 0),
        pending: parseInt(reservationStats.pending_reservations || 0),
        confirmed: parseInt(reservationStats.confirmed_reservations || 0),
      },
    };

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    logger.error('Erreur récupération statistiques globales', {
      error: error.message,
      adminId: req.user.id,
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors du calcul des statistiques',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
});

// Obtenir les revenus par période
const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period = 'day' } = req.query;

  if (!['day', 'week', 'month'].includes(period)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Période invalide (day, week, month)',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const analytics = await Payment.getRevenueByPeriod(period);

  res.json({
    success: true,
    data: analytics,
  });
});

// Obtenir tous les paiements
const getAllPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.getAllForAdmin();

  res.json({
    success: true,
    data: payments,
  });
});

// Obtenir les logs d'activité (si implémenté)
const getActivityLogs = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  // Cette fonctionnalité nécessiterait une table de logs séparée
  // Pour l'instant, on retourne une réponse vide
  res.json({
    success: true,
    data: [],
    pagination: {
      limit: parseInt(limit),
      offset: parseInt(offset),
      total: 0,
    },
    message: 'Fonctionnalité de logs d\'activité à implémenter',
  });
});

// =============================================
// GESTION DES COMMANDES
// =============================================

// Obtenir toutes les commandes
const getAllOrders = asyncHandler(async (req, res) => {
  const { status, payment_status } = req.query;

  const orders = await Order.getAllForAdmin({ status, payment_status });

  res.json({
    success: true,
    data: orders,
  });
});

// Obtenir une commande par ID
const getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findByIdWithDetails(orderId);
  
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Commande introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({
    success: true,
    data: order,
  });
});

// Mettre à jour le statut d'une commande
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Statut invalide',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const order = await Order.updateStatus(orderId, status);
  
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Commande introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut commande mis à jour par admin', {
    orderId,
    status,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: 'Statut de la commande mis à jour',
    data: order,
  });
});

// =============================================
// GESTION DES RÉSERVATIONS
// =============================================

// Obtenir toutes les réservations
const getAllReservations = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const reservations = await Reservation.getAllForAdmin({ status });

  res.json({
    success: true,
    data: reservations,
  });
});

// Obtenir une réservation par ID
const getReservationById = asyncHandler(async (req, res) => {
  const { reservationId } = req.params;

  const reservation = await Reservation.findByIdWithDetails(reservationId);
  
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Réservation introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({
    success: true,
    data: reservation,
  });
});

// Mettre à jour le statut d'une réservation
const updateReservationStatus = asyncHandler(async (req, res) => {
  const { reservationId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'cancelled'];
  
  if (!validStatuses.includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Statut invalide',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const reservation = await Reservation.updateStatus(reservationId, status);
  
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Réservation introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut réservation mis à jour par admin', {
    reservationId,
    status,
    adminId: req.user.id,
  });

  res.json({
    success: true,
    message: 'Statut de la réservation mis à jour',
    data: reservation,
  });
});

// =============================================
// GESTION DES ABONNEMENTS (ADMIN)
// =============================================

/**
 * GET /api/admin/subscriptions
 * Affiche TOUS les abonnements (gratuit inclus)
 */
const getAllSubscriptions = asyncHandler(async (req, res) => {
  const { status, expiring_soon } = req.query;

  // ✅ DISTINCT ON : garde uniquement l'abonnement ACTIF le plus récent par business
  // Si un business a eu plusieurs abonnements, on ne prend que le dernier actif
  let query = `
    WITH latest_subscriptions AS (
      SELECT DISTINCT ON (bs.business_id)
        bs.id                  AS subscription_id,
        bs.business_id,
        bs.status              AS subscription_status,
        bs.start_date,
        bs.end_date,
        bs.plan_id,
        bs.created_at
      FROM business_subscriptions bs
      ORDER BY bs.business_id, bs.created_at DESC
    )
    SELECT
      ls.subscription_id,
      ls.business_id,
      ls.subscription_status,
      ls.start_date,
      ls.end_date,
      ls.created_at,
      sp.name                AS plan_name,
      sp.display_name        AS plan_display_name,
      sp.price               AS plan_price,
      sp.priority_support,
      b.name                 AS business_name,
      b.type                 AS business_type,
      b.is_active            AS business_active,
      u.email                AS owner_email,
      u.first_name           AS owner_first_name,
      u.last_name            AS owner_last_name,
      u.phone                AS owner_phone,
      CASE
        WHEN ls.end_date IS NULL THEN 9999
        ELSE EXTRACT(DAY FROM (ls.end_date - NOW()))::INTEGER
      END                    AS days_remaining,
      (
        SELECT json_agg(
          json_build_object(
            'days_before', sr.days_before,
            'channels',    sr.channels,
            'sent_at',     sr.sent_at
          ) ORDER BY sr.sent_at DESC
        )
        FROM subscription_reminders sr
        WHERE sr.subscription_id = ls.subscription_id
      ) AS reminders_sent
    FROM latest_subscriptions ls
    JOIN subscription_plans sp ON ls.plan_id      = sp.id
    JOIN businesses          b  ON ls.business_id  = b.id
    JOIN users               u  ON b.user_id       = u.id
    WHERE 1=1
  `;

  const params = [];

  // Filtre sur le statut de l'abonnement
  if (status && status !== 'all') {
    params.push(status);
    query += ` AND ls.subscription_status = $${params.length}`;
  }

  // Filtre expirant bientôt
  if (expiring_soon === 'true') {
    query += ` AND ls.end_date IS NOT NULL AND ls.end_date BETWEEN NOW() AND NOW() + INTERVAL '7 days'`;
  }

  query += `
    ORDER BY
      CASE sp.name
        WHEN 'premium'         THEN 1
        WHEN 'premium_yearly'  THEN 2
        WHEN 'standard'        THEN 3
        WHEN 'standard_yearly' THEN 4
        ELSE 5
      END,
      ls.end_date ASC NULLS LAST,
      b.name ASC
    LIMIT 300
  `;

  let result;
  try {
    result = await pool.query(query, params);
  } catch (err) {
    // Fallback si subscription_reminders n'existe pas encore
    if (err.code === '42P01') {
      const fallbackQuery = query.replace(
        /\(\s*SELECT json_agg[\s\S]*?AS reminders_sent/m,
        'NULL AS reminders_sent'
      );
      result = await pool.query(fallbackQuery, params);
    } else {
      throw err;
    }
  }

  const rows = result.rows;

  const summary = {
    total:      rows.length,
    free:       rows.filter(r => ['free', 'gratuit'].includes(r.plan_name)).length,
    paid:       rows.filter(r => !['free', 'gratuit'].includes(r.plan_name)).length,
    expired:    rows.filter(r => r.days_remaining !== 9999 && r.days_remaining < 0).length,
    expiring_7: rows.filter(r => r.days_remaining >= 0 && r.days_remaining <= 7).length,
    healthy:    rows.filter(r => r.days_remaining > 7 || r.days_remaining === 9999).length,
  };

  res.json({ success: true, data: rows, summary });
});


/**
 * POST /api/admin/subscriptions/trigger-reminders
 */
const triggerExpiryReminders = asyncHandler(async (req, res) => {
  runExpiryReminders()
    .then(() => console.log('[Admin] Rappels manuels terminés'))
    .catch(err => console.error('[Admin] Erreur rappels manuels:', err));

  res.json({
    success: true,
    message: 'Rappels lancés en arrière-plan. Consultez les logs serveur.'
  });
});

/**
 * GET /api/admin/subscriptions/reminders-history
 */
const getRemindersHistory = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;

  let result;
  try {
    result = await pool.query(
      `SELECT
         sr.*,
         bs.end_date,
         b.name  AS business_name,
         u.email AS owner_email
       FROM subscription_reminders sr
       JOIN business_subscriptions bs ON sr.subscription_id = bs.id
       JOIN businesses              b  ON bs.business_id = b.id
       JOIN users                   u  ON b.user_id = u.id
       ORDER BY sr.sent_at DESC
       LIMIT $1`,
      [parseInt(limit)]
    );
  } catch {
    result = { rows: [] };
  }

  res.json({ success: true, data: result.rows, count: result.rows.length });
});

/**
 * POST /api/admin/subscriptions/:subscriptionId/send-reminder
 */
const sendManualReminder = asyncHandler(async (req, res) => {
  const { subscriptionId } = req.params;
  const { channel = 'email' } = req.body;

  const result = await pool.query(
    `SELECT bs.*, sp.name AS plan_name, sp.price AS plan_price,
            b.name AS business_name, b.phone AS business_phone,
            u.email AS owner_email, u.first_name AS owner_first_name, u.phone AS owner_phone
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id = sp.id
     JOIN businesses b ON bs.business_id = b.id
     JOIN users u ON b.user_id = u.id
     WHERE bs.id = $1`,
    [subscriptionId]
  );

  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, error: 'Abonnement introuvable' });
  }

  const sub = result.rows[0];
  const daysRemaining = sub.end_date
    ? Math.ceil((new Date(sub.end_date) - new Date()) / (1000 * 60 * 60 * 24))
    : 9999;

  const sentChannels = [];
  const { emailService } = require('../services/emailService');
  const { smsService }   = require('../services/smsService');

  if (channel === 'email' || channel === 'both') {
    try {
      const r = await emailService.sendSubscriptionExpiryReminder({
        ownerEmail:     sub.owner_email,
        ownerFirstName: sub.owner_first_name,
        businessName:   sub.business_name,
        planName:       sub.plan_name,
        planPrice:      sub.plan_price,
        endDate:        sub.end_date,
        daysLeft:       Math.max(daysRemaining, 1)
      });
      if (r.success) sentChannels.push('email');
    } catch (err) {
      console.error('Erreur email rappel manuel:', err.message);
    }
  }

  const phone = sub.owner_phone || sub.business_phone;
  if ((channel === 'sms' || channel === 'both') && phone) {
    try {
      const r = await smsService.sendSubscriptionExpiryReminder({
        phone,
        businessName: sub.business_name,
        planName:     sub.plan_name,
        daysLeft:     Math.max(daysRemaining, 1)
      });
      if (r.success) sentChannels.push('sms');
    } catch (err) {
      console.error('Erreur SMS rappel manuel:', err.message);
    }
  }

  res.json({
    success: true,
    message: `Rappel envoyé via : ${sentChannels.join(', ') || 'aucun canal disponible'}`,
    data: { subscription_id: subscriptionId, business_name: sub.business_name, days_remaining: daysRemaining, channels_used: sentChannels }
  });
});

// Ajouter ces méthodes à l'export du module
module.exports = {
  // Utilisateurs
  getAllUsers,
  updateUserStatus,
  deleteUser,
  
  // Établissements
  getAllBusinesses,
  getBusinessById,
  updateBusiness,
  updateBusinessStatus,
  deleteBusiness,
  
  // Commandes (NOUVEAU)
  getAllOrders,
  getOrderById,
  updateOrderStatus,
  
  // Réservations (NOUVEAU)
  getAllReservations,
  getReservationById,
  updateReservationStatus,
  
  // Statistiques
  getGlobalStatistics,
  getRevenueAnalytics,
  getAllPayments,
  getActivityLogs,

  // ExpiryReminders
  getAllSubscriptions,
  triggerExpiryReminders,
  getRemindersHistory,
  sendManualReminder,
};
