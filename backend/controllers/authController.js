const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Business = require('../models/Business');
const PasswordResetToken = require('../models/PasswordResetToken');
const { emailService } = require('../services/emailService');
const { HTTP_STATUS, ERROR_CODES, USER_ROLES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const EmailVerificationToken = require('../models/EmailVerificationToken');
const pool = require('../config/db');

// Générer un token JWT
// Générer un token JWT COMPLET
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,
      userId: user.id,  // Support legacy
      email: user.email,
      role: user.role,
      first_name: user.first_name,
      last_name: user.last_name
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
};

// Inscription
const register = asyncHandler(async (req, res) => {
  const {
    email,
    password,
    role,
    first_name,
    last_name,
    phone,
    business_name,
    business_type
  } = req.body;

  // Vérifier si l'utilisateur existe déjà
  const existingUser = await User.findByEmail(email);
  if (existingUser) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'Cette adresse email est déjà utilisée',
      code: ERROR_CODES.CONFLICT,
    });
  }

  // Créer l'utilisateur
  const user = await User.create({
    email,
    password,
    role,
    first_name,
    last_name,
    phone,
  });

  let business = null;

  // Créer l'établissement si nécessaire
  if ([USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(role)) {
    if (!business_name) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Nom de l\'établissement requis',
        code: ERROR_CODES.VALIDATION_ERROR,
      });
    }

    business = await Business.create({
      user_id: user.id,
      name: business_name,
      type: business_type || role,
      is_active: true,
    });

    // 🆕 Attribuer automatiquement le plan gratuit
    const freePlanResult = await pool.query(
      'SELECT id FROM subscription_plans WHERE name = $1',
      ['free']
    );

    if (freePlanResult.rows.length > 0) {
      const freePlanId = freePlanResult.rows[0].id;
      
      await pool.query(
        `INSERT INTO business_subscriptions 
        (business_id, plan_id, status, start_date, auto_renew)
        VALUES ($1, $2, 'active', CURRENT_TIMESTAMP, true)`,
        [business.id, freePlanId]
      );
      
      logger.info(`Plan gratuit attribué automatiquement au business ${business.id}`);
    }

    // Envoyer l'email de vérification pour les restaurants et traiteurs
    try {
      // Invalider les anciens tokens si ils existent
      await EmailVerificationToken.invalidateUserTokens(user.id);

      // Créer un nouveau token (valide 24 heures)
      const tokenData = await EmailVerificationToken.create(user.id, 1440);

      // Envoyer l'email
      const emailResult = await emailService.sendEmailVerification(
        user.email,
        tokenData.token,
        user.first_name,
        business_name
      );

      if (emailResult.success) {
        logger.info('Email de vérification envoyé', {
          userId: user.id,
          email: user.email,
          businessId: business.id,
        });
      } else {
        logger.error('Échec envoi email vérification', {
          userId: user.id,
          email: user.email,
          error: emailResult.error,
        });
      }
    } catch (error) {
      logger.error('Erreur lors de l\'envoi de l\'email de vérification', {
        error: error.message,
        userId: user.id,
        stack: error.stack,
      });
      // On continue même si l'email échoue
    }
  }

  // Générer le token JWT
  const token = generateToken(user);

  logger.info('Nouvel utilisateur inscrit', {
    userId: user.id,
    email: user.email,
    role: user.role,
    businessId: business?.id,
    emailVerificationRequired: [USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(role),
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: [USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(role) 
      ? 'Inscription réussie ! Veuillez vérifier votre email pour activer votre compte.'
      : 'Inscription réussie',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email_verified: false,
      },
      business,
      requiresEmailVerification: [USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(role),
    },
  });
});

// =============================================
// VÉRIFICATION D'EMAIL
// =============================================

/**
 * Vérifier un email avec un token
 * GET /api/auth/verify-email/:token
 */
const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Token requis',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  try {
    // Vérifier le token
    const tokenData = await EmailVerificationToken.findValidToken(token);

    if (!tokenData) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Token invalide ou expiré',
        code: ERROR_CODES.INVALID_TOKEN,
      });
    }

    try {
      // Essayer de marquer l'email comme vérifié
      await User.markEmailAsVerified(tokenData.user_id);
    } catch (error) {
      // Si la colonne n'existe pas, on continue quand même
      if (error.message.includes('email_verified')) {
        logger.warn('Colonne email_verified manquante, poursuite sans mise à jour', {
          userId: tokenData.user_id,
          error: error.message
        });
        // On continue le processus même sans la colonne
      } else {
        throw error; // Relancer les autres erreurs
      }
    }

    // Marquer le token comme utilisé
    await EmailVerificationToken.markAsVerified(token);

    // Invalider tous les autres tokens de l'utilisateur
    await EmailVerificationToken.invalidateUserTokens(tokenData.user_id);

    logger.info('Email vérifié avec succès', {
      userId: tokenData.user_id,
      email: tokenData.email,
    });

    // CORRECTION: Toujours renvoyer une réponse avec un statut explicite
    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
      data: {
        email: tokenData.email,
        firstName: tokenData.first_name,
        role: tokenData.role,
      },
    });

  } catch (error) {
    logger.error('Erreur lors de la vérification d\'email', {
      error: error.message,
      stack: error.stack,
      token,
    });

    // CORRECTION: Toujours spécifier un statut HTTP valide
    return res.status(HTTP_STATUS.INTERNAL_ERROR || 500).json({
      success: false,
      message: 'Erreur lors de la vérification de l\'email',
      code: ERROR_CODES.INTERNAL_ERROR || 'INTERNAL_ERROR',
    });
  }
});

/**
 * Renvoyer l'email de vérification
 * POST /api/auth/resend-verification
 */
const resendVerificationEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Email requis',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // Trouver l'utilisateur
  const user = await User.findByEmail(email);

  if (!user) {
    // Pour la sécurité, ne révélez pas si l'email existe ou non
    return res.json({
      success: true,
      message: 'Si cet email existe dans notre système, vous recevrez un nouveau lien de vérification.',
    });
  }

  // Vérifier si l'email est déjà vérifié
  if (user.email_verified) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Cet email est déjà vérifié',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // Vérifier que c'est un restaurant ou traiteur
  if (![USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(user.role)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'La vérification d\'email n\'est pas requise pour ce type de compte',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  try {
    // Récupérer les infos business
    const business = await Business.findByUserId(user.id);

    // Invalider les anciens tokens
    await EmailVerificationToken.invalidateUserTokens(user.id);

    // Créer un nouveau token
    const tokenData = await EmailVerificationToken.create(user.id, 1440);

    // Envoyer l'email
    const emailResult = await emailService.sendEmailVerification(
      user.email,
      tokenData.token,
      user.first_name,
      business?.name
    );

    if (emailResult.success) {
      logger.info('Email de vérification renvoyé', {
        userId: user.id,
        email: user.email,
      });
    } else {
      logger.error('Échec renvoi email vérification', {
        userId: user.id,
        email: user.email,
        error: emailResult.error,
      });
    }

    res.json({
      success: true,
      message: 'Si cet email existe dans notre système, vous recevrez un nouveau lien de vérification.',
    });
  } catch (error) {
    logger.error('Erreur lors du renvoi de l\'email de vérification', {
      error: error.message,
      email,
      stack: error.stack,
    });

    // Retourner succès pour ne pas révéler d'informations
    res.json({
      success: true,
      message: 'Si cet email existe dans notre système, vous recevrez un nouveau lien de vérification.',
    });
  }
});

// Connexion
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Trouver l'utilisateur
  const user = await User.findByEmail(email);
  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Email ou mot de passe incorrect',
      code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  // Vérifier le mot de passe
  const isPasswordValid = await User.verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Email ou mot de passe incorrect',
      code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  // Vérifier si le compte est actif
  if (!user.is_active) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Compte désactivé',
      code: ERROR_CODES.FORBIDDEN,
    });
  }

  // Récupérer l'établissement si applicable
  let business = null;
  if ([USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(user.role)) {
    business = await Business.findByUserId(user.id);
  }

  // Générer le token
  const token = generateToken(user);

  logger.info('Utilisateur connecté', {
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  res.json({
    success: true,
    message: 'Connexion réussie',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
      },
      business,
    },
  });
});

// Connexion admin
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Trouver l'utilisateur
  const user = await User.findByEmail(email);
  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Email ou mot de passe incorrect',
      code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  // Vérifier le mot de passe
  const isPasswordValid = await User.verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: 'Email ou mot de passe incorrect',
      code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  // Vérifier que c'est bien un admin
  if (user.role !== USER_ROLES.SUPER_ADMIN) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Accès refusé : pas un administrateur',
      code: ERROR_CODES.FORBIDDEN,
    });
  }

  // Générer le token
  const token = generateToken(user);

  logger.info('Admin connecté', {
    userId: user.id,
    email: user.email,
  });

  res.json({
    success: true,
    message: 'Connexion admin réussie',
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
      },
    },
  });
});

// Profil utilisateur
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Utilisateur introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  // Récupérer l'établissement si applicable
  let business = null;
  if ([USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(user.role)) {
    business = await Business.findByUserId(user.id);
  }

  res.json({
    success: true,
    data: {
      user,
      business,
    },
  });
});

// Mettre à jour le profil
const updateProfile = asyncHandler(async (req, res) => {
  const { first_name, last_name, phone } = req.body;

  const user = await User.update(req.user.id, {
    first_name,
    last_name,
    phone,
  });

  res.json({
    success: true,
    message: 'Profil mis à jour',
    data: { user },
  });
});

// =============================================
// RÉINITIALISATION DE MOT DE PASSE
// =============================================

/**
 * Demander une réinitialisation de mot de passe
 * POST /api/auth/password-reset/request
 */
const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Email requis',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // Trouver l'utilisateur
  const user = await User.findByEmail(email);
  
  // Pour des raisons de sécurité, on retourne toujours un message de succès
  // même si l'utilisateur n'existe pas (évite l'énumération d'emails)
  const standardMessage = 'Si cet email existe dans notre système, vous recevrez un lien de réinitialisation dans quelques instants';
  
  if (!user) {
    logger.warn('Tentative de réinitialisation pour email inexistant', { email });
    return res.json({
      success: true,
      message: standardMessage,
    });
  }

  // Vérifier si le compte est actif
  if (!user.is_active) {
    logger.warn('Tentative de réinitialisation pour compte inactif', { email, userId: user.id });
    return res.json({
      success: true,
      message: standardMessage,
    });
  }

  try {
    // Invalider les anciens tokens de cet utilisateur
    await PasswordResetToken.invalidateUserTokens(user.id);

    // Créer un nouveau token (valide 1 heure)
    const tokenData = await PasswordResetToken.create(user.id, 60);

    // Envoyer l'email
    const emailResult = await emailService.sendPasswordResetEmail(
      user.email, 
      tokenData.token, 
      user.first_name
    );

    if (emailResult.success) {
      logger.info('Email de réinitialisation envoyé', {
        userId: user.id,
        email: user.email,
        tokenId: tokenData.id,
      });
    } else {
      logger.error('Échec envoi email réinitialisation', {
        userId: user.id,
        email: user.email,
        error: emailResult.error,
      });
    }

    res.json({
      success: true,
      message: standardMessage,
    });
  } catch (error) {
    logger.error('Erreur lors de la demande de réinitialisation', {
      error: error.message,
      email,
      stack: error.stack,
    });

    // En cas d'erreur, on retourne quand même un succès
    // pour ne pas révéler d'informations
    res.json({
      success: true,
      message: standardMessage,
    });
  }
});

/**
 * Vérifier la validité d'un token
 * GET /api/auth/password-reset/verify/:token
 */
const verifyResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Token requis',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const tokenData = await PasswordResetToken.findValidToken(token);

  if (!tokenData) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Token invalide ou expiré',
      code: ERROR_CODES.INVALID_TOKEN,
    });
  }

  res.json({
    success: true,
    message: 'Token valide',
    data: {
      email: tokenData.email,
      firstName: tokenData.first_name,
    },
  });
});

/**
 * Réinitialiser le mot de passe
 * POST /api/auth/password-reset/reset
 */
const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  // Validation
  if (!token || !newPassword) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Token et nouveau mot de passe requis',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  if (newPassword.length < 8) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Le mot de passe doit contenir au moins 8 caractères',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // Validation de la force du mot de passe côté serveur
  const hasUpperCase = /[A-Z]/.test(newPassword);
  const hasLowerCase = /[a-z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  try {
    // Vérifier le token
    const tokenData = await PasswordResetToken.findValidToken(token);

    if (!tokenData) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Token invalide ou expiré',
        code: ERROR_CODES.INVALID_TOKEN,
      });
    }

    // Hasher le nouveau mot de passe
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // CORRECTION : Utiliser la méthode updatePassword
    await User.updatePassword(tokenData.user_id, passwordHash);

    // Marquer le token comme utilisé
    await PasswordResetToken.markAsUsed(token);

    // Invalider tous les autres tokens de l'utilisateur
    await PasswordResetToken.invalidateUserTokens(tokenData.user_id);

    // Envoyer un email de confirmation
    try {
      await emailService.sendPasswordChangedEmail(tokenData.email, tokenData.first_name);
    } catch (error) {
      logger.error('Erreur lors de l\'envoi de l\'email de confirmation', {
        error: error.message,
        userId: tokenData.user_id,
      });
      // On continue même si l'email échoue
    }

    logger.info('Mot de passe réinitialisé', {
      userId: tokenData.user_id,
      email: tokenData.email,
    });

    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès',
    });

  } catch (error) {
    logger.error('Erreur lors de la réinitialisation du mot de passe', {
      error: error.message,
      stack: error.stack,
    });

    return res.status(HTTP_STATUS.INTERNAL_ERROR).json({
      success: false,
      message: 'Erreur lors de la réinitialisation du mot de passe',
      code: ERROR_CODES.INTERNAL_ERROR,
    });
  }
});

module.exports = {
  register,
  login,
  adminLogin,
  getProfile,
  updateProfile,
  requestPasswordReset,
  verifyResetToken,
  resetPassword,
  verifyEmail,
  resendVerificationEmail,
};