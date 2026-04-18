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
const { pool } = require('../config/db');
// ✅ AJOUT
const { getSetting } = require('../utils/settingsHelper');

// Générer un token JWT COMPLET
const generateToken = (user) => {
  return jwt.sign(
    { 
      id: user.id,
      userId: user.id,
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
    email, password, role, first_name, last_name,
    phone, business_name, business_type
  } = req.body;

  // ✅ Vérifier si les inscriptions sont autorisées
  const allowRegistrations = await getSetting('allow_new_registrations', true);
  if (!allowRegistrations) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: 'Les inscriptions sont temporairement désactivées',
      code: ERROR_CODES.FORBIDDEN,
    });
  }

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
  const user = await User.create({ email, password, role, first_name, last_name, phone });

  let business = null;

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

    try {
      await EmailVerificationToken.invalidateUserTokens(user.id);
      const tokenData = await EmailVerificationToken.create(user.id, 1440);
      const emailResult = await emailService.sendEmailVerification(
        user.email, tokenData.token, user.first_name, business_name
      );
      if (emailResult.success) {
        logger.info('Email de vérification envoyé', { userId: user.id, email: user.email, businessId: business.id });
      } else {
        logger.error('Échec envoi email vérification', { userId: user.id, error: emailResult.error });
      }
    } catch (error) {
      logger.error('Erreur lors de l\'envoi de l\'email de vérification', { error: error.message, userId: user.id });
    }
  }

  const token = generateToken(user);

  logger.info('Nouvel utilisateur inscrit', {
    userId: user.id, email: user.email, role: user.role, businessId: business?.id,
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
        id: user.id, email: user.email, role: user.role,
        first_name: user.first_name, last_name: user.last_name,
        phone: user.phone, email_verified: false,
      },
      business,
      requiresEmailVerification: [USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(role),
    },
  });
});

// =============================================
// VÉRIFICATION D'EMAIL
// =============================================

const verifyEmail = asyncHandler(async (req, res) => {
  const { token } = req.params;

  if (!token) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Token requis', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  try {
    const tokenData = await EmailVerificationToken.findValidToken(token);
    if (!tokenData) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false, message: 'Token invalide ou expiré', code: ERROR_CODES.INVALID_TOKEN,
      });
    }

    try {
      await User.markEmailAsVerified(tokenData.user_id);
    } catch (error) {
      if (error.message.includes('email_verified')) {
        logger.warn('Colonne email_verified manquante, poursuite sans mise à jour', { userId: tokenData.user_id });
      } else {
        throw error;
      }
    }

    await EmailVerificationToken.markAsVerified(token);
    await EmailVerificationToken.invalidateUserTokens(tokenData.user_id);

    logger.info('Email vérifié avec succès', { userId: tokenData.user_id, email: tokenData.email });

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      message: 'Email vérifié avec succès ! Vous pouvez maintenant vous connecter.',
      data: { email: tokenData.email, firstName: tokenData.first_name, role: tokenData.role },
    });
  } catch (error) {
    logger.error('Erreur lors de la vérification d\'email', { error: error.message, token });
    return res.status(500).json({
      success: false, message: 'Erreur lors de la vérification de l\'email', code: 'INTERNAL_ERROR',
    });
  }
});

const resendVerificationEmail = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Email requis', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const user = await User.findByEmail(email);
  if (!user) {
    return res.json({ success: true, message: 'Si cet email existe dans notre système, vous recevrez un nouveau lien de vérification.' });
  }

  if (user.email_verified) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Cet email est déjà vérifié', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  if (![USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(user.role)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'La vérification d\'email n\'est pas requise pour ce type de compte',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  try {
    const business = await Business.findByUserId(user.id);
    await EmailVerificationToken.invalidateUserTokens(user.id);
    const tokenData = await EmailVerificationToken.create(user.id, 1440);
    await emailService.sendEmailVerification(user.email, tokenData.token, user.first_name, business?.name);
    logger.info('Email de vérification renvoyé', { userId: user.id, email: user.email });
  } catch (error) {
    logger.error('Erreur lors du renvoi de l\'email de vérification', { error: error.message, email });
  }

  res.json({ success: true, message: 'Si cet email existe dans notre système, vous recevrez un nouveau lien de vérification.' });
});

// Connexion
const login = asyncHandler(async (req, res) => {
  const { email, phone, password } = req.body;

  if (!email && !phone) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Email ou numéro de téléphone requis', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const user = email ? await User.findByEmail(email) : await User.findByPhone(phone);

  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false, message: 'Identifiant ou mot de passe incorrect', code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  const isPasswordValid = await User.verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false, message: 'Identifiant ou mot de passe incorrect', code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  if (!user.is_active) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false, message: 'Compte désactivé', code: ERROR_CODES.FORBIDDEN,
    });
  }

  let business = null;
  if ([USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(user.role)) {
    business = await Business.findByUserId(user.id);
  }

  const token = generateToken(user);
  logger.info('Utilisateur connecté', { userId: user.id, email: user.email, role: user.role });

  res.json({
    success: true,
    message: 'Connexion réussie',
    data: {
      token,
      user: {
        id: user.id, email: user.email, role: user.role,
        first_name: user.first_name, last_name: user.last_name, phone: user.phone,
      },
      business,
    },
  });
});

// Connexion admin
const adminLogin = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findByEmail(email);
  if (!user) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false, message: 'Email ou mot de passe incorrect', code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  const isPasswordValid = await User.verifyPassword(password, user.password_hash);
  if (!isPasswordValid) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false, message: 'Email ou mot de passe incorrect', code: ERROR_CODES.UNAUTHORIZED,
    });
  }

  if (user.role !== USER_ROLES.SUPER_ADMIN) {
    return res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false, message: 'Accès refusé : pas un administrateur', code: ERROR_CODES.FORBIDDEN,
    });
  }

  const token = generateToken(user);
  logger.info('Admin connecté', { userId: user.id, email: user.email });

  res.json({
    success: true,
    message: 'Connexion admin réussie',
    data: {
      token,
      user: {
        id: user.id, email: user.email, role: user.role,
        first_name: user.first_name, last_name: user.last_name, phone: user.phone,
      },
    },
  });
});

// Profil utilisateur
const getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  if (!user) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Utilisateur introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  let business = null;
  if ([USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR].includes(user.role)) {
    business = await Business.findByUserId(user.id);
  }

  res.json({ success: true, data: { user, business } });
});

// Mettre à jour le profil
const updateProfile = asyncHandler(async (req, res) => {
  const { first_name, last_name, phone } = req.body;
  const user = await User.update(req.user.id, { first_name, last_name, phone });
  res.json({ success: true, message: 'Profil mis à jour', data: { user } });
});

// =============================================
// RÉINITIALISATION DE MOT DE PASSE
// =============================================

const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const standardMessage = 'Si cet email existe dans notre système, vous recevrez un lien de réinitialisation dans quelques instants';

  if (!email) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Email requis', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const user = await User.findByEmail(email);
  if (!user || !user.is_active) {
    return res.json({ success: true, message: standardMessage });
  }

  try {
    await PasswordResetToken.invalidateUserTokens(user.id);
    const tokenData = await PasswordResetToken.create(user.id, 60);
    await emailService.sendPasswordResetEmail(user.email, tokenData.token, user.first_name);
    logger.info('Email de réinitialisation envoyé', { userId: user.id, email: user.email });
  } catch (error) {
    logger.error('Erreur lors de la demande de réinitialisation', { error: error.message, email });
  }

  res.json({ success: true, message: standardMessage });
});

const verifyResetToken = asyncHandler(async (req, res) => {
  const { token } = req.params;
  if (!token) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Token requis', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const tokenData = await PasswordResetToken.findValidToken(token);
  if (!tokenData) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Token invalide ou expiré', code: ERROR_CODES.INVALID_TOKEN,
    });
  }

  res.json({ success: true, message: 'Token valide', data: { email: tokenData.email, firstName: tokenData.first_name } });
});

const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Token et nouveau mot de passe requis', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  if (newPassword.length < 8) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: 'Le mot de passe doit contenir au moins 8 caractères', code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const hasUpperCase  = /[A-Z]/.test(newPassword);
  const hasLowerCase  = /[a-z]/.test(newPassword);
  const hasNumber     = /[0-9]/.test(newPassword);
  const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword);

  if (!hasUpperCase || !hasLowerCase || !hasNumber || !hasSpecialChar) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  try {
    const tokenData = await PasswordResetToken.findValidToken(token);
    if (!tokenData) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false, message: 'Token invalide ou expiré', code: ERROR_CODES.INVALID_TOKEN,
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await User.updatePassword(tokenData.user_id, passwordHash);
    await PasswordResetToken.markAsUsed(token);
    await PasswordResetToken.invalidateUserTokens(tokenData.user_id);

    try {
      await emailService.sendPasswordChangedEmail(tokenData.email, tokenData.first_name);
    } catch (error) {
      logger.error('Erreur envoi email de confirmation', { error: error.message, userId: tokenData.user_id });
    }

    logger.info('Mot de passe réinitialisé', { userId: tokenData.user_id, email: tokenData.email });
    res.json({ success: true, message: 'Mot de passe réinitialisé avec succès' });

  } catch (error) {
    logger.error('Erreur lors de la réinitialisation du mot de passe', { error: error.message });
    return res.status(500).json({
      success: false, message: 'Erreur lors de la réinitialisation du mot de passe', code: 'INTERNAL_ERROR',
    });
  }
});

module.exports = {
  register, login, adminLogin, getProfile, updateProfile,
  requestPasswordReset, verifyResetToken, resetPassword,
  verifyEmail, resendVerificationEmail,
};