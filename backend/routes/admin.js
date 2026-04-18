// admin.routes.js — VERSION CORRIGÉE
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

// --- Toutes les routes admin nécessitent authentification + rôle admin ---
router.use(authenticateToken);
router.use(requireRole(USER_ROLES.SUPER_ADMIN));

// =============================================
// GESTION DES UTILISATEURS
// =============================================
router.get('/users', adminController.getAllUsers);
router.put('/users/:userId/status', adminController.updateUserStatus);
router.delete('/users/:userId', adminController.deleteUser);

// =============================================
// GESTION DES ÉTABLISSEMENTS
// =============================================
router.get('/businesses', adminController.getAllBusinesses);
router.get('/businesses/:businessId', adminController.getBusinessById);
router.put('/businesses/:businessId', adminController.updateBusiness);
router.put('/businesses/:businessId/status', adminController.updateBusinessStatus);
router.delete('/businesses/:businessId', adminController.deleteBusiness);

// =============================================
// ✅ COMMANDES (manquaient dans les routes !)
// =============================================
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:orderId', adminController.getOrderById);
router.put('/orders/:orderId/status', adminController.updateOrderStatus);

// =============================================
// ✅ RÉSERVATIONS (manquaient dans les routes !)
// =============================================
router.get('/reservations', adminController.getAllReservations);
router.get('/reservations/:reservationId', adminController.getReservationById);
router.put('/reservations/:reservationId/status', adminController.updateReservationStatus);

// =============================================
// PAIEMENTS
// =============================================
router.get('/payments', adminController.getAllPayments);

// =============================================
// STATISTIQUES ET ANALYTICS
// =============================================
router.get('/statistics', adminController.getGlobalStatistics);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);

// =============================================
// LOGS
// =============================================
router.get('/logs', adminController.getActivityLogs);

// =============================================
// ABONNEMENTS & RAPPELS (ADMIN)
// =============================================
router.get('/subscriptions', adminController.getAllSubscriptions);
router.post('/subscriptions/trigger-reminders', adminController.triggerExpiryReminders);
router.get('/subscriptions/reminders-history', adminController.getRemindersHistory);
router.post('/subscriptions/:subscriptionId/send-reminder', adminController.sendManualReminder);

// =============================================
// COMPTES DE PAIEMENT (BUSINESS PAYMENT ACCOUNTS)
// =============================================
router.get('/payment-accounts',                             adminController.getAllPaymentAccounts);
router.put('/payment-accounts/:accountId/verify',          adminController.verifyPaymentAccount);
router.put('/payment-accounts/:accountId/reject',          adminController.rejectPaymentAccount);
router.put('/payment-accounts/:accountId/suspend',         adminController.suspendPaymentAccount);

module.exports = router;