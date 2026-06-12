// models/Driver.js
const { pool } = require('../config/db');
const bcrypt   = require('bcryptjs');

class Driver {

  // ─── Créer un livreur (crée aussi le user) ──────────────────
  static async create({ business_id, created_by_type, created_by_id, first_name, last_name, phone, email, vehicle_type, max_concurrent_orders = 3, temp_password }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Hasher le mot de passe temporaire
      const password_hash = await bcrypt.hash(temp_password, 12);

      // Créer le user
      const userResult = await client.query(
        `INSERT INTO users (email, password_hash, role, first_name, last_name, phone, is_active, email_verified)
         VALUES ($1, $2, 'driver', $3, $4, $5, true, true)
         RETURNING *`,
        [email || null, password_hash, first_name, last_name, phone]
      );
      const user = userResult.rows[0];

      // Créer le profil driver
      const driverResult = await client.query(
        `INSERT INTO drivers (user_id, business_id, created_by_type, created_by_id, vehicle_type, max_concurrent_orders)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [user.id, business_id || null, created_by_type, created_by_id, vehicle_type || 'moto', max_concurrent_orders]
      );
      const driver = driverResult.rows[0];

      await client.query('COMMIT');
      return { ...driver, first_name: user.first_name, last_name: user.last_name, phone: user.phone, email: user.email };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Trouver par ID ──────────────────────────────────────────
  static async findById(id) {
    const result = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.phone, u.email, u.is_active AS user_active
       FROM drivers d JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par user_id ─────────────────────────────────────
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.phone, u.email
       FROM drivers d JOIN users u ON d.user_id = u.id
       WHERE d.user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  // ─── Liste livreurs d'un établissement ──────────────────────
  static async getByBusinessId(businessId) {
    const result = await pool.query(
      `SELECT
         dv.*,
         (SELECT json_agg(json_build_object(
           'id', da.id, 'order_id', da.order_id,
           'status', da.status, 'assigned_at', da.assigned_at,
           'order_ref', o.id, 'client_name', o.client_name,
           'delivery_address', o.delivery_address
         )) FROM delivery_assignments da
           JOIN orders o ON da.order_id = o.id
           WHERE da.driver_id = dv.id AND da.status IN ('assigned','picked_up')
         ) AS active_assignments
       FROM driver_availability dv
       WHERE dv.business_id = $1
       ORDER BY dv.first_name, dv.last_name`,
      [businessId]
    );
    return result.rows;
  }

  // ─── Liste tous les livreurs (admin) ─────────────────────────
  static async getAll() {
    const result = await pool.query(
      `SELECT dv.*,
         b.name AS business_name, b.type AS business_type
       FROM driver_availability dv
       LEFT JOIN businesses b ON dv.business_id = b.id
       ORDER BY dv.first_name, dv.last_name`
    );
    return result.rows;
  }

  // ─── Mise à jour profil ──────────────────────────────────────
  static async update(id, updates) {
    const allowedDriver = ['vehicle_type','max_concurrent_orders','is_active','business_id'];
    const allowedUser   = ['first_name','last_name','phone'];

    const driverFields = [], userFields = [], driverVals = [], userVals = [];
    let dp = 1, up = 1;

    Object.entries(updates).forEach(([k, v]) => {
      if (allowedDriver.includes(k)) { driverFields.push(`${k} = $${dp++}`); driverVals.push(v); }
      if (allowedUser.includes(k))   { userFields.push(`${k} = $${up++}`);   userVals.push(v); }
    });

    const clientDb = await pool.connect();
    try {
      await clientDb.query('BEGIN');

      let driver;
      if (driverFields.length > 0) {
        driverVals.push(id);
        const r = await clientDb.query(
          `UPDATE drivers SET ${driverFields.join(', ')}, updated_at = NOW() WHERE id = $${dp} RETURNING *`,
          driverVals
        );
        driver = r.rows[0];
      }

      if (userFields.length > 0) {
        const driverRow = driver || (await clientDb.query('SELECT user_id FROM drivers WHERE id = $1', [id])).rows[0];
        userVals.push(driverRow.user_id);
        await clientDb.query(
          `UPDATE users SET ${userFields.join(', ')}, updated_at = NOW() WHERE id = $${up}`,
          userVals
        );
      }

      await clientDb.query('COMMIT');
      return await this.findById(id);
    } catch (err) {
      await clientDb.query('ROLLBACK');
      throw err;
    } finally {
      clientDb.release();
    }
  }

  // ─── Mise à jour statut ──────────────────────────────────────
  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE drivers SET status = $1, last_seen_at = NOW(), updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [status, id]
    );
    return result.rows[0];
  }

  // ─── Recalculer statut après assignation ─────────────────────
  static async recalcStatus(id) {
    const result = await pool.query(
      `UPDATE drivers SET
         status = CASE
           WHEN status = 'offline' THEN 'offline'
           WHEN (
             SELECT COUNT(*) FROM delivery_assignments
             WHERE driver_id = $1 AND status IN ('assigned','picked_up')
           ) >= max_concurrent_orders THEN 'at_capacity'
           ELSE 'available'
         END,
         updated_at = NOW()
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  // ─── Commandes actives du livreur ────────────────────────────
  static async getActiveOrders(driverId) {
    const result = await pool.query(
      `SELECT
         da.id AS assignment_id,
         da.status AS assignment_status,
         da.assigned_at, da.picked_up_at,
         o.id AS order_id, o.client_name, o.client_phone,
         o.delivery_address, o.total_amount, o.notes,
         o.delivery_status,
         b.name AS business_name, b.address AS business_address, b.phone AS business_phone
       FROM delivery_assignments da
       JOIN orders o ON da.order_id = o.id
       JOIN businesses b ON o.business_id = b.id
       WHERE da.driver_id = $1 AND da.status IN ('assigned','picked_up')
       ORDER BY da.assigned_at ASC`,
      [driverId]
    );
    return result.rows;
  }

  // ─── Historique livraisons ────────────────────────────────────
  static async getHistory(driverId, limit = 20) {
    const result = await pool.query(
      `SELECT da.*, o.client_name, o.total_amount, o.delivery_address,
         b.name AS business_name
       FROM delivery_assignments da
       JOIN orders o ON da.order_id = o.id
       JOIN businesses b ON o.business_id = b.id
       WHERE da.driver_id = $1 AND da.status IN ('delivered','failed')
       ORDER BY COALESCE(da.delivered_at, da.failed_at) DESC
       LIMIT $2`,
      [driverId, limit]
    );
    return result.rows;
  }
}

module.exports = Driver;