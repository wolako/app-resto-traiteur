const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticateToken, requireRole } = require('../middleware/auth');


// Public - Obtenir tous les plans
router.get('/plans', subscriptionController.getAllPlans);

// Restaurant - Gestion abonnement
router.get('/current', authenticateToken, subscriptionController.getCurrentSubscription);
router.post('/subscribe', authenticateToken, subscriptionController.subscribe);
router.post('/upgrade', authenticateToken, subscriptionController.upgrade);
router.post('/cancel', authenticateToken, subscriptionController.cancel);
router.get('/usage', authenticateToken, subscriptionController.getUsageStats);

// Admin - Gestion des plans
router.post('/plans', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.createPlan);
router.put('/plans/:id', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.updatePlan);
router.get('/admin/all', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getAllSubscriptions);
router.get('/admin/expiring', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getExpiringSubscriptions);

// Admin - Statistiques
router.get('/admin/stats', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getSubscriptionStats);
router.get('/admin/commissions', authenticateToken, requireRole('USER_ROLES.SUPER_ADMIN'), subscriptionController.getPlatformCommissionStats);

module.exports = router;