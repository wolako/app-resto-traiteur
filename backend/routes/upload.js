// routes/upload.js
const express = require('express');
const uploadController = require('../controllers/uploadController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

// Upload image de menu item
router.post('/menu-item-image',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  upload.single('image'),
  handleUploadError,
  uploadController.uploadMenuItemImage
);

// Supprimer image de menu item
router.delete('/menu-item-image/:filename',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  uploadController.deleteMenuItemImage
);

module.exports = router;