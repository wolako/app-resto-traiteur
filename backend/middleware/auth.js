const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');
const { USER_ROLES, HTTP_STATUS, ERROR_CODES } = require('../config/constants');

// Middleware d'authentification JWT
const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Token d\'accès requis',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier que l'utilisateur existe toujours
    const result = await pool.query(
      'SELECT id, email, role, first_name, last_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length === 0) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Utilisateur introuvable',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Compte désactivé',
        code: ERROR_CODES.FORBIDDEN,
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Token invalide',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Token expiré',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    console.error('Erreur middleware auth:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur d\'authentification',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
};

// ✅ NOUVEAU: Middleware d'authentification optionnel
// N'échoue pas si le token est absent ou invalide
const authenticateTokenOptional = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next(); // Pas de token, on continue quand même
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Vérifier que l'utilisateur existe toujours
    const result = await pool.query(
      'SELECT id, email, role, first_name, last_name, is_active FROM users WHERE id = $1',
      [decoded.userId]
    );

    if (result.rows.length > 0 && result.rows[0].is_active) {
      req.user = result.rows[0];
    }

    next();
  } catch (error) {
    // En cas d'erreur (token invalide, expiré, etc.), on continue sans user
    next();
  }
};

// Middleware de vérification des rôles
const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: 'Authentification requise',
        code: ERROR_CODES.UNAUTHORIZED,
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Permissions insuffisantes',
        code: ERROR_CODES.FORBIDDEN,
      });
    }

    next();
  };
};

// Middleware pour récupérer le business de l'utilisateur connecté
const attachBusiness = async (req, res, next) => {
  try {
    if (!req.user || ![USER_ROLES.RESTAURANT, USER_ROLES.CATERER, USER_ROLES.TRAITEUR].includes(req.user.role)) {
      return next();
    }

    const result = await pool.query(
      'SELECT * FROM businesses WHERE user_id = $1 AND is_active = true',
      [req.user.id]
    );

    if (result.rows.length > 0) {
      req.business = result.rows[0];
    }

    next();
  } catch (error) {
    console.error('Erreur middleware attachBusiness:', error);
    next();
  }
};

// Middleware pour vérifier la propriété du business
const requireBusinessOwnership = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.params.id;
    
    if (!businessId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'ID établissement requis',
        code: ERROR_CODES.VALIDATION_ERROR,
      });
    }

    // Super-admin peut accéder à tous les établissements
    if (req.user.role === USER_ROLES.SUPER_ADMIN) {
      return next();
    }

    const result = await pool.query(
      'SELECT user_id FROM businesses WHERE id = $1',
      [businessId]
    );

    if (result.rows.length === 0) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Établissement introuvable',
        code: ERROR_CODES.NOT_FOUND,
      });
    }

    if (result.rows[0].user_id !== req.user.id) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Accès non autorisé à cet établissement',
        code: ERROR_CODES.FORBIDDEN,
      });
    }

    next();
  } catch (error) {
    console.error('Erreur middleware requireBusinessOwnership:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur de vérification des permissions',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
};

// Middleware pour vérifier l'accès analytics (plan payant)
const requireAnalyticsAccess = async (req, res, next) => {
  try {
    const businessId = req.params.businessId || req.params.id;

    const result = await pool.query(`
      SELECT sp.analytics_access
      FROM businesses b
      JOIN business_subscriptions bs ON bs.business_id = b.id AND bs.status = 'active'
      JOIN subscription_plans sp ON sp.id = bs.plan_id
      WHERE b.id = $1
    `, [businessId]);

    if (result.rows.length === 0 || !result.rows[0].analytics_access) {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Fonctionnalité réservée aux plans payants',
        code: ERROR_CODES.FORBIDDEN,
        upgrade_required: true
      });
    }

    next();
  } catch (error) {
    console.error('Erreur middleware requireAnalyticsAccess:', error);
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur de vérification des permissions',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
};

module.exports = {
  authenticateToken,
  authenticateTokenOptional,
  requireRole,
  attachBusiness,
  requireBusinessOwnership,
  requireAnalyticsAccess,
};