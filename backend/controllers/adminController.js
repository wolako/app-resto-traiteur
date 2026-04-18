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

const getAllUsers = asyncHandler(async (req, res) => {
  const { role, is_active } = req.query;

  const users = await User.getAll({
    role: role || 'client',
    is_active: is_active !== undefined ? is_active === 'true' : undefined,
  });

  res.json({ success: true, data: users });
});

const updateUserStatus = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const { is_active } = req.body;

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
      success: false, message: 'Utilisateur introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut utilisateur mis à jour par admin', {
    targetUserId: userId, isActive: is_active, adminId: req.user.id,
  });

  res.json({ success: true, message: `Utilisateur ${is_active ? 'activé' : 'désactivé'}`, data: user });
});

const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (userId == req.user.id) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false, message: 'Vous ne pouvez pas supprimer votre propre compte', code: ERROR_CODES.FORBIDDEN,
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Utilisateur introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  if (user.role === 'superadmin') {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false, message: 'Vous ne pouvez pas supprimer un autre administrateur', code: ERROR_CODES.FORBIDDEN,
    });
  }

  await User.delete(userId);

  logger.warn('Utilisateur supprimé par admin', {
    deletedUserId: userId, deletedUserEmail: user.email, adminId: req.user.id,
  });

  res.json({ success: true, message: 'Utilisateur supprimé avec succès' });
});

// =============================================
// GESTION DES ÉTABLISSEMENTS
// =============================================

const getAllBusinesses = asyncHandler(async (req, res) => {
  const businesses = await Business.getAllForAdmin();

  const formattedBusinesses = businesses.map(b => ({
    id:                 b.id,
    user_id:            b.user_id,
    name:               b.name,
    type:               b.type,
    description:        b.description,
    address:            b.address,
    phone:              b.phone,
    opening_hour:       b.opening_hour,
    closing_hour:       b.closing_hour,
    availability_start: b.availability_start,
    availability_end:   b.availability_end,
    is_available:       b.is_available,
    is_active:          b.is_active,
    created_at:         b.created_at,
    updated_at:         b.updated_at,
    // ✅ NOUVEAU : champs géo
    latitude:           b.latitude  ? parseFloat(b.latitude)  : null,
    longitude:          b.longitude ? parseFloat(b.longitude) : null,
    district:           b.district  || null,
    owner: {
      first_name: b.first_name,
      last_name:  b.last_name,
      email:      b.owner_email,
      phone:      b.owner_phone,
    }
  }));

  res.json({ success: true, data: formattedBusinesses });
});

const getBusinessById = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  const business = await Business.findById(businessId);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({ success: true, data: business });
});

const updateBusiness = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const updates = req.body;

  const existingBusiness = await Business.findById(businessId);
  if (!existingBusiness) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  const allowedFields = [
    'name', 'description', 'address', 'phone',
    'opening_hour', 'closing_hour',
    'availability_start', 'availability_end',
    'is_available', 'is_active',
    'latitude',   // ✅ NOUVEAU
    'longitude',  // ✅ NOUVEAU
    'district',   // ✅ NOUVEAU
  ];

  const filteredUpdates = {};
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) filteredUpdates[field] = updates[field];
  });

  // ✅ Convertir latitude/longitude en float si présents
  if (filteredUpdates.latitude  !== undefined) filteredUpdates.latitude  = parseFloat(filteredUpdates.latitude);
  if (filteredUpdates.longitude !== undefined) filteredUpdates.longitude = parseFloat(filteredUpdates.longitude);

  // ✅ Rejeter NaN
  if (filteredUpdates.latitude  !== undefined && isNaN(filteredUpdates.latitude))  delete filteredUpdates.latitude;
  if (filteredUpdates.longitude !== undefined && isNaN(filteredUpdates.longitude)) delete filteredUpdates.longitude;

  if (Object.keys(filteredUpdates).length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Aucune donnée valide à mettre à jour', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const updatedBusiness = await Business.update(businessId, filteredUpdates);

  logger.info('Établissement mis à jour par admin', {
    businessId, updates: Object.keys(filteredUpdates), adminId: req.user.id,
  });

  res.json({ success: true, message: 'Établissement mis à jour avec succès', data: updatedBusiness });
});

const updateBusinessStatus = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { is_active } = req.body;

  const business = await Business.updateStatus(businessId, is_active);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut établissement mis à jour par admin', {
    businessId, isActive: is_active, adminId: req.user.id,
  });

  res.json({ success: true, message: `Établissement ${is_active ? 'activé' : 'désactivé'}`, data: business });
});

const deleteBusiness = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  const business = await Business.findById(businessId);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  await Business.delete(businessId);

  logger.warn('Établissement supprimé par admin', {
    businessId, businessName: business.name, adminId: req.user.id,
  });

  res.json({ success: true, message: 'Établissement supprimé avec succès' });
});

// =============================================
// STATISTIQUES
// =============================================

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
      Order.getStatistics(),      // ✅ retourne maintenant today_revenue
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
        total:     parseInt(orderStats.total_orders     || 0),
        today:     parseInt(orderStats.today_orders     || 0),
        pending:   parseInt(orderStats.pending_orders   || 0),
        confirmed: parseInt(orderStats.confirmed_orders || 0),
        revenue: {
          total: parseFloat(orderStats.total_revenue || 0),
          today: parseFloat(orderStats.today_revenue || 0),  // ✅ CORRIGÉ
        },
      },
      payments: {
        total:      parseInt(paymentStats.total_payments      || 0),
        today:      parseInt(paymentStats.today_payments      || 0),
        successful: parseInt(paymentStats.successful_payments || 0),
        pending:    parseInt(paymentStats.pending_payments    || 0),
        failed:     parseInt(paymentStats.failed_payments     || 0),
        revenue: {
          total: parseFloat(paymentStats.total_revenue || 0),
          today: parseFloat(paymentStats.today_revenue || 0),
        },
      },
      reservations: {
        total:     parseInt(reservationStats.total_reservations     || 0),
        today:     parseInt(reservationStats.today_reservations     || 0),
        pending:   parseInt(reservationStats.pending_reservations   || 0),
        confirmed: parseInt(reservationStats.confirmed_reservations || 0),
      },
    };

    res.json({ success: true, data: statistics });
  } catch (error) {
    logger.error('Erreur récupération statistiques globales', {
      error: error.message, adminId: req.user.id,
    });

    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false, message: 'Erreur lors du calcul des statistiques', code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
});

const getRevenueAnalytics = asyncHandler(async (req, res) => {
  const { period = 'day' } = req.query;

  if (!['day', 'week', 'month'].includes(period)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Période invalide (day, week, month)', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const analytics = await Payment.getRevenueByPeriod(period);
  res.json({ success: true, data: analytics });
});

const getAllPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.getAllForAdmin();
  res.json({ success: true, data: payments });
});

const getActivityLogs = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0 } = req.query;

  res.json({
    success: true,
    data: [],
    pagination: { limit: parseInt(limit), offset: parseInt(offset), total: 0 },
    message: 'Fonctionnalité de logs d\'activité à implémenter',
  });
});

// =============================================
// GESTION DES COMMANDES
// =============================================

const getAllOrders = asyncHandler(async (req, res) => {
  const { status, payment_status } = req.query;

  // ✅ CORRIGÉ — utilise getAllForAdmin() qui inclut items_count et existe réellement
  const orders = await Order.getAllForAdmin({ status, payment_status });

  res.json({ success: true, data: orders });
});

const getOrderById = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  // ✅ CORRIGÉ — utilise findByIdWithDetails() qui inclut les items
  const order = await Order.findByIdWithDetails(orderId);

  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Commande introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({ success: true, data: order });
});

const updateOrderStatus = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Statut invalide', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const order = await Order.updateStatus(orderId, status);

  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Commande introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut commande mis à jour par admin', {
    orderId, status, adminId: req.user.id,
  });

  res.json({ success: true, message: 'Statut de la commande mis à jour', data: order });
});

// =============================================
// GESTION DES RÉSERVATIONS
// =============================================

const getAllReservations = asyncHandler(async (req, res) => {
  const { status } = req.query;

  // ✅ CORRIGÉ — utilise getAllForAdmin() qui existe maintenant
  const reservations = await Reservation.getAllForAdmin({ status });

  res.json({ success: true, data: reservations });
});

const getReservationById = asyncHandler(async (req, res) => {
  const { reservationId } = req.params;

  // ✅ CORRIGÉ — utilise findByIdWithDetails() qui existe maintenant
  const reservation = await Reservation.findByIdWithDetails(reservationId);

  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Réservation introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({ success: true, data: reservation });
});

const updateReservationStatus = asyncHandler(async (req, res) => {
  const { reservationId } = req.params;
  const { status } = req.body;

  const validStatuses = ['pending', 'confirmed', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Statut invalide', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const reservation = await Reservation.updateStatus(reservationId, status);

  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Réservation introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Statut réservation mis à jour par admin', {
    reservationId, status, adminId: req.user.id,
  });

  res.json({ success: true, message: 'Statut de la réservation mis à jour', data: reservation });
});

// =============================================
// GESTION DES ABONNEMENTS
// =============================================

const getAllSubscriptions = asyncHandler(async (req, res) => {
  const { status, expiring_soon } = req.query;

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

  if (status && status !== 'all') {
    params.push(status);
    query += ` AND ls.subscription_status = $${params.length}`;
  }

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

const triggerExpiryReminders = asyncHandler(async (req, res) => {
  runExpiryReminders()
    .then(() => console.log('[Admin] Rappels manuels terminés'))
    .catch(err => console.error('[Admin] Erreur rappels manuels:', err));

  res.json({
    success: true,
    message: 'Rappels lancés en arrière-plan. Consultez les logs serveur.'
  });
});

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
    data: {
      subscription_id: subscriptionId,
      business_name: sub.business_name,
      days_remaining: daysRemaining,
      channels_used: sentChannels
    }
  });
});

// ── Lister tous les comptes de paiement ──────────────────────
const getAllPaymentAccounts = asyncHandler(async (req, res) => {
  const { status } = req.query;
 
  let query = `
    SELECT
      bpa.*,
      b.name          AS business_name,
      b.type          AS business_type,
      b.phone         AS business_phone,
      u.email         AS owner_email,
      u.first_name    AS owner_first_name,
      u.last_name     AS owner_last_name,
      u.phone         AS owner_phone,
      vu.email        AS verified_by_email
    FROM business_payment_accounts bpa
    JOIN businesses b ON bpa.business_id = b.id
    JOIN users      u ON b.user_id = u.id
    LEFT JOIN users vu ON bpa.verified_by = vu.id
    WHERE 1=1
  `;
 
  const params = [];
  if (status && status !== 'all') {
    params.push(status);
    query += ` AND bpa.status = $${params.length}`;
  }
 
  query += ` ORDER BY
    CASE bpa.status
      WHEN 'pending_verification' THEN 1
      WHEN 'rejected'             THEN 2
      WHEN 'verified'             THEN 3
      WHEN 'suspended'            THEN 4
      ELSE 5
    END,
    bpa.updated_at DESC
  `;
 
  const result = await pool.query(query, params);
 
  const summary = {
    total:                result.rows.length,
    pending_verification: result.rows.filter(r => r.status === 'pending_verification').length,
    verified:             result.rows.filter(r => r.status === 'verified').length,
    rejected:             result.rows.filter(r => r.status === 'rejected').length,
    not_configured:       result.rows.filter(r => r.status === 'not_configured').length,
    suspended:            result.rows.filter(r => r.status === 'suspended').length,
  };
 
  res.json({ success: true, data: result.rows, summary });
});
 
// ── Vérifier un compte ────────────────────────────────────────
const verifyPaymentAccount = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const { admin_notes } = req.body;
 
  const result = await pool.query(
    `UPDATE business_payment_accounts
     SET status      = 'verified',
         verified_at = NOW(),
         verified_by = $1,
         admin_notes = $2,
         rejection_reason = NULL,
         updated_at  = NOW()
     WHERE id = $3
     RETURNING *`,
    [req.user.id, admin_notes || null, accountId]
  );
 
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Compte introuvable' });
  }
 
  // Notifier le propriétaire
  try {
    const accountRow = result.rows[0];
    const businessResult = await pool.query(
      `SELECT b.name, u.email, u.first_name, b.user_id
       FROM businesses b JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [accountRow.business_id]
    );
    if (businessResult.rows.length > 0) {
      const { email, first_name, name: businessName, user_id } = businessResult.rows[0];
 
      // Notification in-app
      const notifService = require('../services/notificationService');
      await notifService.createBusinessNotification({
        business_id:    accountRow.business_id,
        type:           'payment_success',
        title:          '✅ Compte de paiement vérifié !',
        message:        `Votre compte de reversement a été validé. Vous pouvez maintenant recevoir vos paiements automatiquement.`,
        priority:       'high',
        reference_type: 'payment_account',
        reference_id:   accountRow.id,
      });
 
      // Email
      const { emailService } = require('../services/emailService');
      await emailService.sendEmail({
        to:      email,
        subject: `✅ Compte de paiement vérifié — ${businessName}`,
        html: `
          <h2>Félicitations, votre compte est vérifié !</h2>
          <p>Bonjour <strong>${first_name}</strong>,</p>
          <p>Votre compte de reversement pour <strong>${businessName}</strong> a été <strong style="color:#16a34a">vérifié et activé</strong> par notre équipe.</p>
          <p>À partir de maintenant, vos paiements CinetPay seront automatiquement splitté :</p>
          <ul>
            <li>Votre montant net → directement sur votre ${accountRow.preferred_payout_method === 'bank' ? 'compte bancaire' : `numéro ${accountRow.preferred_payout_method === 'mixx' ? 'Mixx By Yas' : 'Flooz'}`}</li>
            <li>Commission plateforme → prélevée automatiquement</li>
          </ul>
          ${admin_notes ? `<p><em>Note de l'équipe :</em> ${admin_notes}</p>` : ''}
          <p>Merci de faire confiance à RestoTraiteur !</p>
        `
      }).catch(err => console.error('[Email] Erreur vérification compte:', err.message));
    }
  } catch (notifErr) {
    console.error('[Notif] Erreur post-vérification:', notifErr.message);
  }
 
  logger.info('Compte paiement vérifié', { accountId, adminId: req.user.id });
  res.json({ success: true, message: 'Compte vérifié avec succès', data: result.rows[0] });
});
 
// ── Rejeter un compte ─────────────────────────────────────────
const rejectPaymentAccount = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const { rejection_reason, admin_notes } = req.body;
 
  if (!rejection_reason?.trim()) {
    return res.status(400).json({ success: false, message: 'La raison du rejet est obligatoire' });
  }
 
  const result = await pool.query(
    `UPDATE business_payment_accounts
     SET status           = 'rejected',
         rejection_reason = $1,
         admin_notes      = $2,
         verified_at      = NULL,
         verified_by      = $3,
         updated_at       = NOW()
     WHERE id = $4
     RETURNING *`,
    [rejection_reason, admin_notes || null, req.user.id, accountId]
  );
 
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Compte introuvable' });
  }
 
  try {
    const accountRow = result.rows[0];
    const businessResult = await pool.query(
      `SELECT b.name, u.email, u.first_name FROM businesses b JOIN users u ON b.user_id = u.id WHERE b.id = $1`,
      [accountRow.business_id]
    );
    if (businessResult.rows.length > 0) {
      const { email, first_name, name: businessName } = businessResult.rows[0];
 
      const notifService = require('../services/notificationService');
      await notifService.createBusinessNotification({
        business_id:    accountRow.business_id,
        type:           'payment_failed',
        title:          '❌ Compte de paiement rejeté',
        message:        `Votre dossier a été rejeté. Motif : ${rejection_reason}. Veuillez corriger et soumettre à nouveau.`,
        priority:       'high',
        reference_type: 'payment_account',
        reference_id:   accountRow.id,
      });
 
      const { emailService } = require('../services/emailService');
      await emailService.sendEmail({
        to:      email,
        subject: `❌ Dossier compte paiement — ${businessName}`,
        html: `
          <h2>Votre dossier nécessite des corrections</h2>
          <p>Bonjour <strong>${first_name}</strong>,</p>
          <p>Votre compte de reversement pour <strong>${businessName}</strong> n'a pas pu être validé.</p>
          <p><strong>Raison :</strong> ${rejection_reason}</p>
          ${admin_notes ? `<p><em>Note complémentaire :</em> ${admin_notes}</p>` : ''}
          <p>Connectez-vous à votre tableau de bord, corrigez les informations et soumettez à nouveau.</p>
        `
      }).catch(err => console.error('[Email] Erreur rejet compte:', err.message));
    }
  } catch (notifErr) {
    console.error('[Notif] Erreur post-rejet:', notifErr.message);
  }
 
  logger.info('Compte paiement rejeté', { accountId, reason: rejection_reason, adminId: req.user.id });
  res.json({ success: true, message: 'Compte rejeté', data: result.rows[0] });
});
 
// ── Suspendre un compte ───────────────────────────────────────
const suspendPaymentAccount = asyncHandler(async (req, res) => {
  const { accountId } = req.params;
  const { reason } = req.body;
 
  const result = await pool.query(
    `UPDATE business_payment_accounts
     SET status      = 'suspended',
         admin_notes = $1,
         updated_at  = NOW()
     WHERE id = $2
     RETURNING *`,
    [reason || null, accountId]
  );
 
  if (result.rows.length === 0) {
    return res.status(404).json({ success: false, message: 'Compte introuvable' });
  }
 
  logger.info('Compte paiement suspendu', { accountId, adminId: req.user.id });
  res.json({ success: true, message: 'Compte suspendu', data: result.rows[0] });
});

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

  // Commandes
  getAllOrders,
  getOrderById,
  updateOrderStatus,

  // Réservations
  getAllReservations,
  getReservationById,
  updateReservationStatus,

  // Statistiques
  getGlobalStatistics,
  getRevenueAnalytics,
  getAllPayments,
  getActivityLogs,

  // Abonnements & rappels
  getAllSubscriptions,
  triggerExpiryReminders,
  getRemindersHistory,
  sendManualReminder,

  // Activation de compte de payment
  getAllPaymentAccounts,
  verifyPaymentAccount,
  rejectPaymentAccount,
  suspendPaymentAccount,

};