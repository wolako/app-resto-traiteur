const express = require('express');
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');
const { validate } = require('../middleware/validation');
const { authLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

// =============================================
// ROUTES PUBLIQUES D'AUTHENTIFICATION
// =============================================

// Inscription
router.post('/register', 
  authLimiter,
  validate('register'),
  authController.register
);

// Connexion
router.post('/login',
  authLimiter,
  validate('login'),
  authController.login
);

// Connexion admin
router.post('/admin/login', 
  authLimiter,
  authController.adminLogin
);

// =============================================
// ROUTES DE RÉINITIALISATION DE MOT DE PASSE
// =============================================

// Demander une réinitialisation de mot de passe
router.post('/password-reset/request',
  authLimiter,
  authController.requestPasswordReset
);

// Vérifier un token de réinitialisation
router.get('/password-reset/verify/:token',
  authController.verifyResetToken
);

// Réinitialiser le mot de passe
router.post('/password-reset/reset',
  authLimiter,
  authController.resetPassword
);

// =============================================
// ROUTES PROTÉGÉES (NÉCESSITENT UN TOKEN JWT)
// =============================================

// Récupérer le profil de l'utilisateur connecté
router.get('/profile',
  authenticateToken,
  authController.getProfile
);

// Mettre à jour le profil de l'utilisateur connecté
router.put('/profile',
  authenticateToken,
  validate('updateProfile'),
  authController.updateProfile
);

// =============================================
// ROUTES DE VÉRIFICATION D'EMAIL
// =============================================

// Vérifier un email avec un token
router.get('/verify-email/:token',
  authController.verifyEmail
);

// Renvoyer l'email de vérification
router.post('/resend-verification',
  authLimiter,
  authController.resendVerificationEmail
);

module.exports = router;