const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Public
router.get('/plans', subscriptionController.getAllPlans);

// ✅ NOUVEAU : Webhook CinetPay (pas d'auth — appelé par CinetPay)
router.post('/payment-notify', subscriptionController.handlePaymentNotify);

// Restaurant
router.get('/current',        authenticateToken, subscriptionController.getCurrentSubscription);
router.post('/subscribe',     authenticateToken, subscriptionController.subscribe);
router.post('/upgrade',       authenticateToken, subscriptionController.upgrade);
router.post('/cancel',        authenticateToken, subscriptionController.cancel);
router.get('/usage',          authenticateToken, subscriptionController.getUsageStats);

// ✅ NOUVEAU : Paiement CinetPay
router.post('/pay',                           authenticateToken, subscriptionController.initiateSubscriptionPayment);
router.get('/payment-status/:transaction_id', authenticateToken, subscriptionController.checkPaymentStatus);

// Admin
router.post('/plans',             authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.createPlan);
router.put('/plans/:id',          authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.updatePlan);
router.get('/admin/all',          authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getAllSubscriptions);
router.get('/admin/expiring',     authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getExpiringSubscriptions);
router.get('/admin/stats',        authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getSubscriptionStats);
router.get('/admin/commissions',  authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getPlatformCommissionStats);
router.post('/admin/expire-overdue', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.expireOverdue);

module.exports = router;