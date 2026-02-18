// routes/menus.js - AVEC VÉRIFICATIONS DES LIMITES
const express = require('express');
const menuController = require('../controllers/menuController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { USER_ROLES } = require('../config/constants');
const { checkMenuItemsLimit } = require('../middleware/subscriptionLimits'); // ✅ AJOUTÉ

const router = express.Router();

// Routes publiques pour consultation
router.get('/:menuId/items',
  validateNumericParam('menuId'),
  menuController.getMenuItems
);

// Routes protégées pour les propriétaires
router.get('/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  menuController.getMenuById
);

router.put('/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  validate('updateMenu'),
  menuController.updateMenu
);

router.delete('/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  menuController.deleteMenu
);

// ✅ VÉRIFICATION: Limite d'articles de menu
router.post('/:menuId/items',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('menuId'),
  checkMenuItemsLimit, // ✅ NOUVEAU: Vérifier la limite AVANT validation
  validate('createMenuItem'),
  menuController.createMenuItem
);

module.exports = router;