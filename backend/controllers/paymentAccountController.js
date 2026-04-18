const paymentAccountService = require('../services/paymentAccountService');
const logger = require('../utils/logger');

const PAYOUT_METHOD_MAP = {
  'mixx by yas': 'mixx',
  'mixx':        'mixx',
  'flooz':       'flooz',
  'bank':        'bank',
  'banque':      'bank',
};

function normalizePayoutMethod(method) {
  if (!method) return null;
  return PAYOUT_METHOD_MAP[String(method).toLowerCase().trim()] ?? method;
}

// GET /my-account — compte actif uniquement
const getMyAccount = async (req, res) => {
  const business = await paymentAccountService.getBusinessByUser(req.user.id);
  if (!business) {
    return res.status(404).json({ success: false, message: 'Établissement introuvable' });
  }
  const account = await paymentAccountService.getPaymentAccount(business.id);
  return res.json({ success: true, data: account });
};

// GET /all-accounts — tous les comptes (actif + historique)
const getAllAccounts = async (req, res) => {
  const business = await paymentAccountService.getBusinessByUser(req.user.id);
  if (!business) {
    return res.status(404).json({ success: false, message: 'Établissement introuvable' });
  }
  const accounts = await paymentAccountService.getAllPaymentAccounts(business.id);
  return res.json({ success: true, data: accounts });
};

// POST /save
const savePaymentAccount = async (req, res) => {
  const business = await paymentAccountService.getBusinessByUser(req.user.id);
  if (!business) {
    return res.status(404).json({ success: false, message: 'Établissement introuvable' });
  }

  const rawMethod = req.body.preferred_payout_method;
  const normalizedMethod = normalizePayoutMethod(rawMethod);

  logger.info('savePaymentAccount', {
    businessId: business.id,
    userId: req.user.id,
    rawMethod,
    normalizedMethod,
    editExisting: req.body.edit_existing,
  });

  if (!['mixx', 'flooz', 'bank'].includes(normalizedMethod)) {
    return res.status(400).json({
      success: false,
      message: `Méthode invalide : "${rawMethod}". Valeurs acceptées : mixx, flooz, bank.`,
      code: 'VALIDATION_ERROR',
    });
  }

  const sanitizedBody = {
    ...req.body,
    preferred_payout_method: normalizedMethod,
  };

  const account = await paymentAccountService.savePaymentAccount(business.id, sanitizedBody);

  return res.json({ success: true, data: account });
};

module.exports = { getMyAccount, getAllAccounts, savePaymentAccount };