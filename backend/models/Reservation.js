const { pool } = require('../config/db');

class Reservation {
  static async findById(id) {
    const result = await pool.query(
      `SELECT r.*, b.name as restaurant_name, b.address as restaurant_address, b.phone as restaurant_phone
       FROM reservations r
       JOIN businesses b ON r.restaurant_id = b.id
       WHERE r.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByIdWithDetails(id) {
    return this.findById(id);
  }

  /**
   * ✅ MODIFIÉ : Créer réservation avec support acompte
   */
  static async create(reservationData) {
    const {
      restaurant_id,
      client_id,
      client_name,
      client_phone,
      client_email,
      reservation_date,
      time_slot,
      number_of_people,
      special_requests,
      // ✅ NOUVEAU : Champs acompte
      deposit_required,
      deposit_amount,
      deposit_status,
      deposit_payment_method,
      deposit_payment_fee,
      deposit_payment_id
    } = reservationData;

    const result = await pool.query(
      `INSERT INTO reservations
       (restaurant_id, client_id, client_name, client_phone, client_email,
        reservation_date, time_slot, number_of_people, special_requests, status,
        deposit_required, deposit_amount, deposit_status, 
        deposit_payment_method, deposit_payment_fee, deposit_payment_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING *`,
      [
        restaurant_id,
        client_id || null,
        client_name,
        client_phone,
        client_email,
        reservation_date,
        time_slot,
        number_of_people,
        special_requests,
        'pending',
        deposit_required || false,
        deposit_amount || null,
        deposit_status || 'none',
        deposit_payment_method || null,
        deposit_payment_fee || 0,
        deposit_payment_id || null
      ]
    );

    return result.rows[0];
  }

  static async updateStatus(id, status) {
    const result = await pool.query(
      `UPDATE reservations SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, id]
    );
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
      `UPDATE reservations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      values
    );
    return result.rows[0];
  }

  static async getByRestaurantId(restaurantId, filters = {}) {
    let query = `
      SELECT r.*, b.name as restaurant_name
      FROM reservations r
      JOIN businesses b ON r.restaurant_id = b.id
      WHERE r.restaurant_id = $1
    `;

    const values = [restaurantId];
    let paramCount = 2;

    if (filters.status) {
      query += ` AND r.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    if (filters.date) {
      query += ` AND r.reservation_date = $${paramCount}`;
      values.push(filters.date);
      paramCount++;
    }

    query += ` ORDER BY r.reservation_date DESC, r.time_slot DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async checkAvailability(restaurantId, date, timeSlot) {
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM reservations
       WHERE restaurant_id = $1
       AND reservation_date = $2
       AND time_slot = $3
       AND status != 'cancelled'`,
      [restaurantId, date, timeSlot]
    );

    return parseInt(result.rows[0].count) === 0;
  }

  static async getAvailableTimeSlots(restaurantId, date) {
    try {
      const businessResult = await pool.query(
        'SELECT opening_hour, closing_hour FROM businesses WHERE id = $1 AND type = $2 AND is_active = true',
        [restaurantId, 'restaurant']
      );

      if (businessResult.rows.length === 0) {
        return [];
      }

      const business = businessResult.rows[0];

      const formatTime = (timeValue) => {
        if (!timeValue) return null;
        if (typeof timeValue === 'string') {
          const parts = timeValue.split(':');
          return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
        return null;
      };

      const opening_hour = formatTime(business.opening_hour);
      const closing_hour = formatTime(business.closing_hour);

      if (!opening_hour || !closing_hour) return [];

      const reservedResult = await pool.query(
        `SELECT time_slot
         FROM reservations
         WHERE restaurant_id = $1
         AND reservation_date = $2
         AND status != 'cancelled'`,
        [restaurantId, date]
      );

      const reservedSlots = reservedResult.rows.map(row => row.time_slot);

      const availableSlots = [];
      const [startHours, startMinutes] = opening_hour.split(':').map(Number);
      const [endHours, endMinutes]     = closing_hour.split(':').map(Number);

      let startTotalMinutes = startHours * 60 + startMinutes;
      let endTotalMinutes   = endHours   * 60 + endMinutes;

      if (endTotalMinutes < startTotalMinutes) {
        endTotalMinutes += 1440;
      }

      for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += 30) {
        const normalizedMinutes = minutes % 1440;
        const hours = Math.floor(normalizedMinutes / 60);
        const mins  = normalizedMinutes % 60;
        const timeSlot = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
        if (!reservedSlots.includes(timeSlot)) {
          availableSlots.push(timeSlot);
        }
      }

      return availableSlots;
    } catch (error) {
      console.error('Error in getAvailableTimeSlots:', error);
      return [];
    }
  }

  static async getStatistics(restaurantId = null) {
    let query = `
      SELECT
        COUNT(*) AS total_reservations,
        COUNT(*) FILTER (WHERE DATE(reservation_date) = CURRENT_DATE) AS today_reservations,
        COUNT(*) FILTER (WHERE status = 'pending')   AS pending_reservations,
        COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_reservations,
        COUNT(*) FILTER (WHERE deposit_required = true) AS reservations_with_deposit,
        COALESCE(SUM(deposit_amount) FILTER (WHERE deposit_status = 'paid'), 0) AS total_deposits_received
      FROM reservations
    `;

    const values = [];

    if (restaurantId) {
      query += ' WHERE restaurant_id = $1';
      values.push(restaurantId);
    }

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT r.*, b.name as restaurant_name
      FROM reservations r
      JOIN businesses b ON r.restaurant_id = b.id
      WHERE 1=1
    `;

    const values = [];
    let paramCount = 1;

    if (filters.status) {
      query += ` AND r.status = $${paramCount}`;
      values.push(filters.status);
      paramCount++;
    }

    query += ` ORDER BY r.created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getAllForAdmin(filters = {}) {
    return this.getAll(filters);
  }
}

module.exports = Reservation;