const express = require('express');
const menuController = require('../controllers/menuController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Routes pour la gestion des items de menu
router.put('/:itemId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('itemId'),
  validate('updateMenuItem'),
  menuController.updateMenuItem
);

router.delete('/:itemId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('itemId'),
  menuController.deleteMenuItem
);

module.exports = router;