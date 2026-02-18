const { pool } = require('../config/db');

class Payment {
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM payments WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByPaymentId(paymentId) {
    const result = await pool.query(
      'SELECT * FROM payments WHERE payment_id = $1',
      [paymentId]
    );
    return result.rows[0];
  }

  // ✅ ORDER BY created_at DESC pour toujours retourner la tentative la plus récente
  static async findByOrderId(orderId) {
    const result = await pool.query(
      'SELECT * FROM payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1',
      [orderId]
    );
    return result.rows[0];
  }

  static async create(paymentData) {
    const {
      order_id,
      payment_id,
      amount,
      currency,
      payment_method,
      status,
    } = paymentData;

    const result = await pool.query(
      `INSERT INTO payments
       (order_id, payment_id, amount, currency, payment_method, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [order_id, payment_id, amount, currency, payment_method, status || 'pending']
    );

    return result.rows[0];
  }

  static async updateStatus(paymentId, status, transactionId = null, gatewayResponse = null) {
    const result = await pool.query(
      `UPDATE payments
       SET status = $1, transaction_id = $2, gateway_response = $3, updated_at = CURRENT_TIMESTAMP
       WHERE payment_id = $4
       RETURNING *`,
      [status, transactionId, gatewayResponse ? JSON.stringify(gatewayResponse) : null, paymentId]
    );
    return result.rows[0];
  }

  static async getByBusinessId(businessId) {
    const result = await pool.query(
      `SELECT p.*, o.client_name, o.client_phone, o.total_amount as order_amount
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE o.business_id = $1
       ORDER BY p.created_at DESC`,
      [businessId]
    );
    return result.rows;
  }

  static async getAll() {
    const result = await pool.query(
      `SELECT p.*, o.client_name, o.client_phone, o.total_amount as order_amount,
              b.name as business_name, b.type as business_type
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       JOIN businesses b ON o.business_id = b.id
       ORDER BY p.created_at DESC`
    );
    return result.rows;
  }

  static async getAllForAdmin() {
    const result = await pool.query(`
      SELECT
        p.id,
        p.order_id,
        p.payment_id,
        p.amount,
        p.currency,
        p.payment_method,
        p.status,
        p.transaction_id,
        p.created_at,
        p.updated_at,
        o.client_name,
        o.client_email,
        o.client_phone,
        b.name as business_name,
        b.type as business_type
      FROM payments p
      LEFT JOIN orders o ON p.order_id = o.id
      LEFT JOIN businesses b ON o.business_id = b.id
      ORDER BY p.created_at DESC
    `);
    return result.rows;
  }

  // ✅ CORRIGÉ : filtre sur 'paid' ET 'success' pour compatibilité
  //    'paid'    = statut utilisé par le code applicatif (sandbox + nouveau flow)
  //    'success' = statut legacy CinetPay (anciens enregistrements)
  static async getStatistics(businessId = null) {
    let query = `
      SELECT
        COUNT(*)                                                    as total_payments,
        COUNT(*) FILTER (WHERE DATE(p.created_at) = CURRENT_DATE)  as today_payments,
        COUNT(*) FILTER (WHERE p.status IN ('paid', 'success'))     as successful_payments,
        COUNT(*) FILTER (WHERE p.status = 'pending')                as pending_payments,
        COUNT(*) FILTER (WHERE p.status = 'failed')                 as failed_payments,
        COALESCE(SUM(p.amount)  FILTER (WHERE p.status IN ('paid', 'success')), 0)  as total_revenue,
        COALESCE(SUM(p.amount)  FILTER (
          WHERE p.status IN ('paid', 'success')
          AND DATE(p.created_at) = CURRENT_DATE
        ), 0)                                                        as today_revenue
      FROM payments p
    `;

    const values = [];

    if (businessId) {
      query += ` JOIN orders o ON p.order_id = o.id WHERE o.business_id = $1`;
      values.push(businessId);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getRevenueByPeriod(period = 'day', businessId = null) {
    let dateFormat;
    switch (period) {
      case 'week':  dateFormat = 'YYYY-IW'; break;
      case 'month': dateFormat = 'YYYY-MM'; break;
      default:      dateFormat = 'YYYY-MM-DD';
    }

    let query = `
      SELECT
        TO_CHAR(p.created_at, '${dateFormat}') as period,
        SUM(p.amount) as revenue,
        COUNT(*) as payment_count
      FROM payments p
    `;

    const values = [];
    // ✅ CORRIGÉ : filtre sur 'paid' ET 'success'
    let whereClause = `WHERE p.status IN ('paid', 'success')`;

    if (businessId) {
      query += ' JOIN orders o ON p.order_id = o.id';
      whereClause += ' AND o.business_id = $1';
      values.push(businessId);
    }

    query += ` ${whereClause} GROUP BY period ORDER BY period DESC LIMIT 30`;

    const result = await pool.query(query, values);
    return result.rows;
  }
}

module.exports = Payment;