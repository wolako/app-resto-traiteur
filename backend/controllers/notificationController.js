const notificationService = require('../services/notificationService');
const Business = require('../models/Business');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Récupérer les notifications d'un restaurant
 * GET /api/notifications
 */
const getNotifications = asyncHandler(async (req, res) => {
  const { limit = 50, offset = 0, unreadOnly = 'false' } = req.query;

  // Récupérer l'établissement de l'utilisateur connecté
  const business = await Business.findByUserId(req.user.id);
  
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  const notifications = await notificationService.getBusinessNotifications(
    business.id,
    {
      limit: parseInt(limit),
      offset: parseInt(offset),
      unreadOnly: unreadOnly === 'true',
    }
  );

  const unreadCount = await notificationService.getUnreadCount(business.id);

  res.json({
    success: true,
    data: {
      notifications,
      unreadCount,
      total: notifications.length,
    },
  });
});

/**
 * Compter les notifications non lues
 * GET /api/notifications/unread-count
 */
const getUnreadCount = asyncHandler(async (req, res) => {
  const business = await Business.findByUserId(req.user.id);
  
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  const count = await notificationService.getUnreadCount(business.id);

  res.json({
    success: true,
    data: { count },
  });
});

/**
 * Marquer une notification comme lue
 * PUT /api/notifications/:id/read
 */
const markAsRead = asyncHandler(async (req, res) => {
  const { id } = req.params;

  await notificationService.markAsRead(id);

  res.json({
    success: true,
    message: 'Notification marquée comme lue',
  });
});

/**
 * Marquer toutes les notifications comme lues
 * PUT /api/notifications/read-all
 */
const markAllAsRead = asyncHandler(async (req, res) => {
  const business = await Business.findByUserId(req.user.id);
  
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  await notificationService.markAllAsRead(business.id);

  res.json({
    success: true,
    message: 'Toutes les notifications marquées comme lues',
  });
});

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
};