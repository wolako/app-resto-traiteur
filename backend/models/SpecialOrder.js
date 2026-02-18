const { pool } = require('../config/db');

class SpecialOrder {
  // Créer une commande spéciale
  static async create(orderData) {
    const query = `
      INSERT INTO special_orders (
        business_id, client_id, client_name, client_email, client_phone,
        event_type, event_date, event_time, number_of_guests,
        delivery_address, city, menu_preferences, dietary_restrictions,
        special_requests, estimated_budget, status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      RETURNING *
    `;

    const values = [
      orderData.business_id,
      orderData.client_id || null, // AJOUT: Inclure client_id
      orderData.client_name,
      orderData.client_email,
      orderData.client_phone,
      orderData.event_type,
      orderData.event_date,
      orderData.event_time,
      orderData.number_of_guests,
      orderData.delivery_address,
      orderData.city,
      orderData.menu_preferences,
      orderData.dietary_restrictions || null,
      orderData.special_requests || null,
      orderData.estimated_budget || null,
      'pending'
    ];

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  // Trouver par ID
  static async findById(id) {
    const query = `
      SELECT so.*, b.name as business_name, b.type as business_type
      FROM special_orders so
      JOIN businesses b ON so.business_id = b.id
      WHERE so.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0];
  }

  // Trouver par business ID
  static async findByBusinessId(businessId) {
    const query = `
      SELECT so.*, b.name as business_name, b.type as business_type
      FROM special_orders so
      JOIN businesses b ON so.business_id = b.id
      WHERE so.business_id = $1
      ORDER BY so.created_at DESC
    `;
    const result = await pool.query(query, [businessId]);
    return result.rows;
  }

  // Mettre à jour le statut
  static async updateStatus(id, status) {
    const query = `
      UPDATE special_orders 
      SET status = $1, updated_at = CURRENT_TIMESTAMP 
      WHERE id = $2 
      RETURNING *
    `;
    const result = await pool.query(query, [status, id]);
    return result.rows[0];
  }

  // Obtenir les statistiques des commandes spéciales
  static async getStatistics(businessId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
        COALESCE(AVG(estimated_budget), 0) as average_budget,
        COALESCE(SUM(estimated_budget), 0) as total_budget
      FROM special_orders
    `;

    const values = [];
    
    if (businessId) {
      query += ' WHERE business_id = $1';
      values.push(businessId);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }
}

module.exports = SpecialOrder;