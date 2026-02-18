const ClientNotification = require('../models/ClientNotification');
const ClientProfile = require('../models/ClientProfile');
const { emailService } = require('./emailService');
const { smsService } = require('./smsService');
const logger = require('../utils/logger');

class ClientNotificationService {
  /**
   * Envoyer une notification client (push + email + SMS selon préférences)
   */
  async sendClientNotification(notificationData, clientInfo) {
    const { user_id, type, title, message, reference_id, reference_type, priority, metadata } = notificationData;
    const { email, phone, first_name } = clientInfo;

    try {
      // Récupérer les préférences du client
      const preferences = await ClientProfile.getNotificationPreferences(user_id);

      // ✅ TOUJOURS créer la notification push (dans la base de données)
      if (preferences.push_notifications) {
        await ClientNotification.create({
          user_id,
          type,
          title,
          message,
          reference_id,
          reference_type,
          priority,
          metadata
        });
        
        logger.info('✅ Notification push créée', {
          userId: user_id,
          type,
          title
        });
      }

      // Envoyer l'email selon préférences et type de notification
      if (preferences.email_notifications && this.shouldSendEmail(type, preferences)) {
        await this.sendEmailNotification(type, email, first_name, metadata);
      }

      // Envoyer le SMS selon préférences et type de notification
      if (preferences.sms_notifications && phone && this.shouldSendSMS(type, preferences)) {
        await this.sendSMSNotification(type, phone, metadata);
      }

      logger.info('Notification client envoyée avec succès', {
        userId: user_id,
        type,
        email: preferences.email_notifications && this.shouldSendEmail(type, preferences),
        sms: preferences.sms_notifications && this.shouldSendSMS(type, preferences),
        push: preferences.push_notifications
      });

    } catch (error) {
      logger.error('❌ Erreur lors de l\'envoi de notification client', {
        error: error.message,
        stack: error.stack,
        userId: user_id,
        type
      });
      throw error; // Relancer l'erreur pour qu'elle soit gérée par le contrôleur
    }
  }

  /**
   * Vérifier si on doit envoyer un email selon le type de notification
   */
  shouldSendEmail(type, preferences) {
    const emailMap = {
      'order_confirmed': preferences.notify_order_confirmed,
      'order_ready': preferences.notify_order_ready,
      'order_delivered': preferences.notify_order_delivered,
      'order_cancelled': true, // Toujours notifier les annulations
      'reservation_confirmed': preferences.notify_reservation_confirmed,
      'reservation_reminder': preferences.notify_reservation_reminder,
      'reservation_cancelled': true // Toujours notifier les annulations
    };
    return emailMap[type] !== false;
  }

  /**
   * Vérifier si on doit envoyer un SMS selon le type de notification
   */
  shouldSendSMS(type, preferences) {
    const smsMap = {
      'order_confirmed': preferences.notify_order_confirmed,
      'order_ready': preferences.notify_order_ready,
      'order_delivered': preferences.notify_order_delivered,
      'order_cancelled': true, // Toujours notifier les annulations
      'reservation_confirmed': preferences.notify_reservation_confirmed
    };
    return smsMap[type] !== false;
  }

  /**
   * Envoyer un email selon le type de notification
   */
  async sendEmailNotification(type, email, firstName, metadata) {
    try {
      switch (type) {
        case 'order_confirmed':
          await emailService.sendOrderConfirmationToClient(metadata.order, metadata.business, email, firstName);
          break;
        case 'order_ready':
          await emailService.sendOrderReadyNotification(metadata.order, metadata.business, email, firstName);
          break;
        case 'order_delivered':
          await emailService.sendOrderDeliveredNotification(metadata.order, metadata.business, email, firstName);
          break;
        case 'reservation_confirmed':
          await emailService.sendReservationConfirmation(metadata.reservation, metadata.restaurant);
          break;
        case 'reservation_reminder':
          await emailService.sendReservationReminder(metadata.reservation, metadata.restaurant, email, firstName);
          break;
      }
    } catch (error) {
      logger.error('Erreur envoi email client', { error: error.message, type });
    }
  }

  /**
   * Envoyer un SMS selon le type de notification
   */
  async sendSMSNotification(type, phone, metadata) {
    try {
      let message = '';
      
      switch (type) {
        case 'order_confirmed':
          if (metadata.order.id) {
            message = `Votre commande #${metadata.order.id} chez ${metadata.business.name} a été confirmée ! Montant: ${metadata.order.total_amount || metadata.order.estimated_budget || 0} FCFA`;
          } else {
            message = `Votre commande spéciale pour ${metadata.order.event_type} a été confirmée par ${metadata.business.name}`;
          }
          break;
        case 'order_ready':
          message = `Votre commande #${metadata.order.id} est prête ! Vous pouvez venir la récupérer chez ${metadata.business.name}.`;
          break;
        case 'order_delivered':
          message = `Votre commande #${metadata.order.id} a été livrée. Merci de confirmer la réception depuis votre profil.`;
          break;
        case 'order_cancelled':
          message = `Votre commande chez ${metadata.business.name} a été annulée. Contactez-nous pour plus d'infos.`;
          break;
        case 'reservation_confirmed':
          const date = new Date(metadata.reservation.reservation_date).toLocaleDateString('fr-FR');
          message = `Réservation confirmée au ${metadata.restaurant.name} le ${date} à ${metadata.reservation.time_slot}. À bientôt !`;
          break;
      }

      if (message) {
        await smsService.sendSMS(phone, message);
      }
    } catch (error) {
      logger.error('Erreur envoi SMS client', { error: error.message, type });
    }
  }

  /**
   * Notifier le client d'une commande confirmée
   */
  async notifyOrderConfirmed(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_confirmed',
      title: 'Commande confirmée',
      message: `Votre commande #${order.id} a été confirmée par ${business.name}`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'high',
      metadata: { order, business }
    }, clientInfo);
  }

  /**
   * Notifier le client que sa commande est prête
   */
  async notifyOrderReady(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_ready',
      title: 'Commande prête',
      message: `Votre commande #${order.id} est prête ! Vous pouvez venir la récupérer.`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'high',
      metadata: { order, business }
    }, clientInfo);
  }

  /**
   * Notifier le client que sa commande a été livrée
   */
  async notifyOrderDelivered(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_delivered',
      title: 'Commande livrée',
      message: `Votre commande #${order.id} a été livrée. Merci de confirmer la réception.`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'normal',
      metadata: { order, business }
    }, clientInfo);
  }

  /**
   * ✅ NOUVEAU: Notifier le client d'une commande annulée
   */
  async notifyOrderCancelled(order, business, clientInfo) {
    await this.sendClientNotification({
      user_id: order.client_id,
      type: 'order_cancelled',
      title: 'Commande annulée',
      message: `Votre commande #${order.id} a été annulée par ${business.name}`,
      reference_id: order.id,
      reference_type: 'order',
      priority: 'high',
      metadata: { order, business }
    }, clientInfo);
  }

  /**
   * Notifier le client d'une réservation confirmée
   */
  async notifyReservationConfirmed(reservation, restaurant, clientInfo) {
    await this.sendClientNotification({
      user_id: reservation.client_id,
      type: 'reservation_confirmed',
      title: 'Réservation confirmée',
      message: `Votre réservation au ${restaurant.name} a été confirmée pour le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot}`,
      reference_id: reservation.id,
      reference_type: 'reservation',
      priority: 'high',
      metadata: { reservation, restaurant }
    }, clientInfo);
  }

  /**
   * Rappel de réservation (24h avant)
   */
  async sendReservationReminder(reservation, restaurant, clientInfo) {
    await this.sendClientNotification({
      user_id: reservation.client_id,
      type: 'reservation_reminder',
      title: 'Rappel de réservation',
      message: `N'oubliez pas votre réservation demain au ${restaurant.name} à ${reservation.time_slot}`,
      reference_id: reservation.id,
      reference_type: 'reservation',
      priority: 'normal',
      metadata: { reservation, restaurant }
    }, clientInfo);
  }
}

module.exports = new ClientNotificationService();