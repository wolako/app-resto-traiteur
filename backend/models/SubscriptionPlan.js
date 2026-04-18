const { pool } = require('../config/db');

class SubscriptionPlan {
  static async getAll() {
    const result = await pool.query(
      'SELECT * FROM subscription_plans WHERE is_active = true ORDER BY sort_order'
    );
    return result.rows;
  }

  static async getById(id) {
    const result = await pool.query(
      'SELECT * FROM subscription_plans WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async getByName(name) {
    const result = await pool.query(
      'SELECT * FROM subscription_plans WHERE name = $1',
      [name]
    );
    return result.rows[0];
  }

  static async create(planData) {
    const {
      name, display_name, description, price, billing_period,
      max_menu_items, max_orders_per_month, max_photos,
      can_accept_online_orders, can_accept_reservations, can_accept_special_orders,
      priority_support, analytics_access, custom_branding, api_access,
      commission_rate, sort_order
    } = planData;

    const result = await pool.query(
      `INSERT INTO subscription_plans (
        name, display_name, description, price, billing_period,
        max_menu_items, max_orders_per_month, max_photos,
        can_accept_online_orders, can_accept_reservations, can_accept_special_orders,
        priority_support, analytics_access, custom_branding, api_access,
        commission_rate, sort_order
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [name, display_name, description, price, billing_period,
       max_menu_items, max_orders_per_month, max_photos,
       can_accept_online_orders, can_accept_reservations, can_accept_special_orders,
       priority_support, analytics_access, custom_branding, api_access,
       commission_rate, sort_order]
    );
    return result.rows[0];
  }

  static async update(id, planData) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(planData).forEach(key => {
      if (planData[key] !== undefined) {
        fields.push(`${key} = $${paramCount}`);
        values.push(planData[key]);
        paramCount++;
      }
    });

    values.push(id);
    const result = await pool.query(
      `UPDATE subscription_plans SET ${fields.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );
    return result.rows[0];
  }
}

module.exports = SubscriptionPlan;