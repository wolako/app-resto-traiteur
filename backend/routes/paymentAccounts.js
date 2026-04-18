const express = require('express');
const router  = express.Router();

const paymentAccountController = require('../controllers/paymentAccountController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const { USER_ROLES }   = require('../config/constants');

const guard = [
  authenticateToken,
  requireRole(USER_ROLES.RESTAURANT, USER_ROLES.TRAITEUR),
];

router.get(
  '/my-account',
  ...guard,
  asyncHandler(paymentAccountController.getMyAccount)
);

// ✅ NOUVEAU : historique de tous les comptes
router.get(
  '/all-accounts',
  ...guard,
  asyncHandler(paymentAccountController.getAllAccounts)
);

router.post(
  '/save',
  ...guard,
  asyncHandler(paymentAccountController.savePaymentAccount)
);

module.exports = router;