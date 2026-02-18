// routes/branding.js

const express = require('express');
const brandingController = require('../controllers/brandingController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

/**
 * Obtenir le branding d'un business (PUBLIC)
 * GET /api/branding/:businessId
 */
router.get('/:businessId',
  brandingController.getBranding
);

/**
 * Mettre à jour son branding (Premium uniquement)
 * PUT /api/branding
 */
router.put('/',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  brandingController.updateBranding
);

/**
 * Supprimer son branding (réinitialiser)
 * DELETE /api/branding
 */
router.delete('/',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  brandingController.deleteBranding
);

module.exports = router;