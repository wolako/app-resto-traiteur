// controllers/uploadController.js
const path = require('path');
const fs = require('fs');
const { HTTP_STATUS } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

/**
 * Upload une image pour un menu item
 * POST /api/upload/menu-item-image
 */
const uploadMenuItemImage = asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Aucun fichier fourni',
      code: 'NO_FILE'
    });
  }

  // Construire l'URL de l'image
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/menu-items/${req.file.filename}`;

  logger.info('Image de menu item uploadée', {
    userId: req.user.id,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Image uploadée avec succès',
    data: {
      filename: req.file.filename,
      url: imageUrl,
      size: req.file.size,
      mimetype: req.file.mimetype
    }
  });
});

/**
 * Supprimer une image de menu item
 * DELETE /api/upload/menu-item-image/:filename
 */
const deleteMenuItemImage = asyncHandler(async (req, res) => {
  const { filename } = req.params;

  // Vérifier que le filename ne contient pas de path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Nom de fichier invalide',
      code: 'INVALID_FILENAME'
    });
  }

  const filePath = path.join(__dirname, '../uploads/menu-items', filename);

  // Vérifier que le fichier existe
  if (!fs.existsSync(filePath)) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Fichier introuvable',
      code: 'FILE_NOT_FOUND'
    });
  }

  // Supprimer le fichier
  fs.unlinkSync(filePath);

  logger.info('Image de menu item supprimée', {
    userId: req.user.id,
    filename
  });

  res.json({
    success: true,
    message: 'Image supprimée avec succès'
  });
});

module.exports = {
  uploadMenuItemImage,
  deleteMenuItemImage
};