// services/clientNotificationService.js — VERSION FINALE
// Remplace entièrement le fichier précédent.
// Corrections vs v1 :
//   ✅ Type 'quote_received' ajouté dans shouldNotifyType
//   ✅ Méthode notifyReservationCancelled ajoutée
//   ✅ SMS + email pour 'quote_received' ajoutés

const ClientNotification = require('../models/ClientNotification');
const ClientProfile = require('../models/ClientProfile');
const { emailService } = require('./emailService');
const { smsService } = require('./smsService');
const logger = require('../utils/logger');

class ClientNotificationService {

  async sendClientNotification(notificationData, clientInfo) {
    const {
      user_id, type, title, message,
      reference_id, reference_type, priority = 'normal', metadata = {}
    } = notificationData;

    const { email, phone, first_name } = clientInfo;

    try {
      const prefs = await ClientProfile.getNotificationPreferences(user_id);

      // ── Push in-app ───────────────────────────────────────────
      if (prefs.push_notifications) {
        await ClientNotification.create({
          user_id, type, title, message,
          reference_id, reference_type, priority, metadata
        });
        logger.info('✅ Notification in-app créée', { userId: user_id, type });
        // TODO Web Push VAPID: await webPushService.sendToUser(user_id, { title, body: message });
      }

      // ── Email ─────────────────────────────────────────────────
      if (prefs.email_notifications && email && this.shouldNotifyType(type, prefs)) {
        await this.sendEmailNotification(type, email, first_name, metadata)
          .catch(err => logger.error('Erreur email client (non bloquant)', {
            error: err.message, type, userId: user_id
          }));
      }

      // ── SMS ───────────────────────────────────────────────────
      if (prefs.sms_notifications && phone && this.shouldNotifyType(type, prefs)) {
        await this.sendSMSNotification(type, phone, metadata)
          .catch(err => logger.error('Erreur SMS client (non bloquant)', {
            error: err.message, type, userId: user_id
          }));
      }

      logger.info('Notification client envoyée', {
        userId: user_id, type,
        channels: {
          push:  prefs.push_notifications,
          email: prefs.email_notifications && !!email,
          sms:   prefs.sms_notifications   && !!phone,
        }
      });

    } catch (error) {
      logger.error('❌ Erreur notification client', {
        error: error.message, stack: error.stack,
        userId: user_id, type
      });
      throw error;
    }
  }

  // ════════════════════════════════════════════════════════════
  // FILTRE PAR TYPE — vérifie la préférence granulaire
  // ════════════════════════════════════════════════════════════

  shouldNotifyType(type, prefs) {
    // Annulations et devis → toujours envoyer (info critique)
    if (['order_cancelled', 'reservation_cancelled', 'quote_received'].includes(type)) {
      return true;
    }

    const typeToPreference = {
      'order_confirmed':        prefs.notify_order_confirmed,
      'order_ready':            prefs.notify_order_ready,
      'order_delivered':        prefs.notify_order_delivered,
      'reservation_confirmed':  prefs.notify_reservation_confirmed,
      'reservation_reminder':   prefs.notify_reservation_reminder,
    };

    if (!(type in typeToPreference)) {
      logger.warn('Type de notification inconnu — envoi ignoré', { type });
      return false;
    }

    return typeToPreference[type] === true;
  }

  // ════════════════════════════════════════════════════════════
  // EMAIL
  // ════════════════════════════════════════════════════════════

  async sendEmailNotification(type, email, firstName, metadata) {
    switch (type) {
      case 'order_confirmed':
        await emailService.sendOrderConfirmationToClient(
          metadata.order, metadata.business, email, firstName
        );
        break;
      case 'order_ready':
        await emailService.sendOrderReadyNotification(
          metadata.order, metadata.business, email, firstName
        );
        break;
      case 'order_delivered':
        await emailService.sendOrderDeliveredNotification(
          metadata.order, metadata.business, email, firstName
        );
        break;
      case 'order_cancelled':
        await emailService.sendOrderCancelledNotification(
          metadata.order, metadata.business, email, firstName
        );
        break;
      case 'reservation_confirmed':
        await emailService.sendReservationConfirmation(
          metadata.reservation, metadata.restaurant
        );
        break;
      case 'reservation_cancelled':
        await emailService.sendReservationCancellation(
          metadata.reservation, metadata.restaurant
        );
        break;
      case 'reservation_reminder':
        await emailService.sendReservationReminder(
          metadata.reservation, metadata.restaurant, email, firstName
        );
        break;
      case 'quote_received':
        // ✅ Pas de template email dédié pour l'instant —
        // emailService.sendQuoteEmail est déjà appelé directement
        // depuis sendSpecialOrderQuote dans orderController.
        // On évite le doublon ici.
        logger.info('Email devis déjà envoyé depuis orderController', { email });
        break;
      default:
        logger.warn('Pas de template email pour ce type', { type });
    }
  }

  // ════════════════════════════════════════════════════════════
  // SMS
  // ════════════════════════════════════════════════════════════

  async sendSMSNotification(type, phone, metadata) {
    let message = '';

    switch (type) {
      case 'order_confirmed':
        message = metadata.order?.id
          ? `✅ Commande #${metadata.order.id} confirmée chez ${metadata.business?.name}. Montant : ${metadata.order.total_amount} FCFA`
          : `✅ Commande spéciale (${metadata.order?.event_type}) confirmée par ${metadata.business?.name}`;
        break;
      case 'order_ready':
        message = `🍽️ Commande #${metadata.order?.id} prête ! Récupérez-la chez ${metadata.business?.name}.`;
        break;
      case 'order_delivered':
        message = `📦 Commande #${metadata.order?.id} livrée. Confirmez la réception depuis votre profil.`;
        break;
      case 'order_cancelled':
        message = `❌ Commande chez ${metadata.business?.name} annulée. Contactez-nous pour plus d'infos.`;
        break;
      case 'reservation_confirmed': {
        const date = metadata.reservation?.reservation_date
          ? new Date(metadata.reservation.reservation_date).toLocaleDateString('fr-FR')
          : '';
        message = `✅ Réservation confirmée au ${metadata.restaurant?.name} le ${date} à ${metadata.reservation?.time_slot}. À bientôt !`;
        break;
      }
      case 'reservation_cancelled':
        message = `❌ Réservation au ${metadata.restaurant?.name} annulée. Une nouvelle réservation est possible sur RestoTraiteur.`;
        break;
      case 'reservation_reminder': {
        const date = metadata.reservation?.reservation_date
          ? new Date(metadata.reservation.reservation_date).toLocaleDateString('fr-FR')
          : '';
        message = `⏰ Rappel : réservation au ${metadata.restaurant?.name} demain ${date} à ${metadata.reservation?.time_slot}.`;
        break;
      }
      case 'quote_received': {
        const amount = metadata.final_amount
          ? Number(metadata.final_amount).toLocaleString('fr-FR')
          : '?';
        const deposit = metadata.deposit_amount
          ? Number(metadata.deposit_amount).toLocaleString('fr-FR')
          : '?';
        message = `📄 Devis reçu de votre traiteur ! Montant : ${amount} FCFA. Acompte requis : ${deposit} FCFA. Consultez votre profil RestoTraiteur pour accepter.`;
        break;
      }
      default:
        logger.warn('Pas de template SMS pour ce type', { type });
        return;
    }

    if (message) {
      await smsService.sendSMS(phone, message);
    }
  }

  // ════════════════════════════════════════════════════════════
  // MÉTHODES PUBLIQUES
  // ════════════════════════════════════════════════════════════

  async notifyOrderConfirmed(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_confirmed',
      title: 'Commande confirmée ✅',
      message: `Votre commande #${order.id} a été confirmée par ${business.name}`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'high',
      metadata: { order, business }
    }, clientInfo);
  }

  async notifyOrderReady(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_ready',
      title: 'Commande prête 🍽️',
      message: `Votre commande #${order.id} est prête !`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'high',
      metadata: { order, business }
    }, clientInfo);
  }

  async notifyOrderDelivered(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_delivered',
      title: 'Commande livrée 📦',
      message: `Votre commande #${order.id} a été livrée. Confirmez la réception.`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'normal',
      metadata: { order, business }
    }, clientInfo);
  }

  async notifyOrderCancelled(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_cancelled',
      title: 'Commande annulée ❌',
      message: `Votre commande #${order.id} a été annulée par ${business.name}`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'high',
      metadata: { order, business }
    }, clientInfo);
  }

  async notifyReservationConfirmed(reservation, restaurant, clientInfo) {
    await this.sendClientNotification({
      user_id: reservation.client_id,
      type: 'reservation_confirmed',
      title: 'Réservation confirmée ✅',
      message: `Votre réservation au ${restaurant.name} est confirmée pour le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot}`,
      reference_id: reservation.id,
      reference_type: 'reservation',
      priority: 'high',
      metadata: { reservation, restaurant }
    }, clientInfo);
  }

  // ✅ NOUVEAU — manquait dans la v1
  async notifyReservationCancelled(reservation, restaurant, clientInfo) {
    await this.sendClientNotification({
      user_id: reservation.client_id,
      type: 'reservation_cancelled',
      title: 'Réservation annulée ❌',
      message: `Votre réservation au ${restaurant.name} du ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot} a été annulée`,
      reference_id: reservation.id,
      reference_type: 'reservation',
      priority: 'high',
      metadata: { reservation, restaurant }
    }, clientInfo);
  }

  async sendReservationReminder(reservation, restaurant, clientInfo) {
    await this.sendClientNotification({
      user_id: reservation.client_id,
      type: 'reservation_reminder',
      title: 'Rappel de réservation ⏰',
      message: `N'oubliez pas : réservation demain au ${restaurant.name} à ${reservation.time_slot}`,
      reference_id: reservation.id,
      reference_type: 'reservation',
      priority: 'normal',
      metadata: { reservation, restaurant }
    }, clientInfo);
  }
}

module.exports = new ClientNotificationService();