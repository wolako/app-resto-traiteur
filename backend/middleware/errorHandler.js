const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const logger = require('../utils/logger');

// Middleware de gestion des erreurs
const errorHandler = (err, req, res, next) => {
  logger.error('Erreur non gérée:', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });

  // Erreur de validation Joi
  if (err.isJoi) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Données invalides',
      code: ERROR_CODES.VALIDATION_ERROR,
      errors: err.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
      })),
    });
  }

  // Erreur de base de données PostgreSQL
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        return res.status(HTTP_STATUS.CONFLICT).json({
          success: false,
          message: 'Données en conflit (doublon détecté)',
          code: ERROR_CODES.CONFLICT,
        });

      case '23503': // Foreign key violation
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Référence invalide',
          code: ERROR_CODES.VALIDATION_ERROR,
        });

      case '23502': // Not null violation
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Champ requis manquant',
          code: ERROR_CODES.VALIDATION_ERROR,
        });

      case '23514': // Check constraint violation
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'Valeur invalide',
          code: ERROR_CODES.VALIDATION_ERROR,
        });
    }
  }

  // Erreur JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Token invalide',
      code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Token expiré',
      code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  // Erreur par défaut
  res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: process.env.NODE_ENV === 'production' 
      ? 'Une erreur interne s\'est produite'
      : err.message,
    code: ERROR_CODES.INTERNAL_ERROR,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

// Middleware pour les routes non trouvées
const notFoundHandler = (req, res) => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: `Route ${req.method} ${req.url} introuvable`,
    code: ERROR_CODES.NOT_FOUND,
  });
};

// Wrapper pour les fonctions async
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  notFoundHandler,
  asyncHandler,
};