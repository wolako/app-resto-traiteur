const express = require('express');
const businessController = require('../controllers/businessController');
const { authenticateToken, requireRole, requireBusinessOwnership } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// ── Routes publiques ──────────────────────────────────────────
router.get('/', businessController.getAllBusinesses);
router.get('/restaurants', businessController.getRestaurants);
router.get('/caterers/available', businessController.getAvailableCaterers);
router.get('/:id', validateNumericParam('id'), businessController.getBusinessById);

// Géolocalisation — AVANT /:id pour éviter le conflit de routing
router.get('/nearby', businessController.getBusinessesNearby);

router.get('/by-district', businessController.getBusinessesByDistrict);

// Profil public complet (branding + menus + reviews)
router.get('/:id/profile',
  validateNumericParam('id'),
  businessController.getPublicProfile
);

// Routes pour les menus (publique pour consultation)
router.get('/:businessId/menus',
  validateNumericParam('businessId'),
  businessController.getBusinessMenus
);

// ── Routes protégées ──────────────────────────────────────────
router.put('/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  validate('updateBusiness'),
  businessController.updateBusiness
);

router.patch('/:id/hours',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  validate('updateHours'),
  businessController.updateHours
);

router.patch('/:id/availability',
  authenticateToken,
  requireRole(USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  businessController.updateAvailability
);

router.post('/:businessId/menus',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('businessId'),
  requireBusinessOwnership,
  validate('createMenu'),
  businessController.createMenu
);

router.get('/:id/revenue-stats',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  businessController.getRevenueStats
);

module.exports = router;