// backend/services/cinetpayService.js
// VERSION CORRIGÉE :
//   - channels: mapping correct pour 'Mixx By Yas', 'flooz', 'card'
//   - CinetPay attend 'ALL', 'MOBILE_MONEY', ou 'CREDIT_CARD'

const crypto = require('crypto');
const { cinetpayClient, cinetpayConfig } = require('../config/cinetpay');
const logger = require('../utils/logger');

// ─────────────────────────────────────────────────────────────────────────────
// Mapping méthodes de paiement → channels CinetPay
// ─────────────────────────────────────────────────────────────────────────────
//
// Documentation CinetPay :
//   'ALL'          → Toutes les méthodes disponibles sur votre compte
//   'MOBILE_MONEY' → Mobile Money uniquement (Moov/Flooz, T-Money/Mixx)
//   'CREDIT_CARD'  → Carte Visa/Mastercard uniquement
//
// On utilise 'ALL' pour Mixx By Yas et Flooz car CinetPay les groupe
// sous Mobile Money et affiche la page avec tous les opérateurs disponibles.
//
const CHANNEL_MAP = {
  'Mixx By Yas': 'ALL',   // ou 'MOBILE_MONEY' si vous voulez restreindre
  'flooz':       'ALL',   // ou 'MOBILE_MONEY'
  'card':        'CREDIT_CARD',
};

class CinetPayService {

  /**
   * Initier un paiement via CinetPay
   */
  async initiatePayment(paymentData) {
    const {
      amount,
      currency,
      transaction_id,
      description,
      customer_name,
      customer_phone_number,
      customer_email,
      payment_method,
    } = paymentData;

    // Déterminer le channel CinetPay selon la méthode choisie
    const channel = CHANNEL_MAP[payment_method] || 'ALL';

    const payload = {
      apikey:           cinetpayConfig.apiKey,
      site_id:          cinetpayConfig.siteId,
      transaction_id,
      amount,
      currency,
      description,
      return_url:       cinetpayConfig.returnUrl,
      notify_url:       cinetpayConfig.notifyUrl,
      cancel_url:       cinetpayConfig.cancelUrl,
      customer_name:    customer_name?.split(' ')[0] || customer_name || '',
      customer_surname: customer_name?.split(' ').slice(1).join(' ') || '',
      customer_email:   customer_email || '',
      customer_phone_number: customer_phone_number || '',
      customer_address: '',
      customer_city:    'Lomé',
      customer_country: 'TG',
      customer_state:   'Maritime',
      customer_zip_code: '',
      channels:         channel,  // ← CORRIGÉ : 'ALL', 'MOBILE_MONEY', ou 'CREDIT_CARD'
    };

    logger.info(`[CinetPay] Initiation paiement`, {
      transaction_id,
      amount,
      payment_method,
      channel,
    });

    try {
      const response = await cinetpayClient.post('/payment', payload);

      if (response.data.code === '201') {
        return {
          success: true,
          data: {
            payment_id:     response.data.data.payment_token,
            payment_url:    response.data.data.payment_url,
            transaction_id: response.data.data.payment_token,
          },
        };
      } else {
        throw new Error(response.data.message || 'Erreur initiation paiement CinetPay');
      }
    } catch (error) {
      logger.error('Erreur CinetPay initiation', {
        error:   error.response?.data || error.message,
        payload: { ...payload, apikey: '[REDACTED]' },
      });
      throw error;
    }
  }

  /**
   * Vérifier le statut d'un paiement
   */
  async checkPaymentStatus(paymentId) {
    const payload = {
      apikey:         cinetpayConfig.apiKey,
      site_id:        cinetpayConfig.siteId,
      transaction_id: paymentId,
    };

    try {
      const response = await cinetpayClient.post('/payment/check', payload);

      return {
        success: true,
        data: {
          payment_id:     paymentId,
          payment_status: response.data.data.status,
          operator_id:    response.data.data.operator_id,
          payment_method: response.data.data.payment_method,
          amount:         response.data.data.amount,
          currency:       response.data.data.currency,
        },
      };
    } catch (error) {
      logger.error('Erreur CinetPay vérification statut', {
        error: error.response?.data || error.message,
        paymentId,
      });
      throw error;
    }
  }

  /**
   * Vérifier la signature du webhook
   */
  verifyWebhookSignature(payload, signature) {
    if (!signature || !cinetpayConfig.secretKey) {
      return false;
    }

    const computedSignature = crypto
      .createHmac('sha256', cinetpayConfig.secretKey)
      .update(payload)
      .digest('hex');

    try {
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(computedSignature, 'hex')
      );
    } catch {
      // Si les buffers ont des longueurs différentes, timingSafeEqual throw
      return false;
    }
  }

  /**
   * Obtenir les méthodes de paiement disponibles sur le compte
   */
  async getPaymentMethods() {
    try {
      const response = await cinetpayClient.post('/payment/methods', {
        apikey:  cinetpayConfig.apiKey,
        site_id: cinetpayConfig.siteId,
      });

      return {
        success: true,
        data: response.data.data || [],
      };
    } catch (error) {
      logger.error('Erreur CinetPay méthodes paiement', {
        error: error.response?.data || error.message,
      });
      throw error;
    }
  }

  /**
   * Rembourser un paiement
   */
  async refundPayment(paymentId, amount, reason) {
    const payload = {
      apikey:         cinetpayConfig.apiKey,
      site_id:        cinetpayConfig.siteId,
      transaction_id: paymentId,
      amount,
      reason:         reason || 'Remboursement demandé',
    };

    try {
      const response = await cinetpayClient.post('/payment/refund', payload);
      return { success: true, data: response.data };
    } catch (error) {
      logger.error('Erreur CinetPay remboursement', {
        error: error.response?.data || error.message,
        paymentId,
        amount,
      });
      throw error;
    }
  }
}

const cinetpayService = new CinetPayService();

module.exports = { cinetpayService };