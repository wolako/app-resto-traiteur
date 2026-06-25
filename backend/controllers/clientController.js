const ClientProfile = require('../models/ClientProfile');
const ClientNotification = require('../models/ClientNotification');
const Order = require('../models/Order');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { pool } = require('../config/db');
const orderReceiptService = require('../services/orderReceiptService');
const DriverReview = require('../models/DriverReview');
const { notifyBusiness } = require('../utils/socketEmit');
const notificationService = require('../services/notificationService');

/**
 * Obtenir le profil complet du client
 * GET /api/client/profile
 */
const getClientProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  
  // ✅ CORRECTION : Récupérer TOUTES les infos du user, y compris le téléphone
  const userResult = await pool.query(
    'SELECT id, email, first_name, last_name, phone FROM users WHERE id = $1',
    [userId]
  );
  
  if (userResult.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Utilisateur introuvable',
      code: ERROR_CODES.NOT_FOUND
    });
  }
  
  const user = userResult.rows[0];
  const userEmail = user.email;
  const userPhone = user.phone;

  console.log('🔍 Fetching profile for user:', { userId, userEmail, userPhone });

  // Récupérer les préférences de notification
  const preferences = await ClientProfile.getNotificationPreferences(userId);
  
  // Récupérer les statistiques
  const statistics = await ClientProfile.getClientStatistics(userId, userEmail, userPhone);

  console.log('📊 Statistics:', statistics);

  res.json({
    success: true,
    data: {
      preferences,
      statistics
    }
  });
});

/**
 * Mettre à jour le profil du client (nom, prénom, téléphone)
 * PUT /api/client/profile
 */
const updateClientProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const { first_name, last_name, phone } = req.body;
 
  // Validation minimale
  if (!first_name || !last_name) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Le prénom et le nom sont requis',
      code: ERROR_CODES.VALIDATION_ERROR
    });
  }
 
  // Mise à jour dans la table users
  const result = await pool.query(
    `UPDATE users
     SET first_name = $1,
         last_name  = $2,
         phone      = $3,
         updated_at = NOW()
     WHERE id = $4
     RETURNING id, email, first_name, last_name, phone, role, created_at, updated_at`,
    [first_name.trim(), last_name.trim(), phone?.trim() || null, userId]
  );
 
  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Utilisateur introuvable',
      code: ERROR_CODES.NOT_FOUND
    });
  }
 
  const updatedUser = result.rows[0];
 
  logger.info('Profil client mis à jour', { userId, first_name, last_name });
 
  res.json({
    success: true,
    message: 'Profil mis à jour avec succès',
    data: { user: updatedUser }
  });
});

/**
 * Obtenir les préférences de notification
 * GET /api/client/notification-preferences
 */
const getNotificationPreferences = asyncHandler(async (req, res) => {
  const preferences = await ClientProfile.getNotificationPreferences(req.user.id);

  res.json({
    success: true,
    data: preferences
  });
});

/**
 * Mettre à jour les préférences de notification
 * PUT /api/client/notification-preferences
 */
const updateNotificationPreferences = asyncHandler(async (req, res) => {
  const preferences = await ClientProfile.updateNotificationPreferences(
    req.user.id,
    req.body
  );

  logger.info('Préférences de notification mises à jour', {
    userId: req.user.id,
    preferences: req.body
  });

  res.json({
    success: true,
    message: 'Préférences mises à jour avec succès',
    data: preferences
  });
});

/**
 * Obtenir les commandes du client
 * GET /api/client/orders
 */
const getClientOrders = asyncHandler(async (req, res) => {
  const { status, payment_status, limit } = req.query;
  const userId = req.user.id;
  
  // ✅ CORRECTION : Récupérer l'email et le téléphone
  const userResult = await pool.query(
    'SELECT email, phone FROM users WHERE id = $1',
    [userId]
  );
  
  const userEmail = userResult.rows[0]?.email;
  const userPhone = userResult.rows[0]?.phone;

  console.log('🛒 Fetching orders for:', { userId, userEmail, userPhone });

  const orders = await ClientProfile.getClientOrders(userId, userEmail, userPhone, {
    status,
    payment_status,
    limit: limit ? parseInt(limit) : undefined
  });

  console.log('📦 Orders found:', orders.length);

  res.json({
    success: true,
    data: orders
  });
});

/**
 * Obtenir les réservations du client
 * GET /api/client/reservations
 */
const getClientReservations = asyncHandler(async (req, res) => {
  const { status, upcoming, limit } = req.query;
  const userId = req.user.id;
  
  // ✅ CORRECTION : Récupérer l'email et le téléphone
  const userResult = await pool.query(
    'SELECT email, phone FROM users WHERE id = $1',
    [userId]
  );
  
  const userEmail = userResult.rows[0]?.email;
  const userPhone = userResult.rows[0]?.phone;

  console.log('📅 Fetching reservations for:', { userId, userEmail, userPhone });

  const reservations = await ClientProfile.getClientReservations(userId, userEmail, userPhone, {
    status,
    upcoming: upcoming === 'true',
    limit: limit ? parseInt(limit) : undefined
  });

  console.log('🎫 Reservations found:', reservations.length);

  res.json({
    success: true,
    data: reservations
  });
});

/**
 * Obtenir les commandes spéciales du client
 * GET /api/client/special-orders
 */
const getClientSpecialOrders = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const userId = req.user.id;
  
  // ✅ CORRECTION : Récupérer l'email et le téléphone
  const userResult = await pool.query(
    'SELECT email, phone FROM users WHERE id = $1',
    [userId]
  );
  
  const userEmail = userResult.rows[0]?.email;
  const userPhone = userResult.rows[0]?.phone;

  const specialOrders = await ClientProfile.getClientSpecialOrders(userId, userEmail, userPhone, {
    status
  });

  res.json({
    success: true,
    data: specialOrders
  });
});

/**
 * Confirmer la livraison d'une commande
 * POST /api/client/orders/:orderId/confirm-delivery
 */

const confirmDelivery = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const clientId = req.user.id;

  const { rows: [order] } = await pool.query(
    `SELECT * FROM orders WHERE id = $1 AND client_id = $2`,
    [orderId, clientId]
  );
  if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable' });
  if (order.status !== 'delivered') {
    return res.status(400).json({ success: false, error: 'Cette commande n\'a pas encore été livrée' });
  }
  if (order.delivery_confirmed) {
    return res.status(400).json({ success: false, error: 'Déjà confirmée' });
  }

  await pool.query(
    `UPDATE orders
     SET delivery_confirmed = true, delivery_confirmed_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [orderId]
  );

  const io = req.app.get('io');
  notifyBusiness(io, order.business_id, 'order_updated', {
    orderId: parseInt(orderId),
    delivery_confirmed: true,
    delivery_confirmed_at: new Date()
  });

  await notificationService.createNotification({
    business_id:    order.business_id,
    type:           'delivery_confirmed',
    title:          '✅ Client a confirmé la réception',
    message:        `${order.client_name} a confirmé avoir reçu la commande #${orderId}`,
    priority:       'normal',
    reference_id:   parseInt(orderId),
    reference_type: 'order',
    metadata:       { order_id: orderId }
  });

  res.json({ success: true, message: 'Réception confirmée' });
});

/**
 * Obtenir les notifications du client
 * GET /api/client/notifications
 */
const getClientNotifications = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, unreadOnly = 'false' } = req.query;

  const notifications = await ClientNotification.getClientNotifications(req.user.id, {
    limit: parseInt(limit),
    offset: parseInt(offset),
    unreadOnly: unreadOnly === 'true'
  });

  const unreadCount = await ClientNotification.getUnreadCount(req.user.id);

  res.json({
    success: true,
    data: {
      notifications,
      unreadCount,
      total: notifications.length
    }
  });
});

/**
 * Obtenir le nombre de notifications non lues
 * GET /api/client/notifications/unread-count
 */
const getUnreadNotificationCount = asyncHandler(async (req, res) => {
  const count = await ClientNotification.getUnreadCount(req.user.id);

  res.json({
    success: true,
    data: { count }
  });
});

/**
 * Marquer une notification comme lue
 * PUT /api/client/notifications/:id/read
 */
const markNotificationAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await ClientNotification.markAsRead(id, req.user.id);

  res.json({
    success: true,
    message: 'Notification marquée comme lue'
  });
});

/**
 * Marquer toutes les notifications comme lues
 * PUT /api/client/notifications/read-all
 */
const markAllNotificationsAsRead = asyncHandler(async (req, res) => {
  await ClientNotification.markAllAsRead(req.user.id);

  res.json({
    success: true,
    message: 'Toutes les notifications marquées comme lues'
  });
});

/**
 * Supprimer une notification
 * DELETE /api/client/notifications/:id
 */
const deleteNotification = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await ClientNotification.delete(id, req.user.id);

  res.json({
    success: true,
    message: 'Notification supprimée'
  });
});

/**
 * Télécharger le reçu PDF d'une commande
 * GET /api/client/orders/:orderId/receipt
 */
const downloadOrderReceipt = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const userId = req.user.id;

  const { pdfBuffer, filename } = await orderReceiptService.generateReceiptForDownload(
    pool,
    parseInt(orderId),
    userId
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

/**
 * Télécharger le reçu PDF d'une commande spéciale
 * GET /api/client/special-orders/:specialOrderId/receipt
 */
const downloadSpecialOrderReceipt = asyncHandler(async (req, res) => {
  const { specialOrderId } = req.params;
  const userId = req.user.id;

  const { pdfBuffer, filename } = await orderReceiptService.generateSpecialReceiptForDownload(
    pool,
    parseInt(specialOrderId),
    userId
  );

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Length', pdfBuffer.length);
  res.send(pdfBuffer);
});

const rateDriver = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { rating, comment } = req.body;
  const clientId = req.user.id;

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ success: false, error: 'Note invalide (1 à 5)' });
  }

  const { rows: [order] } = await pool.query(
    `SELECT id, client_id, status, delivery_confirmed, current_assignment_id
     FROM orders WHERE id = $1`,
    [orderId]
  );

  if (!order || order.client_id !== clientId) {
    return res.status(404).json({ success: false, error: 'Commande introuvable' });
  }
  if (order.status !== 'delivered' || !order.delivery_confirmed) {
    return res.status(400).json({ success: false, error: 'Vous ne pouvez noter le livreur qu\'après confirmation de réception' });
  }
  if (!order.current_assignment_id) {
    return res.status(400).json({ success: false, error: 'Aucun livreur associé à cette commande' });
  }

  const { rows: [assignment] } = await pool.query(
    `SELECT driver_id FROM delivery_assignments WHERE id = $1`,
    [order.current_assignment_id]
  );

  if (!assignment) return res.status(404).json({ success: false, error: 'Livreur introuvable' });

  const review = await DriverReview.create({
    driver_id: assignment.driver_id, order_id: orderId,
    client_id: clientId, rating, comment
  });

  // const io = req.app.get('io');
  // notifyBusiness(io, order.business_id, 'driver_rated', {
  //   orderId: parseInt(orderId),
  //   driver_id: assignment.driver_id,
  //   rating, comment
  // });

  res.json({ success: true, message: 'Merci pour votre avis !', data: review });
});

const getDriverReview = asyncHandler(async (req, res) => {
  const review = await DriverReview.findByOrderId(req.params.orderId);
  res.json({ success: true, data: review });
});

module.exports = {
  getClientProfile,
  updateClientProfile,
  getNotificationPreferences,
  updateNotificationPreferences,
  getClientOrders,
  getClientReservations,
  getClientSpecialOrders,
  confirmDelivery,
  getClientNotifications,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  downloadOrderReceipt,
  downloadSpecialOrderReceipt,
  rateDriver, getDriverReview,
};