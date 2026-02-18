const ClientProfile = require('../models/ClientProfile');
const ClientNotification = require('../models/ClientNotification');
const Order = require('../models/Order');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { pool } = require('../config/db');
const orderReceiptService = require('../services/orderReceiptService');

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

  // Vérifier que la commande existe et appartient au client
  const order = await Order.findById(orderId);
  
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Commande introuvable',
      code: ERROR_CODES.NOT_FOUND
    });
  }

  if (order.client_id !== req.user.id) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Vous n\'êtes pas autorisé à confirmer cette livraison',
      code: ERROR_CODES.FORBIDDEN
    });
  }

  if (order.status !== 'delivered') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'La commande doit être en statut "delivered" pour être confirmée',
      code: ERROR_CODES.VALIDATION_ERROR
    });
  }

  if (order.delivery_confirmed) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Cette livraison a déjà été confirmée',
      code: ERROR_CODES.VALIDATION_ERROR
    });
  }

  // Confirmer la livraison
  const updatedOrder = await ClientProfile.confirmDelivery(orderId, req.user.id);

  logger.info('Livraison confirmée par le client', {
    orderId,
    userId: req.user.id,
    businessId: order.business_id
  });

  res.json({
    success: true,
    message: 'Livraison confirmée avec succès',
    data: updatedOrder
  });
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

module.exports = {
  getClientProfile,
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
};