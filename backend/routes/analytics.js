const express = require('express');
const router = express.Router();
const {
  authenticateToken, requireRole, requireBusinessOwnership
} = require('../middleware/auth');
const { validateNumericParam } = require('../middleware/validation');
const { USER_ROLES } = require('../config/constants');
const {
  getBusinessOverview, getPopularItems, getConversionRate,
  getTimeline, getGlobalStats, trackClientEvent
} = require('../controllers/analyticsController');

// ✅ CORRIGÉ : requireAnalyticsAccess retiré — tous les établissements
// ont accès aux analytics de base (overview, items populaires, timeline)
// L'accès premium (analytics avancées) est géré côté frontend par feature flags

router.get('/business/:id/overview',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  getBusinessOverview
);

router.get('/business/:id/popular-items',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  getPopularItems
);

router.get('/business/:id/conversion',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  getConversionRate
);

router.get('/business/:id/timeline',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('id'),
  requireBusinessOwnership,
  getTimeline
);

// Admin uniquement
router.get('/admin/global',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  getGlobalStats
);

// Tracking public (fire-and-forget)
router.post('/track', trackClientEvent);

module.exports = router;