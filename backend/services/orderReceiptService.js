// backend/services/orderReceiptService.js
// Orchestrateur : génère le PDF et l'envoie par email + SMS
// Appelé après chaque paiement réussi

const receiptService = require('./receiptService');
const { emailService } = require('./emailService');
const { smsService }   = require('./smsService');
const { pool }         = require('../config/db');
const logger           = require('../utils/logger');

class OrderReceiptService {

  /**
   * Envoyer le reçu après une commande normale payée
   *
   * @param {number} orderId   - ID de la commande
   * @param {Object} clientInfo - { email, phone, first_name, last_name, user_id }
   */
  async sendOrderReceipt(orderId, clientInfo = {}) {
    try {
      logger.info(`📄 Génération reçu commande ${orderId}`);

      // 1. Récupérer toutes les données de la commande
      const orderData = await receiptService.buildOrderReceiptData(pool, orderId);
      if (!orderData) {
        logger.error(`Commande ${orderId} introuvable pour reçu`);
        return { success: false, error: 'Commande introuvable' };
      }

      // Compléter avec les infos client passées en paramètre (utile pour invités)
      if (!orderData.client_email && clientInfo.email) orderData.client_email = clientInfo.email;
      if (!orderData.client_phone && clientInfo.phone) orderData.client_phone = clientInfo.phone;
      if (!orderData.client_name && clientInfo.first_name) {
        orderData.client_name = `${clientInfo.first_name} ${clientInfo.last_name || ''}`.trim();
      }

      // 2. Générer le PDF
      const pdfBuffer = await receiptService.generateReceiptBuffer(orderData);
      logger.info(`✅ PDF généré pour commande ${orderId} (${pdfBuffer.length} bytes)`);

      const toEmail  = orderData.client_email || clientInfo.email;
      const toPhone  = orderData.client_phone || clientInfo.phone;
      const toName   = orderData.client_name  || clientInfo.first_name || 'Client';
      const amount   = parseFloat(orderData.total_amount || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0 });

      const results = { pdf: true, email: false, sms: false };

      // 3. Email avec PDF en pièce jointe
      if (toEmail) {
        const emailResult = await emailService.sendOrderReceipt({
          toEmail,
          toName,
          order: orderData,
          pdfBuffer,
          isSpecial: false
        });
        results.email = emailResult.success;
        if (emailResult.success) {
          logger.info(`📧 Reçu email envoyé à ${toEmail} pour commande ${orderId}`);
        }
      } else {
        logger.warn(`⚠️ Pas d'email pour commande ${orderId}, reçu email non envoyé`);
      }

      // 4. SMS de confirmation (surtout pour les invités sans email)
      if (toPhone) {
        const smsMsg = `✅ RestoTraiteur - Reçu commande ${orderId}\n`
          + `Établissement: ${orderData.business_name}\n`
          + `Montant: ${amount} FCFA\n`
          + `${toEmail ? 'Votre reçu PDF a été envoyé par email.' : 'Merci de votre commande !'}`;

        try {
          await smsService.sendSMS(toPhone, smsMsg);
          results.sms = true;
          logger.info(`📱 SMS reçu envoyé à ${toPhone}`);
        } catch (smsErr) {
          logger.error('Erreur SMS reçu:', smsErr.message);
        }
      }

      // 5. Notification dans le profil (si client connecté)
      if (clientInfo.user_id) {
        await this._createReceiptNotification(clientInfo.user_id, orderId, orderData, false);
      }

      return { success: true, ...results };

    } catch (error) {
      logger.error(`❌ Erreur génération reçu commande ${orderId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envoyer le reçu après une commande spéciale (traiteur)
   *
   * @param {number} specialOrderId
   * @param {Object} clientInfo - { email, phone, first_name, last_name, user_id }
   */
  async sendSpecialOrderReceipt(specialOrderId, clientInfo = {}) {
    try {
      logger.info(`📄 Génération reçu commande spéciale #${specialOrderId}`);

      const orderData = await receiptService.buildSpecialOrderReceiptData(pool, specialOrderId);
      if (!orderData) {
        return { success: false, error: 'Commande spéciale introuvable' };
      }

      if (!orderData.client_email && clientInfo.email) orderData.client_email = clientInfo.email;
      if (!orderData.client_phone && clientInfo.phone) orderData.client_phone = clientInfo.phone;

      const pdfBuffer = await receiptService.generateReceiptBuffer(orderData);

      const toEmail = orderData.client_email || clientInfo.email;
      const toPhone = orderData.client_phone || clientInfo.phone;
      const toName  = orderData.client_name  || clientInfo.first_name || 'Client';
      const amount  = parseFloat(orderData.estimated_budget || 0).toLocaleString('fr-FR', { minimumFractionDigits: 0 });

      const results = { pdf: true, email: false, sms: false };

      if (toEmail) {
        const emailResult = await emailService.sendOrderReceipt({
          toEmail,
          toName,
          order: orderData,
          pdfBuffer,
          isSpecial: true
        });
        results.email = emailResult.success;
      }

      if (toPhone) {
        const smsMsg = `✅ RestoTraiteur - Reçu commande spéciale SP-${specialOrderId}\n`
          + `Établissement: ${orderData.business_name}\n`
          + `Événement: ${orderData.event_type}\n`
          + `Budget: ${amount} FCFA\n`
          + `${toEmail ? 'Votre reçu a été envoyé par email.' : 'Merci !'}`;

        try {
          await smsService.sendSMS(toPhone, smsMsg);
          results.sms = true;
        } catch (smsErr) {
          logger.error('Erreur SMS reçu spécial:', smsErr.message);
        }
      }

      if (clientInfo.user_id) {
        await this._createReceiptNotification(clientInfo.user_id, specialOrderId, orderData, true);
      }

      return { success: true, ...results };

    } catch (error) {
      logger.error(`❌ Erreur reçu commande spéciale ${specialOrderId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Générer et retourner le PDF d'une commande (pour téléchargement depuis profil)
   * GET /api/client/orders/:id/receipt
   */
  async generateReceiptForDownload(pool, orderId, userId) {
    // Vérifier que la commande appartient au client
    const check = await pool.query(
      `SELECT o.*, u.email, u.phone
       FROM orders o
       LEFT JOIN users u ON o.client_id = u.id
       WHERE o.id = $1 AND (o.client_id = $2 OR o.client_email = (SELECT email FROM users WHERE id = $2))`,
      [orderId, userId]
    );

    if (check.rows.length === 0) {
      throw { status: 403, message: 'Commande introuvable ou accès non autorisé' };
    }

    const orderData = await receiptService.buildOrderReceiptData(pool, orderId);
    if (!orderData) {
      throw { status: 404, message: 'Données de commande introuvables' };
    }

    const pdfBuffer = await receiptService.generateReceiptBuffer(orderData);
    return { pdfBuffer, orderId, filename: `recu-${orderId}.pdf` };
  }

  /**
   * Générer et retourner le PDF d'une commande spéciale (pour téléchargement)
   */
  async generateSpecialReceiptForDownload(pool, specialOrderId, userId) {
    const check = await pool.query(
      `SELECT so.*
       FROM special_orders so
       LEFT JOIN users u ON so.client_id = u.id
       WHERE so.id = $1 AND (so.client_id = $2 OR so.client_email = (SELECT email FROM users WHERE id = $2))`,
      [specialOrderId, userId]
    );

    if (check.rows.length === 0) {
      throw { status: 403, message: 'Commande introuvable ou accès non autorisé' };
    }

    const orderData = await receiptService.buildSpecialOrderReceiptData(pool, specialOrderId);
    if (!orderData) {
      throw { status: 404, message: 'Données introuvables' };
    }

    const pdfBuffer = await receiptService.generateReceiptBuffer(orderData);
    return { pdfBuffer, specialOrderId, filename: `recu-SP-${specialOrderId}.pdf` };
  }

  /**
   * Crée une notification "reçu disponible" dans le profil client
   */
  async _createReceiptNotification(userId, orderId, orderData, isSpecial) {
    try {
      const ClientNotification = require('../models/ClientNotification');
      await ClientNotification.create({
        user_id:       userId,
        type:          'order_receipt',
        title:         '🧾 Reçu disponible',
        message:       `Votre reçu pour la commande ${isSpecial ? 'SP-' : ''}${orderId} chez ${orderData.business_name} est disponible. Téléchargez-le depuis l'onglet Commandes.`,
        reference_id:  orderId,
        reference_type: isSpecial ? 'special_order' : 'order',
        priority:      'normal',
        metadata:      { order_id: orderId, is_special: isSpecial, business_name: orderData.business_name }
      });
    } catch (err) {
      logger.error('Erreur création notification reçu:', err.message);
    }
  }
}

module.exports = new OrderReceiptService();