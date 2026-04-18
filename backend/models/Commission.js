const { pool } = require('../config/db');

class Commission {
  static async create(commissionData) {
    const {
      order_id, special_order_id, business_id,
      order_amount, commission_rate, commission_amount
    } = commissionData;

    const result = await pool.query(
      `INSERT INTO commissions
       (order_id, special_order_id, business_id, order_amount, commission_rate, commission_amount, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [order_id, special_order_id, business_id, order_amount, commission_rate, commission_amount]
    );
    return result.rows[0];
  }

  static async getByBusinessId(businessId, status = null) {
    let query = `
      SELECT c.*,
             o.id as order_number,
             so.event_type as special_order_type
      FROM commissions c
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN special_orders so ON c.special_order_id = so.id
      WHERE c.business_id = $1
    `;
    const params = [businessId];

    if (status) {
      query += ' AND c.status = $2';
      params.push(status);
    }

    query += ' ORDER BY c.created_at DESC';
    const result = await pool.query(query, params);
    return result.rows;
  }

  static async updateStatus(id, status, extraData = {}) {
    const fields = ['status = $1'];
    const values = [status, id];
    let paramCount = 2;

    if (status === 'collected' && !extraData.collected_at) {
      fields.push('collected_at = CURRENT_TIMESTAMP');
    } else if (status === 'paid' && !extraData.paid_at) {
      fields.push('paid_at = CURRENT_TIMESTAMP');
    }

    Object.keys(extraData).forEach(key => {
      paramCount++;
      fields.push(`${key} = $${paramCount}`);
      values.push(extraData[key]);
    });

    const result = await pool.query(
      `UPDATE commissions SET ${fields.join(', ')} WHERE id = $2 RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async getTotalByBusiness(businessId) {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                                                          as total_count,
        COALESCE(SUM(commission_amount), 0)                                               as total_amount,
        COALESCE(SUM(CASE WHEN status = 'pending'   THEN commission_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status = 'collected' THEN commission_amount ELSE 0 END), 0) as collected_amount,
        COALESCE(SUM(CASE WHEN status = 'paid'      THEN commission_amount ELSE 0 END), 0) as paid_amount
      FROM commissions
      WHERE business_id = $1
    `, [businessId]);
    return result.rows[0];
  }

  static async getByOrderId(orderId) {
    const result = await pool.query(
      'SELECT * FROM commissions WHERE order_id = $1',
      [orderId]
    );
    return result.rows[0];
  }

  static async getBySpecialOrderId(specialOrderId) {
    const result = await pool.query(
      'SELECT * FROM commissions WHERE special_order_id = $1',
      [specialOrderId]
    );
    return result.rows[0];
  }

  /**
   * ✅ MODIFIÉ : Créer commission depuis une commande
   * IMPORTANT : Utilise subtotalAmount (montant plats uniquement), PAS total_amount
   */
  static async createFromOrder(orderId, businessId, subtotalAmount, commissionRate) {
    // ✅ Commission calculée sur SUBTOTAL uniquement (pas sur total avec frais)
    const commissionAmount = Math.round((subtotalAmount * commissionRate) / 100);

    const result = await pool.query(
      `INSERT INTO commissions
       (order_id, business_id, order_amount, commission_rate, commission_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [orderId, businessId, subtotalAmount, commissionRate, commissionAmount]
    );
    
    console.log(`✅ Commission créée: ${commissionRate}% de ${subtotalAmount} FCFA = ${commissionAmount} FCFA`);
    
    return result.rows[0];
  }

  /**
   * ✅ MODIFIÉ : Créer commission depuis commande spéciale
   * IMPORTANT : Utilise quotedAmount (montant devis), PAS le montant avec frais
   */
  static async createFromSpecialOrder(specialOrderId, businessId, quotedAmount, commissionRate) {
    // ✅ Commission calculée sur montant devis uniquement
    const commissionAmount = Math.round((quotedAmount * commissionRate) / 100);

    const result = await pool.query(
      `INSERT INTO commissions
       (special_order_id, business_id, order_amount, commission_rate, commission_amount, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING *`,
      [specialOrderId, businessId, quotedAmount, commissionRate, commissionAmount]
    );
    
    console.log(`✅ Commission commande spéciale créée: ${commissionRate}% de ${quotedAmount} FCFA = ${commissionAmount} FCFA`);
    
    return result.rows[0];
  }
}

module.exports = Commission;