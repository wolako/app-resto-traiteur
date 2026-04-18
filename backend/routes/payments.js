const express = require('express');
const paymentController = require('../controllers/paymentController');
const { authenticateToken, requireRole, attachBusiness } = require('../middleware/auth');
const { validate, validateNumericParam } = require('../middleware/validation');
const { paymentLimiter, webhookLimiter } = require('../middleware/rateLimiter');
const { USER_ROLES } = require('../config/constants');

const router = express.Router();

/**
 * 🔹 Route publique : Initier un paiement
 */
router.post(
  '/initiate',
  paymentLimiter,
  validate('initiatePayment'),
  paymentController.initiatePayment
);

/**
 * 🔹 Route publique : Webhook CinetPay
 */
router.post(
  '/webhook/cinetpay',
  webhookLimiter,
  paymentController.cinetpayWebhook
);

/**
 * 🔹 Route publique : Webhook CinetPay pour ACOMPTES commandes spéciales
 */
router.post(
  '/webhook/cinetpay/deposit',
  webhookLimiter,
  paymentController.cinetpayDepositWebhook
);

/**
 * 🔹 Route protégée : Vérifier le statut d’un paiement
 */
router.get(
  '/verify/:paymentId',
  authenticateToken,
  validateNumericParam('paymentId'),
  paymentController.getPaymentStatus
);

/**
 * 🔹 Route protégée : Obtenir un paiement par ID
 */
router.get(
  '/:id',
  authenticateToken,
  validateNumericParam('id'),
  paymentController.getPaymentById
);

/**
 * 🔹 Route protégée : Obtenir tous les paiements d’un business (restaurant/traiteur)
 */
router.get(
  '/business/:businessId',
  authenticateToken,
  requireRole([USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR]),
  validateNumericParam('businessId'),
  attachBusiness,
  paymentController.getBusinessPayments
);

/**
 * 🔹 Route admin : Obtenir tous les paiements
 */
router.get(
  '/',
  authenticateToken,
  requireRole([USER_ROLES.SUPERADMIN]),
  paymentController.getAllPayments
);

/**
 * 🔹 Route protégée : Statistiques des paiements
 */
router.get(
  '/statistics',
  authenticateToken,
  attachBusiness,
  paymentController.getPaymentStatistics
);

module.exports = router;
