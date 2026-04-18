// routes/reservations.js - AVEC VÉRIFICATIONS DES LIMITES
const express = require('express');
const reservationController = require('../controllers/reservationController');
const { authenticateToken, requireRole, attachBusiness } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { generalLimiter } = require('../middleware/rateLimiter');
const { USER_ROLES } = require('../config/constants');
const { authenticateTokenOptional } = require('../middleware/auth');
const { checkReservationsAllowed } = require('../middleware/subscriptionLimits'); // ✅ AJOUTÉ

const router = express.Router();

// ✅ Route publique pour créer une réservation (AVEC VÉRIFICATION)
router.post('/',
  generalLimiter,
  authenticateTokenOptional,
  checkReservationsAllowed,
  validate('createReservation'),
  reservationController.createReservation
);

// Route publique pour obtenir les créneaux disponibles
router.get('/restaurants/:restaurantId/available-slots',
  validateNumericParam('restaurantId'),
  reservationController.getAvailableTimeSlots
);

// ✅ NOUVEAU : Confirmer acompte COD
router.post('/:reservationId/confirm-deposit-cod',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('reservationId'),
  reservationController.confirmDepositCOD
);

// Routes publiques pour consultation
router.get('/:id',
  validateNumericParam('id'),
  reservationController.getReservationById
);

// Routes protégées
router.get('/',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  reservationController.getAllReservations
);

router.get('/restaurants/:restaurantId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.SUPER_ADMIN),
  validateNumericParam('restaurantId'),
  reservationController.getRestaurantReservations
);

router.patch('/:id/status',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT),
  validateNumericParam('id'),
  validate('updateReservationStatus'),
  reservationController.updateReservationStatus
);

router.get('/statistics',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.SUPER_ADMIN),
  attachBusiness,
  reservationController.getReservationStatistics
);

module.exports = router;