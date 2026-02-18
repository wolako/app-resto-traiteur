const express = require('express');
const notificationController = require('../controllers/notificationController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Toutes les routes nécessitent une authentification et un rôle restaurant/traiteur
router.use(authenticateToken);
router.use(requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR));

// Récupérer les notifications
router.get('/', notificationController.getNotifications);

// Compter les notifications non lues
router.get('/unread-count', notificationController.getUnreadCount);

// Marquer toutes les notifications comme lues
router.put('/read-all', notificationController.markAllAsRead);

// Marquer une notification comme lue
router.put('/:id/read', notificationController.markAsRead);

module.exports = router;