const rateLimit = require('express-rate-limit');
const { HTTP_STATUS } = require('../config/constants');

// Rate limiter général
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requêtes par IP par fenêtre
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limiter pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 tentatives par IP par fenêtre
  message: {
    success: false,
    message: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes',
    retryAfter: '15 minutes',
  },
  skipSuccessfulRequests: true,
});

// Rate limiter pour les paiements
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3, // 3 tentatives par IP par fenêtre
  message: {
    success: false,
    message: 'Trop de tentatives de paiement, veuillez réessayer dans 5 minutes',
    retryAfter: '5 minutes',
  },
});

// Rate limiter pour les webhooks
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 webhooks par IP par minute
  message: {
    success: false,
    message: 'Trop de webhooks reçus',
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  paymentLimiter,
  webhookLimiter,
};