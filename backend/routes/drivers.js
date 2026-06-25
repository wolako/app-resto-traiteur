// routes/drivers.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/driverController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

// ── Routes LIVREUR (interface mobile) ──────────────────────
// router.use('/me', authenticateToken, requireRole('driver'));

// router.get('/me/orders',            ctrl.getMyOrders);
// router.patch('/me/status',          ctrl.toggleStatus);
// router.patch('/me/change-password', ctrl.changePassword);
// router.patch('/me/orders/:orderId/pickup',  ctrl.pickupOrder);
// router.patch('/me/orders/:orderId/deliver', ctrl.deliverOrder);
// router.patch('/me/orders/:orderId/fail',    ctrl.failOrder);

const meRouter = express.Router();
meRouter.use(authenticateToken, requireRole('driver'));

meRouter.get('/orders',                   ctrl.getMyOrders);
meRouter.patch('/status',                 ctrl.toggleStatus);
meRouter.patch('/change-password',        ctrl.changePassword);
meRouter.patch('/orders/:orderId/accept',  ctrl.acceptOrder);
meRouter.patch('/orders/:orderId/refuse', ctrl.refuseOrder);
meRouter.patch('/orders/:orderId/pickup', ctrl.pickupOrder);
meRouter.patch('/orders/:orderId/deliver',ctrl.deliverOrder);
meRouter.patch('/orders/:orderId/fail',   ctrl.failOrder);

router.use('/me', meRouter);

// ── Routes ÉTABLISSEMENT & ADMIN ────────────────────────────
// Créer un livreur
router.post('/',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.createDriver
);

// Livreurs d'un établissement
router.get('/business/:businessId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.getBusinessDrivers
);

// Tous les livreurs (admin)
router.get('/',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  ctrl.getAllDrivers
);

// Modifier / désactiver
router.patch('/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.updateDriver
);
router.delete('/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.deleteDriver
);

// Toggle activer/désactiver un livreur
router.patch(
  '/:driverId/toggle-active',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.toggleDriverActive
);

// ✅ Suppression définitive d'un livreur
router.delete(
  '/:driverId/permanent',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.deleteDriverPermanently
);

// Assigner / désassigner à une commande
router.post('/orders/:orderId/assign',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.assignDriver
);
router.delete('/orders/:orderId/assign',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  ctrl.unassignDriver
);

module.exports = router;