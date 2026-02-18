const express = require('express');
const businessController = require('../controllers/businessController');
const { authenticateToken, requireRole, requireBusinessOwnership } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Routes publiques
router.get('/', businessController.getAllBusinesses);
router.get('/restaurants', businessController.getRestaurants);
router.get('/caterers/available', businessController.getAvailableCaterers);
router.get('/:id', validateNumericParam('id'), businessController.getBusinessById);

// Routes pour les menus (publique pour consultation)
router.get('/:businessId/menus',
  validateNumericParam('businessId'),
  businessController.getBusinessMenus
);

// Routes protégées pour les propriétaires d'établissements
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

// Gestion des menus
router.post('/:businessId/menus',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('businessId'),
  requireBusinessOwnership,
  validate('createMenu'),
  businessController.createMenu
);

module.exports = router;