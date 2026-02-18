// backend/controllers/paymentController.js
// ✅ CORRIGÉ : Commission créée dès payment_status = 'paid'

const Payment = require('../models/Payment');
const Order   = require('../models/Order');
const Business = require('../models/Business');
const { cinetpayService } = require('../services/cinetpayService');
const {
  HTTP_STATUS,
  ERROR_CODES,
  PAYMENT_STATUS,
  VALID_PAYMENT_METHODS,
} = require('../config/constants');
const { asyncHandler }       = require('../middleware/errorHandler');
const logger                 = require('../utils/logger');
const notificationService    = require('../services/notificationService');
const orderReceiptService    = require('../services/orderReceiptService');
const { pool }               = require('../config/db');
const Commission             = require('../models/Commission');
const Subscription           = require('../models/Subscription');

// ─────────────────────────────────────────────────────────────────────────────
// HELPER : envoyer le reçu après paiement réussi (arrière-plan, non bloquant)
// ─────────────────────────────────────────────────────────────────────────────
async function _sendReceiptAfterPayment(orderId) {
  try {
    const result = await pool.query(
      `SELECT o.*, u.phone AS user_phone, u.email AS user_email
       FROM orders o
       LEFT JOIN users u ON o.client_id = u.id
       WHERE o.id = $1`,
      [orderId]
    );
    if (result.rows.length === 0) return;

    const order = result.rows[0];
    const clientInfo = {
      email:      order.client_email || order.user_email,
      phone:      order.client_phone || order.user_phone,
      first_name: order.client_name,
      user_id:    order.client_id || null,
    };

    await orderReceiptService.sendOrderReceipt(orderId, clientInfo);
    logger.info(`[Reçu] ✅ Envoyé pour commande #${orderId}`);
  } catch (err) {
    logger.error(`[Reçu] ❌ Erreur commande #${orderId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER : création automatique de commission dès paiement réussi
// ─────────────────────────────────────────────────────────────────────────────
async function _createCommissionIfNeeded(orderId, orderAmount, businessId) {
  try {
    const existing = await Commission.getByOrderId(orderId);
    if (existing) {
      logger.info(`Commission déjà existante pour commande #${orderId}`);
      return;
    }

    const subscription = await Subscription.getBusinessSubscription(businessId);
    const commissionRate = subscription?.commission_rate ?? 5.0;
    
    await Commission.createFromOrder(orderId, businessId, orderAmount, commissionRate);
    
    logger.info(`✅ Commission créée: ${commissionRate}% de ${orderAmount} FCFA pour commande #${orderId}`);
  } catch (err) {
    logger.error(`❌ Erreur création commission commande #${orderId}:`, err.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPER : validation de la méthode de paiement
// ─────────────────────────────────────────────────────────────────────────────
function validatePaymentMethod(method) {
  if (!method) return 'La méthode de paiement est requise';
  if (!VALID_PAYMENT_METHODS.includes(method)) {
    return `Méthode invalide. Valeurs acceptées : ${VALID_PAYMENT_METHODS.join(', ')}`;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
const isSandbox = () => process.env.PAYMENT_MODE === 'sandbox';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/initiate
// ─────────────────────────────────────────────────────────────────────────────
const initiatePayment = asyncHandler(async (req, res) => {
  const {
    order_id, amount, currency, payment_method,
    customer_name, customer_phone, customer_email,
  } = req.body;

  // Validation méthode de paiement
  const methodError = validatePaymentMethod(payment_method);
  if (methodError) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false, message: methodError, code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // Vérification commande
  const order = await Order.findById(order_id);
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false, message: 'Commande introuvable', code: ERROR_CODES.NOT_FOUND,
    });
  }

  // Bloquer si paiement déjà en cours
  const existingPayment = await Payment.findByOrderId(order_id);
  if (existingPayment && existingPayment.status === PAYMENT_STATUS.PENDING) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'Un paiement est déjà en cours pour cette commande',
      code: ERROR_CODES.CONFLICT,
    });
  }

  // ── MODE SANDBOX ──────────────────────────────────────────────────────────
  if (isSandbox()) {
    logger.info(`[SANDBOX] Paiement simulé commande #${order_id} (${payment_method})`);
    const fakePaymentId = `SANDBOX_${order_id}_${Date.now()}`;

    try {
      // 1. Créer le paiement immédiatement en 'paid'
      await Payment.create({
        order_id,
        payment_id:     fakePaymentId,
        amount:         amount || order.total_amount,
        currency:       currency || 'XOF',
        payment_method,
        status:         PAYMENT_STATUS.PAID,
      });

      // 2. Mettre à jour le payment_status de la commande
      await Order.updatePaymentStatus(order_id, PAYMENT_STATUS.PAID);

      // 3. ✅ NOUVEAU : Créer la commission dès que le paiement est validé
      await _createCommissionIfNeeded(order_id, amount || order.total_amount, order.business_id);

      // 4. Notifier le restaurant
      const business = await Business.findById(order.business_id);
      if (business) {
        await notificationService.notifyPaymentSuccess(
          { id: fakePaymentId, amount: amount || order.total_amount, payment_method },
          order,
          business
        );
      }

      // 5. Reçu en arrière-plan (non bloquant)
      _sendReceiptAfterPayment(order_id).catch(err =>
        logger.error('[SANDBOX] Erreur reçu:', err.message)
      );

      return res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: `✅ [SANDBOX] Paiement ${payment_method} accepté immédiatement`,
        data: {
          payment_id:   fakePaymentId,
          checkout_url: null,
          status:       PAYMENT_STATUS.PAID,
          sandbox:      true,
        },
      });
    } catch (error) {
      logger.error('[SANDBOX] Erreur:', {
        message: error.message,
        detail:  error.detail || null,
        code:    error.code   || null,
      });
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Erreur paiement sandbox',
        details: error.detail || error.message,
      });
    }
  }

  // ── MODE PRODUCTION : flow CinetPay ──────────────────────────────────────
  try {
    const paymentResponse = await cinetpayService.initiatePayment({
      amount,
      currency:              currency || 'XOF',
      transaction_id:        `ORDER_${order_id}_${Date.now()}`,
      description:           `Commande #${order_id} - ${order.business_name || 'RestoTraiteur'}`,
      customer_name,
      customer_phone_number: customer_phone,
      customer_email,
      payment_method,
    });

    const payment = await Payment.create({
      order_id,
      payment_id:     paymentResponse.data.payment_id,
      amount,
      currency:       currency || 'XOF',
      payment_method,
      status:         PAYMENT_STATUS.PENDING,
    });

    logger.info('Paiement initié', {
      paymentId: payment.payment_id, orderId: order_id, amount, paymentMethod: payment_method,
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Paiement initié avec succès',
      data: {
        payment_id:   payment.payment_id,
        checkout_url: paymentResponse.data.payment_url,
        status:       payment.status,
        sandbox:      false,
      },
    });
  } catch (error) {
    logger.error('Erreur initiation paiement', { orderId: order_id, error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de l\'initiation du paiement',
      code: ERROR_CODES.PAYMENT_ERROR,
      details: process.env.NODE_ENV !== 'production' ? error.message : undefined,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/webhook/cinetpay
// ─────────────────────────────────────────────────────────────────────────────
const cinetpayWebhook = asyncHandler(async (req, res) => {
  const webhookData = req.body;
  logger.info('Webhook CinetPay reçu', { data: webhookData });

  try {
    const isValidSignature = cinetpayService.verifyWebhookSignature(
      JSON.stringify(webhookData),
      req.headers['x-cinetpay-signature']
    );
    if (!isValidSignature) {
      return res.status(HTTP_STATUS.UNAUTHORIZED).json({ success: false, message: 'Signature invalide' });
    }

    const { cpm_trans_id, cpm_result } = webhookData;
    const payment = await Payment.findByPaymentId(cpm_trans_id);
    if (!payment) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Paiement introuvable' });
    }

    const newStatus = cpm_result === '00' ? PAYMENT_STATUS.PAID : PAYMENT_STATUS.FAILED;

    const updatedPayment = await Payment.updateStatus(
      cpm_trans_id, newStatus, webhookData.cpm_trans_status, webhookData
    );
    await Order.updatePaymentStatus(payment.order_id, newStatus);

    if (newStatus === PAYMENT_STATUS.PAID) {
      const order    = await Order.findById(payment.order_id);
      const business = await Business.findById(order.business_id);
      
      // ✅ NOUVEAU : Créer commission dès paiement validé
      await _createCommissionIfNeeded(payment.order_id, payment.amount, order.business_id);
      
      if (business) await notificationService.notifyPaymentSuccess(updatedPayment, order, business);
      _sendReceiptAfterPayment(payment.order_id).catch(err =>
        logger.error('[Webhook] Erreur reçu:', err.message)
      );
    }

    if (newStatus === PAYMENT_STATUS.FAILED) {
      const order    = await Order.findById(payment.order_id);
      const business = await Business.findById(order.business_id);
      if (business) {
        await notificationService.createNotification({
          business_id:    business.id,
          type:           'payment_failed',
          title:          'Paiement échoué',
          message:        `Paiement de ${updatedPayment.amount} FCFA pour commande #${order.id} échoué`,
          reference_id:   updatedPayment.id,
          reference_type: 'payment',
          priority:       'high',
          metadata:       { payment_id: updatedPayment.id, order_id: order.id, amount: updatedPayment.amount },
        });
      }
    }

    res.json({ success: true, message: 'Webhook traité' });
  } catch (error) {
    logger.error('Erreur webhook CinetPay', { error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur webhook' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/status/:paymentId
// ─────────────────────────────────────────────────────────────────────────────
const getPaymentStatus = asyncHandler(async (req, res) => {
  const { paymentId } = req.params;

  const payment = await Payment.findByPaymentId(paymentId);
  if (!payment) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Paiement introuvable' });
  }

  // Sandbox : retour direct depuis la BDD
  if (isSandbox() || paymentId.startsWith('SANDBOX_')) {
    return res.json({
      success: true,
      data: {
        payment_id:     paymentId,
        status:         payment.status,
        amount:         payment.amount,
        currency:       payment.currency,
        payment_method: payment.payment_method,
        sandbox:        true,
      },
    });
  }

  // Production : vérification CinetPay
  try {
    const cinetpayStatus = await cinetpayService.checkPaymentStatus(paymentId);
    const statusMap = { ACCEPTED: PAYMENT_STATUS.PAID, REFUSED: PAYMENT_STATUS.FAILED };
    const newStatus = statusMap[cinetpayStatus.data.payment_status] || PAYMENT_STATUS.PENDING;

    if (payment.status !== newStatus) {
      await Payment.updateStatus(paymentId, newStatus, null, cinetpayStatus.data);
      await Order.updatePaymentStatus(payment.order_id, newStatus);

      if (newStatus === PAYMENT_STATUS.PAID) {
        const order    = await Order.findById(payment.order_id);
        const business = await Business.findById(order.business_id);
        
        // ✅ NOUVEAU : Créer commission
        await _createCommissionIfNeeded(payment.order_id, payment.amount, order.business_id);
        
        if (business) await notificationService.notifyPaymentSuccess(payment, order, business);
        _sendReceiptAfterPayment(payment.order_id).catch(err =>
          logger.error('[VerifyStatus] Erreur reçu:', err.message)
        );
      }
    }

    return res.json({
      success: true,
      data: {
        payment_id:     paymentId,
        status:         newStatus,
        amount:         payment.amount,
        currency:       payment.currency,
        payment_method: payment.payment_method,
        sandbox:        false,
      },
    });
  } catch (error) {
    logger.error('Erreur vérification statut', { paymentId, error: error.message });
    return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({ success: false, message: 'Erreur vérification' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints divers
// ─────────────────────────────────────────────────────────────────────────────
const getPaymentById = asyncHandler(async (req, res) => {
  const payment = await Payment.findByPaymentId(req.params.id);
  if (!payment) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Introuvable' });
  res.json({ success: true, data: payment });
});

const getBusinessPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.getByBusinessId(req.params.businessId);
  res.json({ success: true, data: payments });
});

const getAllPayments = asyncHandler(async (req, res) => {
  const payments = await Payment.getAll();
  res.json({ success: true, data: payments });
});

const getPaymentStatistics = asyncHandler(async (req, res) => {
  const businessId = req.query.business_id || req.business?.id;
  const statistics = await Payment.getStatistics(businessId);
  res.json({ success: true, data: statistics });
});

module.exports = {
  initiatePayment,
  cinetpayWebhook,
  getPaymentStatus,
  getPaymentById,
  getBusinessPayments,
  getAllPayments,
  getPaymentStatistics,
};