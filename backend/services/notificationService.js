const { pool } = require('../config/db');
const { smsService } = require('./smsService');
const logger = require('../utils/logger');

/**
 * Service de gestion des notifications pour les restaurants
 */
class NotificationService {
  
  /**
   * Créer une notification dans la base de données
   */
  async createNotification(notificationData) {
    const {
      business_id,
      type,
      title,
      message,
      reference_id,
      reference_type,
      priority = 'normal',
      metadata = {}
    } = notificationData;

    try {
      const result = await pool.query(
        `INSERT INTO notifications 
         (business_id, type, title, message, reference_id, reference_type, priority, metadata, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())
         RETURNING *`,
        [business_id, type, title, message, reference_id, reference_type, priority, JSON.stringify(metadata)]
      );

      return result.rows[0];
    } catch (error) {
      logger.error('Erreur lors de la création de notification', {
        error: error.message,
        notificationData,
      });
      throw error;
    }
  }

  /**
   * Récupérer les notifications d'un restaurant
   */
  async getBusinessNotifications(businessId, options = {}) {
    const { limit = 50, offset = 0, unreadOnly = false } = options;

    let query = `
      SELECT * FROM notifications 
      WHERE business_id = $1
    `;
    
    if (unreadOnly) {
      query += ` AND is_read = false`;
    }

    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;

    try {
      const result = await pool.query(query, [businessId, limit, offset]);
      return result.rows;
    } catch (error) {
      logger.error('Erreur lors de la récupération des notifications', {
        error: error.message,
        businessId,
      });
      throw error;
    }
  }

  /**
   * Compter les notifications non lues
   */
  async getUnreadCount(businessId) {
    try {
      const result = await pool.query(
        `SELECT COUNT(*)::integer as count FROM notifications 
         WHERE business_id = $1 AND is_read = false`,
        [businessId]
      );
      return result.rows[0].count;
    } catch (error) {
      logger.error('Erreur lors du comptage des notifications', {
        error: error.message,
        businessId,
      });
      return 0;
    }
  }

  /**
   * Marquer une notification comme lue
   */
  async markAsRead(notificationId) {
    try {
      await pool.query(
        `UPDATE notifications SET is_read = true, read_at = NOW() 
         WHERE id = $1`,
        [notificationId]
      );
    } catch (error) {
      logger.error('Erreur lors du marquage de notification comme lue', {
        error: error.message,
        notificationId,
      });
    }
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  async markAllAsRead(businessId) {
    try {
      await pool.query(
        `UPDATE notifications SET is_read = true, read_at = NOW() 
         WHERE business_id = $1 AND is_read = false`,
        [businessId]
      );
    } catch (error) {
      logger.error('Erreur lors du marquage de toutes les notifications', {
        error: error.message,
        businessId,
      });
    }
  }

  /**
   * Envoyer une notification pour une nouvelle commande
   */
  async notifyNewOrder(order, business) {
    try {
      // Créer la notification dans la base
      const notification = await this.createNotification({
        business_id: business.id,
        type: 'new_order',
        title: 'Nouvelle commande',
        message: `Nouvelle commande #${order.id} de ${order.client_name} - ${order.total_amount} FCFA`,
        reference_id: order.id,
        reference_type: 'order',
        priority: 'high',
        metadata: {
          order_id: order.id,
          client_name: order.client_name,
          total_amount: order.total_amount,
        }
      });

      // Envoyer un SMS au restaurant
      if (business.phone) {
        const smsMessage = `🔔 Nouvelle commande #${order.id}\nClient: ${order.client_name}\nMontant: ${order.total_amount} FCFA\nTél: ${order.client_phone}`;
        await smsService.sendSMS(business.phone, smsMessage);
      }

      logger.info('Notification nouvelle commande envoyée', {
        orderId: order.id,
        businessId: business.id,
      });

      return notification;
    } catch (error) {
      logger.error('Erreur notification nouvelle commande', {
        error: error.message,
        orderId: order.id,
      });
    }
  }

  /**
   * Envoyer une notification pour une nouvelle réservation
   */
  async notifyNewReservation(reservation, business) {
    try {
      // Créer la notification dans la base
      const notification = await this.createNotification({
        business_id: business.id,
        type: 'new_reservation',
        title: 'Nouvelle réservation',
        message: `Nouvelle réservation de ${reservation.client_name} pour ${reservation.number_of_people} personnes le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot}`,
        reference_id: reservation.id,
        reference_type: 'reservation',
        priority: 'high',
        metadata: {
          reservation_id: reservation.id,
          client_name: reservation.client_name,
          reservation_date: reservation.reservation_date,
          time_slot: reservation.time_slot,
          number_of_people: reservation.number_of_people,
        }
      });

      // Envoyer un SMS au restaurant
      if (business.phone) {
        const smsMessage = `🔔 Nouvelle réservation\nClient: ${reservation.client_name}\nDate: ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')}\nHeure: ${reservation.time_slot}\nPersonnes: ${reservation.number_of_people}\nTél: ${reservation.client_phone}`;
        await smsService.sendSMS(business.phone, smsMessage);
      }

      logger.info('Notification nouvelle réservation envoyée', {
        reservationId: reservation.id,
        businessId: business.id,
      });

      return notification;
    } catch (error) {
      logger.error('Erreur notification nouvelle réservation', {
        error: error.message,
        reservationId: reservation.id,
      });
    }
  }

  /**
   * Envoyer une notification pour un paiement réussi
   */
  async notifyPaymentSuccess(payment, order, business) {
    try {
      // Créer la notification dans la base
      const notification = await this.createNotification({
        business_id: business.id,
        type: 'payment_success',
        title: 'Paiement reçu',
        message: `Paiement de ${payment.amount} FCFA reçu pour la commande #${order.id}`,
        reference_id: payment.id,
        reference_type: 'payment',
        priority: 'normal',
        metadata: {
          payment_id: payment.id,
          order_id: order.id,
          amount: payment.amount,
          payment_method: payment.payment_method,
        }
      });

      // Envoyer un SMS au restaurant
      if (business.phone) {
        const smsMessage = `✅ Paiement reçu\nCommande #${order.id}\nMontant: ${payment.amount} FCFA\nMéthode: ${payment.payment_method}`;
        await smsService.sendSMS(business.phone, smsMessage);
      }

      logger.info('Notification paiement réussi envoyée', {
        paymentId: payment.id,
        orderId: order.id,
        businessId: business.id,
      });

      return notification;
    } catch (error) {
      logger.error('Erreur notification paiement', {
        error: error.message,
        paymentId: payment.id,
      });
    }
  }

  /**
   * Envoyer une notification de confirmation de livraison
   */
  async notifyDeliveryConfirmed(order, business) {
    try {
      // Créer la notification dans la base
      const notification = await this.createNotification({
        business_id: business.id,
        type: 'delivery_confirmed',
        title: 'Livraison confirmée',
        message: `La commande #${order.id} a été livrée et confirmée par ${order.client_name}`,
        reference_id: order.id,
        reference_type: 'order',
        priority: 'normal',
        metadata: {
          order_id: order.id,
          client_name: order.client_name,
          delivered_at: new Date(),
        }
      });

      // Envoyer un SMS au restaurant
      if (business.phone) {
        const smsMessage = `✅ Livraison confirmée\nCommande #${order.id}\nClient: ${order.client_name}\nMontant: ${order.total_amount} FCFA`;
        await smsService.sendSMS(business.phone, smsMessage);
      }

      logger.info('Notification livraison confirmée envoyée', {
        orderId: order.id,
        businessId: business.id,
      });

      return notification;
    } catch (error) {
      logger.error('Erreur notification livraison', {
        error: error.message,
        orderId: order.id,
      });
    }
  }

  /**
   * Envoyer une notification pour une commande annulée
   */
  async notifyOrderCancelled(order, business, reason = '') {
    try {
      const notification = await this.createNotification({
        business_id: business.id,
        type: 'order_cancelled',
        title: 'Commande annulée',
        message: `La commande #${order.id} a été annulée${reason ? `: ${reason}` : ''}`,
        reference_id: order.id,
        reference_type: 'order',
        priority: 'normal',
        metadata: {
          order_id: order.id,
          client_name: order.client_name,
          reason,
        }
      });

      logger.info('Notification commande annulée envoyée', {
        orderId: order.id,
        businessId: business.id,
      });

      return notification;
    } catch (error) {
      logger.error('Erreur notification annulation', {
        error: error.message,
        orderId: order.id,
      });
    }
  }
}

module.exports = new NotificationService();