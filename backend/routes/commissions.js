const express = require('express');
const router  = express.Router();
const commissionController = require('../controllers/commissionController');
const { authenticateToken, requireRole } = require('../middleware/auth');
// ✅ CORRECTION CLEF : importer USER_ROLES pour utiliser la bonne valeur
const { USER_ROLES } = require('../config/constants');

// ═══════════════════════════════════════════════════════════════
// ⚠️  RÈGLE CRITIQUE EXPRESS : routes STATIQUES avant DYNAMIQUES
//     /all, /my, /stats, /admin/... avant /:id  (sinon :id capture tout)
// ═══════════════════════════════════════════════════════════════

// ─── 1. Routes statiques business ────────────────────────────────────────────

router.get('/',
  authenticateToken,
  commissionController.getBusinessCommissions
);

router.get('/my',
  authenticateToken,
  commissionController.getBusinessCommissions
);

// ─── 2. Routes statiques admin ────────────────────────────────────────────────
// ✅ On utilise USER_ROLES.SUPER_ADMIN (même valeur que partout dans le projet)

router.get('/all',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.getAllCommissions
);

router.get('/stats',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.getCommissionStats
);

// Alias /admin/* gardés pour compatibilité
router.get('/admin/all',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.getAllCommissions
);

router.get('/admin/stats',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.getCommissionStats
);

// ─── 3. Route semi-dynamique — AVANT /:id ────────────────────────────────────

router.get('/business/:businessId',
  authenticateToken,
  commissionController.getCommissionsByBusinessId
);

// ─── 4. Routes dynamiques /:id — EN DERNIER ───────────────────────────────────

router.patch('/:id/collect',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.markAsCollected
);

router.patch('/:id/pay',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.markAsPaid
);

// Alias POST gardés pour compatibilité
router.post('/admin/:id/collect',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.markAsCollected
);

router.post('/admin/:id/pay',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  commissionController.markAsPaid
);

module.exports = router;