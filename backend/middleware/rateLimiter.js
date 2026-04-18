const rateLimit = require('express-rate-limit');

const isDev = process.env.NODE_ENV !== 'production';

// Rate limiter général
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 500,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev && (req.ip === '::1' || req.ip === '127.0.0.1'),
});

// Rate limiter pour l'authentification
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 100 : 5,
  message: {
    success: false,
    message: 'Trop de tentatives de connexion, veuillez réessayer dans 15 minutes',
    retryAfter: '15 minutes',
  },
  skipSuccessfulRequests: true,
});

// Rate limiter dashboard (branding, uploads, menus…) — limite haute
const dashboardLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isDev ? 2000 : 500,
  message: {
    success: false,
    message: 'Trop de requêtes, veuillez réessayer plus tard',
    retryAfter: '15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => isDev && (req.ip === '::1' || req.ip === '127.0.0.1'),
});

// Rate limiter pour les paiements
const paymentLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: isDev ? 100 : 3,
  message: {
    success: false,
    message: 'Trop de tentatives de paiement, veuillez réessayer dans 5 minutes',
    retryAfter: '5 minutes',
  },
});

// Rate limiter pour les webhooks
const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: {
    success: false,
    message: 'Trop de webhooks reçus',
  },
});

module.exports = {
  generalLimiter,
  authLimiter,
  dashboardLimiter,
  paymentLimiter,
  webhookLimiter,
};