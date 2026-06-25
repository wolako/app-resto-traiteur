const express      = require('express');
const menuController = require('../controllers/menuController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { USER_ROLES } = require('../config/constants');
const { upload, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// ✅ Route upload image (avant les routes avec :itemId)
router.post('/upload-image',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  upload.single('image'),
  handleUploadError,
  menuController.uploadMenuItemImage
);

router.put('/:itemId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('itemId'),
  validate('updateMenuItem'),
  menuController.updateMenuItem
);

router.delete('/:itemId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  validateNumericParam('itemId'),
  menuController.deleteMenuItem
);

module.exports = router;