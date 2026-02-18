// routes/reviews.js - VERSION GUEST SUPPORT

const express = require('express');
const reviewController = require('../controllers/reviewController');
const { authenticateToken, authenticateTokenOptional, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// =============================================
// ROUTES PUBLIQUES
// =============================================

/**
 * Obtenir les avis d'un business (PUBLIC)
 * GET /api/reviews/business/:businessId
 */
router.get('/business/:businessId',
  reviewController.getBusinessReviews
);

// =============================================
// ROUTES STATIQUES AUTHENTIFIÉES (avant /:id)
// =============================================

/**
 * Obtenir mes avis (CLIENT connecté)
 * GET /api/reviews/my-reviews
 */
router.get('/my-reviews',
  authenticateToken,
  reviewController.getUserReviews
);

/**
 * Vérifier si j'ai déjà noté (CLIENT connecté)
 * GET /api/reviews/check/:businessId
 */
router.get('/check/:businessId',
  authenticateToken,
  reviewController.checkUserReview
);

// =============================================
// CRÉATION D'AVIS - CLIENT CONNECTÉ OU INVITÉ
// =============================================

/**
 * Créer un avis
 * POST /api/reviews
 *
 * ✅ authenticateTokenOptional : fonctionne pour :
 *    - CLIENT connecté  → req.user est rempli
 *    - INVITÉ anonyme   → req.user est undefined
 *
 * Payload client  : { business_id, rating, comment?, order_id? }
 * Payload invité  : { business_id, rating, comment?, guest_name, guest_phone }
 */
router.post('/',
  authenticateTokenOptional,
  reviewController.createReview
);

// =============================================
// ROUTES AVEC RÔLES SPÉCIFIQUES
// =============================================

/**
 * Répondre à un avis (RESTAURANT ou TRAITEUR)
 * PUT /api/reviews/:id/respond  ← doit être avant /:id
 */
router.put('/:id/respond',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  reviewController.respondToReview
);

/**
 * Modifier un avis (CLIENT uniquement)
 * PUT /api/reviews/:id
 */
router.put('/:id',
  authenticateToken,
  requireRole(USER_ROLES.CLIENT),
  reviewController.updateReview
);

/**
 * Supprimer un avis (CLIENT uniquement)
 * DELETE /api/reviews/:id
 */
router.delete('/:id',
  authenticateToken,
  requireRole(USER_ROLES.CLIENT),
  reviewController.deleteReview
);

module.exports = router;