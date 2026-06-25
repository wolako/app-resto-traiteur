const express = require('express');
const clientController = require('../controllers/clientController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');
const { validateNumericParam } = require('../middleware/validation');

const router = express.Router();

router.use(authenticateToken);
router.use(requireRole(USER_ROLES.CLIENT));

// ── Profil ────────────────────────────────────────────────────
router.get('/profile', clientController.getClientProfile);

// ✅ Nouvelle route : modifier le profil
router.put('/profile', clientController.updateClientProfile);

// ── Préférences de notification ───────────────────────────────
router.get('/notification-preferences', clientController.getNotificationPreferences);
router.put('/notification-preferences', clientController.updateNotificationPreferences);

// ── Commandes ─────────────────────────────────────────────────
router.get('/orders', clientController.getClientOrders);

router.post('/orders/:orderId/confirm-delivery',
  validateNumericParam('orderId'),
  clientController.confirmDelivery
);

router.get('/orders/:orderId/receipt',
  validateNumericParam('orderId'),
  clientController.downloadOrderReceipt
);

router.get('/special-orders/:specialOrderId/receipt',
  validateNumericParam('specialOrderId'),
  clientController.downloadSpecialOrderReceipt
);

// ── Réservations ──────────────────────────────────────────────
router.get('/reservations', clientController.getClientReservations);

// ── Commandes spéciales ───────────────────────────────────────
router.get('/special-orders', clientController.getClientSpecialOrders);

// ── Notifications ─────────────────────────────────────────────
router.get('/notifications', clientController.getClientNotifications);
router.get('/notifications/unread-count', clientController.getUnreadNotificationCount);
router.put('/notifications/read-all', clientController.markAllNotificationsAsRead);
router.put('/notifications/:id/read',
  validateNumericParam('id'),
  clientController.markNotificationAsRead
);
router.delete('/notifications/:id',
  validateNumericParam('id'),
  clientController.deleteNotification
);

router.post('/orders/:orderId/rate-driver', authenticateToken, requireRole('client'), clientController.rateDriver);
router.get('/orders/:orderId/driver-review',  authenticateToken, requireRole('client'), clientController.getDriverReview);

module.exports = router;