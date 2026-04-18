const express = require('express');
const brandingController = require('../controllers/brandingController');
const { authenticateToken, requireRole, attachBusiness } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');
const uploadLogo = require('../middleware/uploadLogo');
const { uploadBanner, uploadCover, uploadGallery } = require('../middleware/uploadbannergallery');

const router = express.Router();

const multerWrap = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (err instanceof require('multer').MulterError) {
      return res.status(400).json({ success: false, error: `Erreur upload: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });
};

// ✅ IMPORTANT : routes statiques AVANT /:businessId
// Sinon Express capture 'upload-cover' comme businessId

router.post('/upload-logo',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  multerWrap(uploadLogo.single('logo')),
  brandingController.uploadLogo
);

router.post('/upload-banner',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  multerWrap(uploadBanner.single('banner')),
  brandingController.uploadBanner
);

router.post('/upload-cover',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  multerWrap(uploadCover.single('cover')),
  brandingController.uploadCover
);

router.put('/cover-url',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  brandingController.updateCoverUrl
);

router.post('/upload-gallery',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  multerWrap(uploadGallery.single('photo')),
  brandingController.uploadGalleryPhoto
);

router.delete('/gallery',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  brandingController.deleteGalleryPhoto
);

router.delete('/',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  brandingController.deleteBranding
);

// ✅ Routes paramétriques EN DERNIER
router.get('/:businessId', brandingController.getBranding);

router.put('/:businessId',
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
  attachBusiness,
  brandingController.updateBranding
);

module.exports = router;