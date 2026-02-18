const axios = require('axios');
const { logger } = require('../utils/logger');

class SMSService {
  constructor() {
    this.isConfigured = !!process.env.SMS_API_KEY;
    this.apiKey = process.env.SMS_API_KEY;
    this.sender = process.env.SMS_SENDER || 'RestaurantApp';
    
    if (!this.isConfigured) {
      logger.warn('Configuration SMS manquante, service SMS désactivé');
    } else {
      logger.info('Service SMS initialisé');
    }
  }

  async sendSMS(to, message) {
    if (!this.isConfigured) {
      logger.warn('Service SMS non configuré');
      return { success: false, message: 'Service SMS non disponible' };
    }

    try {
      // Exemple d'implémentation générique
      // À adapter selon le fournisseur SMS utilisé (ex: Twilio, Orange, etc.)
      const response = await axios.post('https://api.sms-provider.com/send', {
        api_key: this.apiKey,
        sender: this.sender,
        to: to,
        message: message,
      }, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      if (response.data.success) {
        logger.info('SMS envoyé', {
          to,
          messageId: response.data.message_id,
        });

        return { 
          success: true, 
          messageId: response.data.message_id 
        };
      } else {
        throw new Error(response.data.message || 'Erreur envoi SMS');
      }
    } catch (error) {
      logger.error('Erreur envoi SMS', {
        to,
        error: error.message,
      });

      return { success: false, error: error.message };
    }
  }

  async sendOrderNotification(order, business) {
    const message = `Nouvelle commande #${order.id} reçue chez ${business.name}. ` +
                   `Client: ${order.client_name} - Montant: ${order.total_amount} FCFA`;

    return this.sendSMS(business.phone, message);
  }

  async sendReservationNotification(reservation, restaurant) {
    const message = `Nouvelle réservation au ${restaurant.name}. ` +
                   `${reservation.client_name} - ${reservation.reservation_date} à ${reservation.time_slot} ` +
                   `(${reservation.number_of_people} pers.)`;

    return this.sendSMS(restaurant.phone, message);
  }

  async sendOrderStatusUpdate(order, newStatus) {
    const statusMessages = {
      'confirmed': 'Votre commande a été confirmée',
      'preparing': 'Votre commande est en préparation',
      'ready': 'Votre commande est prête',
      'delivered': 'Votre commande a été livrée',
      'cancelled': 'Votre commande a été annulée',
    };

    const message = `Commande #${order.id}: ${statusMessages[newStatus] || 'Statut mis à jour'}. ` +
                   `Merci de votre confiance !`;

    return this.sendSMS(order.client_phone, message);
  }

  async sendReservationStatusUpdate(reservation, newStatus) {
    const statusMessages = {
      'confirmed': 'Votre réservation a été confirmée',
      'cancelled': 'Votre réservation a été annulée',
    };

    const message = `Réservation: ${statusMessages[newStatus] || 'Statut mis à jour'}. ` +
                   `${reservation.reservation_date} à ${reservation.time_slot}`;

    return this.sendSMS(reservation.client_phone, message);
  }

  async sendPaymentConfirmation(payment, order) {
    const message = `Paiement confirmé ! Commande #${order.id} - ${payment.amount} FCFA via ${payment.payment_method?.toUpperCase()}. ` +
                   `Merci !`;

    return this.sendSMS(order.client_phone, message);
  }

  // ✅ Méthode pour commande spéciale
  async sendSpecialOrderNotification(specialOrder, business) {
    const message = `🔔 Nouvelle commande spéciale\nType: ${specialOrder.event_type}\nClient: ${specialOrder.client_name}\nDate: ${new Date(specialOrder.event_date).toLocaleDateString('fr-FR')}\nInvités: ${specialOrder.number_of_guests}\nTél: ${specialOrder.client_phone}`;

    return this.sendSMS(business.phone, message);
  }

  // ============================================================
// À AJOUTER dans smsService.js, dans la classe SMSService
// avant la dernière accolade }
// ============================================================

  /**
   * Rappel SMS d'expiration imminente (J-3, J-1)
   * @param {object} params
   * @param {string} params.phone        - Numéro du propriétaire
   * @param {string} params.businessName - Nom de l'établissement
   * @param {string} params.planName     - Nom du plan
   * @param {number} params.daysLeft     - Jours restants
   */
  async sendSubscriptionExpiryReminder({ phone, businessName, planName, daysLeft }) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://votre-app.com';
    const dayText = daysLeft === 1 ? 'demain' : `dans ${daysLeft} jours`;

    const message = daysLeft === 1
      ? `🚨 URGENT - ${businessName} : votre abonnement ${planName} expire DEMAIN. Renouvelez maintenant : ${frontendUrl}/restaurant/dashboard`
      : `⚠️ ${businessName} : votre abonnement ${planName} expire ${dayText}. Renouvelez sur ${frontendUrl}/restaurant/dashboard`;

    return this.sendSMS(phone, message);
  }

  /**
   * Notification SMS d'expiration effective
   * @param {object} params
   * @param {string} params.phone        - Numéro du propriétaire
   * @param {string} params.businessName - Nom de l'établissement
   * @param {string} params.planName     - Nom du plan
   */
  async sendSubscriptionExpiredNotification({ phone, businessName, planName }) {
    const frontendUrl = process.env.FRONTEND_URL || 'https://votre-app.com';

    const message = `⏰ ${businessName} : votre abonnement ${planName} a expiré. Votre visibilité est réduite. Renouvelez sur ${frontendUrl}/restaurant/dashboard`;

    return this.sendSMS(phone, message);
  }

}

const smsService = new SMSService();

// ✅ CORRECTION : Export correct de l'instance
module.exports = {
  smsService,
  SMSService, // Export aussi la classe si besoin
};