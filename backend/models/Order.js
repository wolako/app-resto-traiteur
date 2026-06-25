const { pool } = require('../config/db');

class Order {
  static async findById(id) {
    const result = await pool.query(
      `SELECT o.*, b.name as business_name, b.type as business_type
       FROM orders o
       JOIN businesses b ON o.business_id = b.id
       WHERE o.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByIdWithDetails(id) {
    const order = await this.findById(id);
    if (!order) return null;

    const itemsResult = await pool.query(
      `SELECT oi.*, mi.name as item_name, mi.description as item_description
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [id]
    );

    order.items = itemsResult.rows;
    return order;
  }

  /**
   * ✅ MODIFIÉ : Créer une commande avec les frais
   */
  static async create(orderData, items) {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // ✅ MODIFIÉ : Ajout des nouveaux champs de frais
      const orderResult = await client.query(
        `INSERT INTO orders
        (business_id, client_id, client_name, client_phone, client_email,
          status, payment_status, payment_type, payment_method, notes,
          subtotal_amount, delivery_fee, payment_fee, total_amount,
          delivery_address, delivery_distance,
          delivery_lat, delivery_lng)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
        RETURNING *`,
        [
          orderData.business_id,
          orderData.client_id    || null,
          orderData.client_name,
          orderData.client_phone,
          orderData.client_email || null,
          orderData.status       || 'pending',
          orderData.payment_status || 'pending',
          orderData.payment_type   || 'online',
          orderData.payment_method,
          orderData.notes          || null,
          orderData.subtotal_amount || orderData.total_amount,
          orderData.delivery_fee    || 0,
          orderData.payment_fee     || 0,
          orderData.total_amount,
          orderData.delivery_address  || null,
          orderData.delivery_distance || null,
          orderData.delivery_lat      || null,  
          orderData.delivery_lng      || null   
        ]
      );

      const order = orderResult.rows[0];

      const itemPromises = items.map(item =>
        client.query(
          `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [order.id, item.menu_item_id, item.quantity, item.unit_price,
           item.quantity * item.unit_price]
        )
      );

      const itemResults = await Promise.all(itemPromises);
      const createdItems = itemResults.map(result => result.rows[0]);

      await client.query('COMMIT');

      return { ...order, items: createdItems };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE orders
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }

  static async updatePaymentStatus(id, paymentStatus) {
    const result = await pool.query(
      `UPDATE orders
       SET payment_status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [paymentStatus, id]
    );
    return result.rows[0];
  }

  static async getWithItems(id) {
    const order = await this.findById(id);
    if (!order) return null;

    const itemsResult = await pool.query(
      `SELECT oi.*, mi.name as item_name
       FROM order_items oi
       LEFT JOIN menu_items mi ON oi.menu_item_id = mi.id
       WHERE oi.order_id = $1`,
      [id]
    );

    order.items = itemsResult.rows;
    return order;
  }

  static async getByBusinessId(businessId, filters = {}) {
    let query = `
      SELECT o.*, b.name as business_name,
        dr.rating  AS driver_rating,
        dr.comment AS driver_comment
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      LEFT JOIN driver_reviews dr ON dr.order_id = o.id
      WHERE o.business_id = $1
    `;

    const values = [businessId];
    let paramCount = 2;

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

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getAllForAdmin(filters = {}) {
    let query = `
      SELECT
        o.*,
        b.name AS business_name,
        COUNT(oi.id) AS items_count,
        dr.rating  AS driver_rating,
        dr.comment AS driver_comment
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      LEFT JOIN order_items oi ON oi.order_id = o.id
      LEFT JOIN driver_reviews dr ON dr.order_id = o.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

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

    // ✅ dr.rating et dr.comment doivent être dans le GROUP BY
    query += ` GROUP BY o.id, b.name, dr.rating, dr.comment ORDER BY o.created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT o.*, b.name as business_name
      FROM orders o
      JOIN businesses b ON o.business_id = b.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

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

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getStatistics(businessId = null) {
    let query = `
      SELECT
        COUNT(*) AS total_orders,
        COUNT(*) FILTER (WHERE DATE(created_at AT TIME ZONE 'Africa/Lome') = CURRENT_DATE) AS today_orders,
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending_orders,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_orders,
        COALESCE(SUM(total_amount), 0) AS total_revenue,
        COALESCE(SUM(total_amount) FILTER (
          WHERE DATE(created_at AT TIME ZONE 'Africa/Lome') = CURRENT_DATE
        ), 0) AS today_revenue,
        COALESCE(AVG(total_amount), 0) AS average_order_value
      FROM orders
    `;

    const values = [];

    if (businessId) {
      query += ' WHERE business_id = $1';
      values.push(businessId);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getCount() {
    const result = await pool.query('SELECT COUNT(*) FROM orders');
    return parseInt(result.rows[0].count);
  }
}

module.exports = Order;