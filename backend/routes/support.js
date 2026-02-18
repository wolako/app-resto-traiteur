// routes/support.js

const express = require('express');
const supportController = require('../controllers/supportController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// =============================================
// ROUTES BUSINESS (Restaurant & Traiteur)
// =============================================

/**
 * Créer un ticket de support
 * POST /api/support
 */
router.post('/',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  supportController.createTicket
);

/**
 * Obtenir ses propres tickets
 * GET /api/support/my-tickets
 */
router.get('/my-tickets',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  supportController.getBusinessTickets
);

/**
 * Obtenir un ticket par ID
 * GET /api/support/tickets/:id
 */
router.get('/tickets/:id',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR, USER_ROLES.SUPER_ADMIN),
  supportController.getTicketById
);

// =============================================
// ROUTES ADMIN
// =============================================

/**
 * Obtenir tous les tickets (Premium en premier)
 * GET /api/support/all
 */
router.get('/all',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  supportController.getAllTickets
);

/**
 * Répondre à un ticket
 * PUT /api/support/tickets/:id/respond
 */
router.put('/tickets/:id/respond',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  supportController.respondToTicket
);

/**
 * Mettre à jour le statut d'un ticket
 * PUT /api/support/tickets/:id/status
 */
router.put('/tickets/:id/status',
  authenticateToken,
  requireRole(USER_ROLES.SUPER_ADMIN),
  supportController.updateTicketStatus
);

module.exports = router;