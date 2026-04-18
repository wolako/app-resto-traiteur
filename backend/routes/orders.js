const express = require('express');
const orderController = require('../controllers/orderController');
const { authenticateToken, requireRole, attachBusiness } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const { USER_ROLES } = require('../config/constants');
const { authenticateTokenOptional } = require('../middleware/auth');
const {
  checkMonthlyOrdersLimit,
  checkOnlineOrdersAllowed,
  checkSpecialOrdersAllowed
} = require('../middleware/subscriptionLimits');

const router = express.Router();

// ── Statistiques (avant /:id) ────────────────────────────────────
router.get('/statistics',
  authenticateToken,
  attachBusiness,
  orderController.getOrderStatistics
);

router.get('/special-statistics',
  authenticateToken,
  attachBusiness,
  orderController.getSpecialOrderStatistics
);

// ── Commandes spéciales /special/* ──────────────────────────────
router.post('/special',
  generalLimiter,
  authenticateTokenOptional,
  checkSpecialOrdersAllowed,
  validate('createSpecialOrder'),
  orderController.createSpecialOrder
);

// ✅ CORRIGÉ : USER_ROLES.CATERER supprimé (n'existe pas dans constants.js)
router.post('/special/:specialOrderId/send-quote',
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('specialOrderId'),
  orderController.sendSpecialOrderQuote
);

router.post('/special/:specialOrderId/accept-quote',
  generalLimiter,
  validateNumericParam('specialOrderId'),
  orderController.acceptSpecialOrderQuote
);

router.post('/special/:specialOrderId/confirm-deposit-cod',
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('specialOrderId'),
  orderController.confirmSpecialOrderDepositCOD
);

// ✅ CORRIGÉ
router.patch('/special/:id/status',
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('id'),
  orderController.updateSpecialOrderStatus
);

router.get('/special/:id',
  validateNumericParam('id'),
  orderController.getSpecialOrderById
);

// ── Routes par business ──────────────────────────────────────────
// ✅ CORRIGÉ
router.get('/businesses/:businessId/special-orders',
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('businessId'),
  orderController.getBusinessSpecialOrders
);

// ✅ CORRIGÉ
router.get('/businesses/:businessId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('businessId'),
  orderController.getBusinessOrders
);

router.get('/business/:businessId/cod-stats',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('businessId'),
  orderController.getCodStats
);

// ── Routes racine ────────────────────────────────────────────────
router.post('/',
  generalLimiter,
  authenticateTokenOptional,
  checkOnlineOrdersAllowed,
  checkMonthlyOrdersLimit,
  validate('createOrder'),
  orderController.createOrder
);

router.get('/',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  orderController.getAllOrders
);

// ── Routes avec /:id (toujours en dernier) ───────────────────────
router.post('/:orderId/confirm-cod-payment',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  orderController.confirmCodPayment
);

// ✅ CORRIGÉ
router.patch('/:id/status',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  validate('updateOrderStatus'),
  orderController.updateOrderStatus
);

router.patch('/:id/payment-status',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('id'),
  orderController.updatePaymentStatus
);

// ⚠️ Toujours en dernier
router.get('/:id',
  validateNumericParam('id'),
  orderController.getOrderById
);

module.exports = router;