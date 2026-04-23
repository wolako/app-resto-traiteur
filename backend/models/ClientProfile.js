const { pool } = require('../config/db');

class ClientProfile {
  /**
   * Obtenir les préférences de notification d'un client
   */
  static async getNotificationPreferences(userId) {
    const query = `
      SELECT * FROM client_notification_preferences
      WHERE user_id = $1
    `;
    const result = await pool.query(query, [userId]);
    
    // Si pas de préférences, créer avec valeurs par défaut
    if (result.rows.length === 0) {
      return await this.createDefaultPreferences(userId);
    }
    
    return result.rows[0];
  }

  /**
   * Créer des préférences par défaut pour un nouveau client
   */
  static async createDefaultPreferences(userId) {
    const query = `
      INSERT INTO client_notification_preferences (user_id)
      VALUES ($1)
      ON CONFLICT (user_id) DO UPDATE SET updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const result = await pool.query(query, [userId]);
    return result.rows[0];
  }

  /**
   * Mettre à jour les préférences de notification
   */
  
  static async updateNotificationPreferences(userId, preferences) {
    const {
      email_notifications,
      sms_notifications,
      push_notifications,
      notify_order_confirmed,
      notify_order_ready,
      notify_order_delivered,
      notify_reservation_confirmed,
      notify_reservation_reminder
    } = preferences;

    // ✅ UPSERT — crée la ligne si elle n'existe pas encore
    const query = `
      INSERT INTO client_notification_preferences (
        user_id,
        email_notifications,
        sms_notifications,
        push_notifications,
        notify_order_confirmed,
        notify_order_ready,
        notify_order_delivered,
        notify_reservation_confirmed,
        notify_reservation_reminder,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) DO UPDATE SET
        email_notifications          = COALESCE(EXCLUDED.email_notifications,          client_notification_preferences.email_notifications),
        sms_notifications            = COALESCE(EXCLUDED.sms_notifications,            client_notification_preferences.sms_notifications),
        push_notifications           = COALESCE(EXCLUDED.push_notifications,           client_notification_preferences.push_notifications),
        notify_order_confirmed       = COALESCE(EXCLUDED.notify_order_confirmed,       client_notification_preferences.notify_order_confirmed),
        notify_order_ready           = COALESCE(EXCLUDED.notify_order_ready,           client_notification_preferences.notify_order_ready),
        notify_order_delivered       = COALESCE(EXCLUDED.notify_order_delivered,       client_notification_preferences.notify_order_delivered),
        notify_reservation_confirmed = COALESCE(EXCLUDED.notify_reservation_confirmed, client_notification_preferences.notify_reservation_confirmed),
        notify_reservation_reminder  = COALESCE(EXCLUDED.notify_reservation_reminder,  client_notification_preferences.notify_reservation_reminder),
        updated_at                   = CURRENT_TIMESTAMP
      RETURNING *
    `;

    const result = await pool.query(query, [
      userId,
      email_notifications,
      sms_notifications,
      push_notifications,
      notify_order_confirmed,
      notify_order_ready,
      notify_order_delivered,
      notify_reservation_confirmed,
      notify_reservation_reminder
    ]);

    return result.rows[0];
  }

  /**
   * ✅ CORRIGÉ : Obtenir les commandes d'un client (orders + special_orders)
   */
  static async getClientOrders(userId, userEmail, userPhone, filters = {}) {
    // Rechercher par client_id, email ET téléphone
    let query = `
      SELECT o.*, b.name as business_name, b.type as business_type
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      WHERE (o.client_id = $1 OR o.client_email = $2 OR o.client_phone = $3)
    `;
    const values = [userId, userEmail, userPhone];
    let paramCount = 4;

    if (filters.status) {
      query += ` AND o.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.payment_status) {
      query += ` AND o.payment_status = $${paramCount}`;
      values.push(filters.payment_status);
      paramCount++;
    }

    query += ` ORDER BY o.created_at DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * ✅ CORRIGÉ : Obtenir les réservations d'un client
   */
  static async getClientReservations(userId, userEmail, userPhone, filters = {}) {
    let query = `
      SELECT r.*, b.name as restaurant_name
      FROM reservations r
      JOIN businesses b ON r.restaurant_id = b.id
      WHERE (r.client_id = $1 OR r.client_email = $2 OR r.client_phone = $3)
    `;
    const values = [userId, userEmail, userPhone];
    let paramCount = 4;

    if (filters.status) {
      query += ` AND r.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.upcoming) {
      query += ` AND r.reservation_date >= CURRENT_DATE`;
    }

    query += ` ORDER BY r.reservation_date DESC, r.time_slot DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramCount}`;
      values.push(filters.limit);
    }

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * ✅ CORRIGÉ : Obtenir les commandes spéciales d'un client
   */
  static async getClientSpecialOrders(userId, userEmail, userPhone, filters = {}) {
    let query = `
      SELECT so.*, b.name as business_name
      FROM special_orders so
      JOIN businesses b ON so.business_id = b.id
      WHERE (so.client_id = $1 OR so.client_email = $2 OR so.client_phone = $3)
    `;
    const values = [userId, userEmail, userPhone];
    let paramCount = 4;

    if (filters.status) {
      query += ` AND so.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    query += ` ORDER BY so.created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  /**
   * ✅ CORRIGÉ : Obtenir les statistiques du profil client
   * INCLUT MAINTENANT LES SPECIAL_ORDERS
   */
  static async getClientStatistics(userId, userEmail, userPhone) {
    console.log('📊 Récupération statistiques pour:', { userId, userEmail, userPhone });
    
    const query = `
      SELECT 
        -- Commandes normales
        (SELECT COUNT(*) FROM orders 
         WHERE client_id = $1 OR client_email = $2 OR client_phone = $3) as total_orders,
        
        (SELECT COUNT(*) FROM orders 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND status = 'delivered') as completed_orders,
        
        (SELECT COUNT(*) FROM orders 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND status IN ('pending', 'confirmed', 'preparing', 'ready')) as active_orders,
        
        -- Réservations
        (SELECT COUNT(*) FROM reservations 
         WHERE client_id = $1 OR client_email = $2 OR client_phone = $3) as total_reservations,
        
        (SELECT COUNT(*) FROM reservations 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND reservation_date >= CURRENT_DATE) as upcoming_reservations,
        
        -- Commandes spéciales
        (SELECT COUNT(*) FROM special_orders 
         WHERE client_id = $1 OR client_email = $2 OR client_phone = $3) as total_special_orders,
        
        (SELECT COUNT(*) FROM special_orders 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND status = 'confirmed') as confirmed_special_orders,
        
        (SELECT COUNT(*) FROM special_orders 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND status = 'pending') as pending_special_orders,
        
        -- Total dépensé (orders + special_orders)
        (SELECT COALESCE(SUM(total_amount), 0) FROM orders 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND status = 'delivered') +
        (SELECT COALESCE(SUM(estimated_budget), 0) FROM special_orders 
         WHERE (client_id = $1 OR client_email = $2 OR client_phone = $3) 
         AND status = 'confirmed') as total_spent
    `;
    
    const result = await pool.query(query, [userId, userEmail, userPhone]);
    const stats = result.rows[0];
    
    console.log('📊 Statistiques récupérées:', stats);
    
    return stats;
  }

  /**
   * Confirmer la livraison d'une commande par le client
   */
  static async confirmDelivery(orderId, userId) {
    const query = `
      UPDATE orders
      SET 
        delivery_confirmed = true,
        delivery_confirmed_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $1 AND client_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [orderId, userId]);
    return result.rows[0];
  }
}

module.exports = ClientProfile;