const { pool } = require('../config/db');

class ClientNotification {
  /**
   * Créer une notification client
   */
  static async create(notificationData) {
    const {
      user_id,
      type,
      title,
      message,
      reference_id,
      reference_type,
      priority = 'normal',
      metadata = {}
    } = notificationData;

    const query = `
      INSERT INTO client_notifications 
      (user_id, type, title, message, reference_id, reference_type, priority, metadata, is_read, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, NOW())
      RETURNING *
    `;

    const result = await pool.query(query, [
      user_id,
      type,
      title,
      message,
      reference_id,
      reference_type,
      priority,
      JSON.stringify(metadata)
    ]);

    return result.rows[0];
  }

  /**
   * Obtenir les notifications d'un client
   */
  static async getClientNotifications(userId, options = {}) {
    const { limit = 50, offset = 0, unreadOnly = false } = options;

    let query = `
      SELECT * FROM client_notifications 
      WHERE user_id = $1
    `;
    
    if (unreadOnly) {
      query += ` AND is_read = false`;
    }

    query += ` ORDER BY created_at DESC LIMIT $2 OFFSET $3`;

    const result = await pool.query(query, [userId, limit, offset]);
    return result.rows;
  }

  /**
   * Compter les notifications non lues
   */
  static async getUnreadCount(userId) {
    const query = `
      SELECT COUNT(*)::integer as count 
      FROM client_notifications 
      WHERE user_id = $1 AND is_read = false
    `;
    
    const result = await pool.query(query, [userId]);
    return result.rows[0].count;
  }

  /**
   * Marquer une notification comme lue
   */
  static async markAsRead(notificationId, userId) {
    const query = `
      UPDATE client_notifications 
      SET is_read = true, read_at = NOW(), updated_at = NOW()
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [notificationId, userId]);
    return result.rows[0];
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  static async markAllAsRead(userId) {
    const query = `
      UPDATE client_notifications 
      SET is_read = true, read_at = NOW(), updated_at = NOW()
      WHERE user_id = $1 AND is_read = false
    `;
    
    await pool.query(query, [userId]);
  }

  /**
   * Supprimer une notification
   */
  static async delete(notificationId, userId) {
    const query = `
      DELETE FROM client_notifications 
      WHERE id = $1 AND user_id = $2
      RETURNING *
    `;
    
    const result = await pool.query(query, [notificationId, userId]);
    return result.rows[0];
  }
}

module.exports = ClientNotification;