const express = require('express');
const clientController = require('../controllers/clientController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');
const { validateNumericParam } = require('../middleware/validation');

const router = express.Router();

// Toutes les routes nécessitent une authentification en tant que client
router.use(authenticateToken);
router.use(requireRole(USER_ROLES.CLIENT));

// =============================================
// PROFIL CLIENT
// =============================================

// Obtenir le profil complet
router.get('/profile', clientController.getClientProfile);

// Préférences de notification
router.get('/notification-preferences', clientController.getNotificationPreferences);
router.put('/notification-preferences', clientController.updateNotificationPreferences);

// =============================================
// COMMANDES
// =============================================

// Obtenir les commandes du client
router.get('/orders', clientController.getClientOrders);

// Confirmer la livraison d'une commande
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

// =============================================
// RÉSERVATIONS
// =============================================

// Obtenir les réservations du client
router.get('/reservations', clientController.getClientReservations);

// =============================================
// COMMANDES SPÉCIALES
// =============================================

// Obtenir les commandes spéciales du client
router.get('/special-orders', clientController.getClientSpecialOrders);

// =============================================
// NOTIFICATIONS
// =============================================

// Obtenir les notifications
router.get('/notifications', clientController.getClientNotifications);

// Compter les notifications non lues
router.get('/notifications/unread-count', clientController.getUnreadNotificationCount);

// Marquer toutes les notifications comme lues
router.put('/notifications/read-all', clientController.markAllNotificationsAsRead);

// Marquer une notification comme lue
router.put('/notifications/:id/read', 
  validateNumericParam('id'),
  clientController.markNotificationAsRead
);

// Supprimer une notification
router.delete('/notifications/:id',
  validateNumericParam('id'),
  clientController.deleteNotification
);

module.exports = router;