const { pool } = require('../config/db');

class DriverReview {
  static async create({ driver_id, order_id, client_id, rating, comment }) {
    const result = await pool.query(
      `INSERT INTO driver_reviews (driver_id, order_id, client_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (order_id) DO UPDATE SET rating = EXCLUDED.rating, comment = EXCLUDED.comment
       RETURNING *`,
      [driver_id, order_id, client_id, rating, comment || null]
    );
    await this.recalcDriverRating(driver_id);
    return result.rows[0];
  }

  static async recalcDriverRating(driverId) {
    const { rows } = await pool.query(
      `SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*) AS count
       FROM driver_reviews WHERE driver_id = $1`,
      [driverId]
    );
    await pool.query(
      `UPDATE drivers SET average_rating = $1, reviews_count = $2 WHERE id = $3`,
      [rows[0].avg_rating || 0, rows[0].count || 0, driverId]
    );
  }

  static async findByOrderId(orderId) {
    const { rows } = await pool.query(`SELECT * FROM driver_reviews WHERE order_id = $1`, [orderId]);
    return rows[0] || null;
  }
}

module.exports = DriverReview;