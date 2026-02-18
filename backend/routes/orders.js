// routes/orders.js - AVEC VÉRIFICATIONS DES LIMITES
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
} = require('../middleware/subscriptionLimits'); // ✅ AJOUTÉ

const router = express.Router();

// ⚠️ IMPORTANT: Les routes spécifiques DOIVENT être avant les routes génériques

// ✅ Routes pour commandes spéciales (AVEC VÉRIFICATION)
router.post('/special', 
  generalLimiter,
  authenticateTokenOptional,
  checkSpecialOrdersAllowed, // ✅ NOUVEAU: Vérifier si autorisé
  validate('createSpecialOrder'),
  orderController.createSpecialOrder
);

router.get('/special/:id', 
  validateNumericParam('id'), 
  orderController.getSpecialOrderById
);

router.patch('/special/:id/status', 
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR, USER_ROLES.CATERER, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('id'), 
  orderController.updateSpecialOrderStatus
);

router.get('/special-statistics', 
  authenticateToken,
  attachBusiness,
  orderController.getSpecialOrderStatistics
);

// ✅ Route pour les commandes spéciales d'un business
router.get('/businesses/:businessId/special-orders',
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR, USER_ROLES.CATERER, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('businessId'),
  orderController.getBusinessSpecialOrders
);

// ✅ Route pour les commandes d'un business (AVANT /:id)
router.get('/businesses/:businessId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.CATERER, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('businessId'),
  orderController.getBusinessOrders
);

// Routes pour statistiques
router.get('/statistics',
  authenticateToken,
  attachBusiness,
  orderController.getOrderStatistics
);

// ✅ Route publique pour créer une commande normale (AVEC VÉRIFICATIONS)
router.post('/',
  generalLimiter,
  authenticateTokenOptional,
  checkOnlineOrdersAllowed,  // ✅ NOUVEAU: Vérifier si commandes en ligne autorisées
  checkMonthlyOrdersLimit,   // ✅ NOUVEAU: Vérifier limite mensuelle
  validate('createOrder'),
  orderController.createOrder
);

// Routes protégées pour toutes les commandes (admin uniquement)
router.get('/',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  orderController.getAllOrders
);

// Mise à jour du statut d'une commande
router.patch('/:id/status',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.CATERER),
  validateNumericParam('id'),
  validate('updateOrderStatus'),
  orderController.updateOrderStatus
);

// Après la route updateOrderStatus
router.patch('/:id/payment-status',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('id'),
  orderController.updatePaymentStatus
);

// ⚠️ Cette route DOIT être en dernier car elle capture tout /:id
router.get('/:id',
  validateNumericParam('id'),
  orderController.getOrderById
);

module.exports = router;