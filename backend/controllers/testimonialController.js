// backend/controllers/testimonialController.js

const testimonialService = require('../services/testimonialService');

/**
 * GET /api/testimonials/public
 * Récupérer les témoignages approuvés (public)
 */
const getPublicTestimonials = async (req, res) => {
  try {
    const featured = req.query.featured === 'true';
    const limit = parseInt(req.query.limit) || 10;

    const testimonials = await testimonialService.getApprovedTestimonials(featured, limit);

    res.status(200).json({
      success: true,
      data: testimonials
    });
  } catch (error) {
    console.error('Error getting public testimonials:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des témoignages'
    });
  }
};

/**
 * POST /api/testimonials/submit
 * Soumettre un nouveau témoignage
 */
const submitTestimonial = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rating, comment, displayName, allowPhoto } = req.body;

    const testimonial = await testimonialService.submitTestimonial(userId, {
      rating,
      comment,
      displayName,
      allowPhoto
    });

    res.status(201).json({
      success: true,
      message: 'Votre témoignage a été soumis et est en attente de validation',
      data: testimonial
    });
  } catch (error) {
    console.error('Error submitting testimonial:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la soumission du témoignage'
    });
  }
};

/**
 * GET /api/testimonials/my-testimonial
 * Récupérer son propre témoignage
 */
const getMyTestimonial = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await testimonialService.getUserTestimonial(userId);

    res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error getting user testimonial:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération du témoignage'
    });
  }
};

/**
 * PUT /api/testimonials/my-testimonial
 * Mettre à jour son propre témoignage
 */
const updateMyTestimonial = async (req, res) => {
  try {
    const userId = req.user.id;
    const { rating, comment, displayName, allowPhoto } = req.body;

    const testimonial = await testimonialService.updateMyTestimonial(userId, {
      rating,
      comment,
      displayName,
      allowPhoto
    });

    res.status(200).json({
      success: true,
      message: 'Votre témoignage a été mis à jour',
      data: testimonial
    });
  } catch (error) {
    console.error('Error updating testimonial:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du témoignage'
    });
  }
};

/**
 * GET /api/testimonials/admin/all
 * Récupérer tous les témoignages (admin)
 */
const getAllTestimonials = async (req, res) => {
  try {
    const status = req.query.status || null;
    const testimonials = await testimonialService.getAllTestimonials(status);

    res.status(200).json({
      success: true,
      data: testimonials
    });
  } catch (error) {
    console.error('Error getting all testimonials:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des témoignages'
    });
  }
};

/**
 * GET /api/testimonials/admin/stats
 * Récupérer les statistiques
 */
const getTestimonialStats = async (req, res) => {
  try {
    const stats = await testimonialService.getTestimonialStats();

    res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting testimonial stats:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la récupération des statistiques'
    });
  }
};

/**
 * PUT /api/testimonials/admin/:id/approve
 * Approuver un témoignage
 */
const approveTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const { featured } = req.body;

    const testimonial = await testimonialService.approveTestimonial(
      parseInt(id),
      featured || false
    );

    res.status(200).json({
      success: true,
      message: `Témoignage approuvé${featured ? ' et mis en vedette' : ''}`,
      data: testimonial
    });
  } catch (error) {
    console.error('Error approving testimonial:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'approbation du témoignage'
    });
  }
};

/**
 * PUT /api/testimonials/admin/:id/reject
 * Rejeter un témoignage
 */
const rejectTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const testimonial = await testimonialService.rejectTestimonial(
      parseInt(id),
      reason || null
    );

    res.status(200).json({
      success: true,
      message: 'Témoignage rejeté',
      data: testimonial
    });
  } catch (error) {
    console.error('Error rejecting testimonial:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors du rejet du témoignage'
    });
  }
};

/**
 * PATCH /api/testimonials/admin/:id/toggle-featured
 * Basculer le statut featured
 */
const toggleFeatured = async (req, res) => {
  try {
    const { id } = req.params;
    const testimonial = await testimonialService.toggleFeatured(parseInt(id));

    res.status(200).json({
      success: true,
      message: `Témoignage ${testimonial.is_featured ? 'mis en vedette' : 'retiré de la vedette'}`,
      data: testimonial
    });
  } catch (error) {
    console.error('Error toggling featured:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la mise à jour du statut featured'
    });
  }
};

/**
 * DELETE /api/testimonials/admin/:id
 * Supprimer un témoignage
 */
const deleteTestimonial = async (req, res) => {
  try {
    const { id } = req.params;
    await testimonialService.deleteTestimonial(parseInt(id));

    res.status(200).json({
      success: true,
      message: 'Témoignage supprimé avec succès'
    });
  } catch (error) {
    console.error('Error deleting testimonial:', error);
    
    if (error.status) {
      return res.status(error.status).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: 'Erreur lors de la suppression du témoignage'
    });
  }
};

module.exports = {
  getPublicTestimonials,
  submitTestimonial,
  getMyTestimonial,
  updateMyTestimonial,
  getAllTestimonials,
  getTestimonialStats,
  approveTestimonial,
  rejectTestimonial,
  toggleFeatured,
  deleteTestimonial
};