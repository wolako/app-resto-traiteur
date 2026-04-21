// backend/routes/testimonials.js

const express = require('express');
const router = express.Router();
const testimonialController = require('../controllers/testimonialController');
const { 
  validateCreateTestimonial, 
  validateUpdateTestimonial,
  validateApproveTestimonial,
  validateRejectTestimonial
} = require('../middleware/testimonial');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');


// =============================================
// PUBLIC ROUTES
// =============================================

/**
 * @route   GET /api/testimonials/public
 * @desc    Récupérer les témoignages approuvés (public)
 * @query   featured: boolean (optional)
 * @query   limit: number (optional, default 10)
 * @access  Public
 */
router.get('/public', testimonialController.getPublicTestimonials);

// =============================================
// CLIENT ROUTES (Authenticated)
// =============================================

/**
 * @route   POST /api/testimonials/submit
 * @desc    Soumettre un nouveau témoignage
 * @body    { rating, comment, displayName?, allowPhoto? }
 * @access  Private (Client)
 */
router.post(
  '/submit',
  authenticateToken,
  validateCreateTestimonial,
  testimonialController.submitTestimonial
);

/**
 * @route   GET /api/testimonials/my-testimonial
 * @desc    Récupérer son propre témoignage
 * @access  Private (Client)
 */
router.get(
  '/my-testimonial',
  authenticateToken,
  testimonialController.getMyTestimonial
);

/**
 * @route   PUT /api/testimonials/my-testimonial
 * @desc    Mettre à jour son propre témoignage (si pending ou rejected)
 * @body    { rating?, comment?, displayName?, allowPhoto? }
 * @access  Private (Client)
 */
router.put(
  '/my-testimonial',
  authenticateToken,
  validateUpdateTestimonial,
  testimonialController.updateMyTestimonial
);

// =============================================
// ADMIN ROUTES
// =============================================

/**
 * @route   GET /api/testimonials/admin/all
 * @desc    Récupérer tous les témoignages
 * @query   status: string (optional) - pending|approved|rejected
 * @access  Private (Admin)
 */
router.get(
  '/admin/all',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  testimonialController.getAllTestimonials
);

/**
 * @route   GET /api/testimonials/admin/stats
 * @desc    Récupérer les statistiques des témoignages
 * @access  Private (Admin)
 */
router.get(
  '/admin/stats',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  testimonialController.getTestimonialStats
);

/**
 * @route   GET /api/testimonials/check-eligibility
 * @desc    Vérifier l'éligibilité de l'utilisateur
 * @access  Private
 */
router.get(
  '/check-eligibility',
  authenticateToken,
  testimonialController.checkEligibility
);

/**
 * @route   PUT /api/testimonials/admin/:id/approve
 * @desc    Approuver un témoignage
 * @params  id: number
 * @body    { featured?: boolean }
 * @access  Private (Admin)
 */
router.put(
  '/admin/:id/approve',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  validateApproveTestimonial,
  testimonialController.approveTestimonial
);

/**
 * @route   PUT /api/testimonials/admin/:id/reject
 * @desc    Rejeter un témoignage
 * @params  id: number
 * @body    { reason?: string }
 * @access  Private (Admin)
 */
router.put(
  '/admin/:id/reject',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  validateRejectTestimonial,
  testimonialController.rejectTestimonial
);

/**
 * @route   PATCH /api/testimonials/admin/:id/toggle-featured
 * @desc    Basculer le statut featured d'un témoignage
 * @params  id: number
 * @access  Private (Admin)
 */
router.patch(
  '/admin/:id/toggle-featured',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  testimonialController.toggleFeatured
);

/**
 * @route   DELETE /api/testimonials/admin/:id
 * @desc    Supprimer un témoignage
 * @params  id: number
 * @access  Private (Admin)
 */
router.delete(
  '/admin/:id',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  testimonialController.deleteTestimonial
);

module.exports = router;