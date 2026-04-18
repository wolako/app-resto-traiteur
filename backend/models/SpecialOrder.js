const { pool } = require('../config/db');

class SpecialOrder {
  /**
   * Créer une commande spéciale
   */
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
      orderData.client_id || null,
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

  /**
   * Trouver par ID
   */
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

  /**
   * Trouver par business ID
   */
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

  /**
   * ✅ MODIFIÉ : Mettre à jour avec support devis
   */
  static async update(id, updateData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    const allowedFields = [
      'status', 'quoted_amount', 'deposit_percentage', 'deposit_amount',
      'deposit_status', 'deposit_payment_method', 'deposit_payment_fee',
      'deposit_payment_id', 'transport_fee', 'final_amount', 'quote_notes'
    ];

    Object.keys(updateData).forEach(key => {
      if (allowedFields.includes(key)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(updateData[key]);
        paramCount++;
      }
    });

    if (fields.length === 0) {
      return this.findById(id);
    }

    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);

    const query = `
      UPDATE special_orders 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Mettre à jour le statut uniquement
   */
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

  /**
   * ✅ NOUVEAU : Mettre à jour statut acompte
   */
  static async updateDepositStatus(id, depositStatus, extraData = {}) {
    const fields = ['deposit_status = $1'];
    const values = [depositStatus, id];
    let paramCount = 2;

    if (depositStatus === 'paid' && !extraData.deposit_paid_at) {
      fields.push('deposit_paid_at = CURRENT_TIMESTAMP');
    }

    if (depositStatus === 'cod_received') {
      fields.push('deposit_cod_confirmed_at = CURRENT_TIMESTAMP');
      if (extraData.confirmed_by) {
        paramCount++;
        fields.push(`deposit_cod_confirmed_by = $${paramCount}`);
        values.push(extraData.confirmed_by);
      }
    }

    Object.keys(extraData).forEach(key => {
      if (!['deposit_paid_at', 'confirmed_by'].includes(key)) {
        paramCount++;
        fields.push(`${key} = $${paramCount}`);
        values.push(extraData[key]);
      }
    });

    const result = await pool.query(
      `UPDATE special_orders SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      values
    );
    return result.rows[0];
  }

  /**
   * Obtenir les statistiques des commandes spéciales
   */
  static async getStatistics(businessId = null) {
    let query = `
      SELECT 
        COUNT(*) as total_orders,
        COUNT(*) FILTER (WHERE DATE(created_at) = CURRENT_DATE) as today_orders,
        COUNT(*) FILTER (WHERE status = 'pending') as pending_orders,
        COUNT(*) FILTER (WHERE status = 'quoted') as quoted_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed') as confirmed_orders,
        COALESCE(AVG(estimated_budget), 0) as average_budget,
        COALESCE(SUM(estimated_budget), 0) as total_budget,
        COALESCE(SUM(quoted_amount), 0) as total_quoted,
        COALESCE(SUM(deposit_amount) FILTER (WHERE deposit_status = 'paid'), 0) as total_deposits_received
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