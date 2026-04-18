// routes/contact.js
const express           = require('express');
const contactController = require('../controllers/contactController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES }    = require('../config/constants');

const router = express.Router();

// ── Public — formulaire de contact ───────────────────────────
router.post('/', contactController.sendMessage);

// ── Superadmin uniquement ─────────────────────────────────────
// USER_ROLES.SUPER_ADMIN = 'superadmin'
router.get(   '/',            authenticateToken, requireRole(USER_ROLES.SUPER_ADMIN), contactController.getMessages);
router.get(   '/:id',         authenticateToken, requireRole(USER_ROLES.SUPER_ADMIN), contactController.getMessage);
router.patch( '/:id/reply',   authenticateToken, requireRole(USER_ROLES.SUPER_ADMIN), contactController.replyToMessage);
router.patch( '/:id/archive', authenticateToken, requireRole(USER_ROLES.SUPER_ADMIN), contactController.archiveMessage);

module.exports = router;