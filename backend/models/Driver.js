// models/Driver.js
const { pool }   = require('../config/db');
const bcrypt     = require('bcryptjs');

class Driver {

  // ─── Créer un livreur (user + driver en transaction) ────────
  static async create({
    business_id, created_by_type, created_by_id,
    first_name, last_name, phone, email,
    vehicle_type, max_concurrent_orders, temp_password,
    district  // ✅ AJOUTER
  }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const passwordHash = await bcrypt.hash(temp_password, 12);

      const userResult = await client.query(
        `INSERT INTO users (first_name, last_name, phone, email, password_hash, role, is_active, email_verified, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'driver',true,true,NOW(),NOW()) RETURNING id`,
        [first_name, last_name, phone, email || null, passwordHash]
      );
      const userId = userResult.rows[0].id;

      const driverResult = await client.query(
        `INSERT INTO drivers
          (user_id, business_id, vehicle_type, status, max_concurrent_orders,
            temp_password_used, created_by_type, created_by_id, district, created_at, updated_at)
        VALUES ($1,$2,$3,'offline',$4,true,$5,$6,$7,NOW(),NOW())
        RETURNING *`,
        [userId, business_id, vehicle_type, max_concurrent_orders,
        created_by_type, created_by_id, district || null]
      );

      await client.query('COMMIT');
      return { ...driverResult.rows[0], first_name, last_name, phone, email: email || null, user_id: userId };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Trouver par ID ─────────────────────────────────────────
  static async findById(driverId) {
    const result = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.phone, u.email, u.is_active
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       WHERE d.id = $1`,
      [driverId]
    );
    return result.rows[0] || null;
  }

  // ─── Trouver par user_id ─────────────────────────────────────
  static async findByUserId(userId) {
    const result = await pool.query(
      `SELECT d.*, u.first_name, u.last_name, u.phone, u.email, u.is_active
       FROM drivers d
       JOIN users u ON d.user_id = u.id
       WHERE d.user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  // ─── Livreurs d'un établissement + livreurs plateforme ───────
  static async getByBusinessId(businessId) {
    // Récupérer d'abord le district de l'établissement
    const businessResult = await pool.query(
      `SELECT district FROM businesses WHERE id = $1`,
      [businessId]
    );
    const businessDistrict = businessResult.rows[0]?.district || null;

    const result = await pool.query(
      `SELECT
        dv.*,
        u.first_name, u.last_name, u.phone, u.email, u.is_active,
        d.district,
        CASE WHEN dv.business_id IS NULL THEN 'platform' ELSE 'own' END AS driver_type,
        -- ✅ Score de proximité : même district = priorité 1, sinon 2
        CASE WHEN d.district = $2 THEN 1 ELSE 2 END AS zone_priority
      FROM driver_availability dv
      JOIN users u ON dv.user_id = u.id
      JOIN drivers d ON dv.id = d.id
      WHERE dv.business_id = $1 OR dv.business_id IS NULL
      ORDER BY
        zone_priority ASC,
        CASE WHEN dv.business_id = $1 THEN 0 ELSE 1 END,
        u.first_name, u.last_name`,
      [businessId, businessDistrict]
    );
    return result.rows;
  }

  // ─── Supprimer définitivement (cascade) ──────────────────────
  static async deleteForever(driverId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Annuler les assignations actives — sans updated_at (pas toujours présent)
      await client.query(
        `UPDATE delivery_assignments
        SET status = 'failed', failure_reason = 'Livreur supprimé',
            failed_at = NOW()
        WHERE driver_id = $1 AND status IN ('assigned','picked_up')`,
        [driverId]
      );

      // 2. Remettre les commandes concernées disponibles
      await client.query(
        `UPDATE orders
        SET delivery_status = 'ready_for_pickup',
            current_assignment_id = NULL,
            updated_at = NOW()
        WHERE id IN (
          SELECT order_id FROM delivery_assignments
          WHERE driver_id = $1
        ) AND delivery_status IN ('assigned','in_transit')`,
        [driverId]
      );

      // 3. Récupérer user_id
      const { rows } = await client.query('SELECT user_id FROM drivers WHERE id = $1', [driverId]);
      const userId = rows[0]?.user_id;

      // 4. Supprimer les assignations
      await client.query('DELETE FROM delivery_assignments WHERE driver_id = $1', [driverId]);

      // 5. Supprimer le profil livreur
      await client.query('DELETE FROM drivers WHERE id = $1', [driverId]);

      // 6. Supprimer l'utilisateur
      if (userId) await client.query('DELETE FROM users WHERE id = $1', [userId]);

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Tous les livreurs (admin) ───────────────────────────────
  static async getAll() {
    const result = await pool.query(
      `SELECT
         dv.*,
         u.first_name, u.last_name, u.phone, u.email, u.is_active,
         b.name AS business_name
       FROM driver_availability dv
       JOIN users       u ON dv.user_id      = u.id
       LEFT JOIN businesses b ON dv.business_id = b.id
       ORDER BY b.name, u.first_name`
    );
    return result.rows;
  }

  // ─── Modifier un livreur ─────────────────────────────────────
  static async update(driverId, data) {
    const allowed = ['vehicle_type', 'max_concurrent_orders', 'is_active'];
    const fields  = [];
    const values  = [];
    let   i       = 1;

    // Champs dans drivers
    const driverFields = ['vehicle_type', 'max_concurrent_orders', 'is_active', 'district'];
    const userFields   = ['first_name', 'last_name'];

    const driverUpdates = {};
    const userUpdates   = {};

    Object.entries(data).forEach(([key, val]) => {
      if (driverFields.includes(key)) driverUpdates[key] = val;
      if (userFields.includes(key))   userUpdates[key]   = val;
    });

    // Update drivers
    if (Object.keys(driverUpdates).length > 0) {
      const dFields = Object.keys(driverUpdates).map((k, idx) => `${k} = $${idx + 1}`);
      const dValues = Object.values(driverUpdates);
      await pool.query(
        `UPDATE drivers SET ${dFields.join(', ')}, updated_at = NOW() WHERE id = $${dValues.length + 1}`,
        [...dValues, driverId]
      );
    }

    // Update users si nécessaire
    if (Object.keys(userUpdates).length > 0) {
      const driver = await this.findById(driverId);
      if (driver) {
        const uFields = Object.keys(userUpdates).map((k, idx) => `${k} = $${idx + 1}`);
        const uValues = Object.values(userUpdates);
        await pool.query(
          `UPDATE users SET ${uFields.join(', ')}, updated_at = NOW() WHERE id = $${uValues.length + 1}`,
          [...uValues, driver.user_id]
        );
      }
    }

    return this.findById(driverId);
  }

  // ─── Mettre à jour le statut ─────────────────────────────────
  static async updateStatus(driverId, status) {
    await pool.query(
      `UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, driverId]
    );
  }

  // ─── Recalculer le statut (at_capacity ou available) ────────
  static async recalcStatus(driverId) {
    await pool.query(
      `UPDATE drivers SET
         status = CASE
           WHEN status = 'offline' THEN 'offline'
           WHEN (
             SELECT COUNT(*) FROM delivery_assignments
             WHERE driver_id = $1 AND status IN ('assigned', 'picked_up')
           ) >= max_concurrent_orders THEN 'at_capacity'
           ELSE 'available'
         END,
         updated_at = NOW()
       WHERE id = $1`,
      [driverId]
    );
  }

  // ─── Commandes actives du livreur ───────────────────────────
  static async getActiveOrders(driverId) {
    const result = await pool.query(
      `SELECT
        da.id                AS assignment_id,
        da.order_id,
        da.status            AS assignment_status,
        da.assigned_at,
        da.accepted_at,
        da.picked_up_at,
        o.total_amount,
        o.delivery_address,
        o.delivery_lat,      -- ✅ AJOUTER
        o.delivery_lng,      -- ✅ AJOUTER
        o.delivery_status,
        o.client_name,
        o.client_phone,      -- ✅ déjà présent, vérifier
        b.name               AS business_name,
        b.address            AS business_address,
        b.phone              AS business_phone
      FROM delivery_assignments da
      JOIN orders     o ON da.order_id   = o.id
      JOIN businesses b ON o.business_id = b.id
      WHERE da.driver_id = $1
        AND da.status    IN ('assigned','picked_up')
      ORDER BY da.assigned_at DESC`,
      [driverId]
    );
    return result.rows;
  }

  // ─── Historique récent ───────────────────────────────────────
  static async getHistory(driverId, limit = 10) {
    const result = await pool.query(
      `SELECT
        da.order_id,
        da.status,
        da.delivered_at,
        da.failed_at,
        da.failure_reason,
        o.total_amount,
        o.client_name,
        b.name AS business_name,
        dr.rating  AS client_rating,    -- ✅ AJOUTÉ
        dr.comment AS client_comment    -- ✅ AJOUTÉ
      FROM delivery_assignments da
      JOIN orders     o ON da.order_id   = o.id
      JOIN businesses b ON o.business_id = b.id
      LEFT JOIN driver_reviews dr ON dr.order_id = da.order_id   -- ✅ AJOUTÉ
      WHERE da.driver_id = $1
        AND da.status    IN ('delivered', 'failed')
      ORDER BY COALESCE(da.delivered_at, da.failed_at) DESC
      LIMIT $2`,
      [driverId, limit]
    );
    return result.rows;
  }
}

module.exports = Driver;