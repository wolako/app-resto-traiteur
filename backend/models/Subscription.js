const pool = require('../config/db');

class Subscription {
  // ✅ CORRECTION: Ajouter billing_period dans la requête
  static async getByBusinessId(businessId) {
    const result = await pool.query(
      `SELECT bs.*, 
              sp.name as plan_name, 
              sp.display_name, 
              sp.commission_rate,
              sp.max_menu_items, 
              sp.max_orders_per_month, 
              sp.max_photos,
              sp.billing_period,  -- ✅ AJOUTÉ
              sp.can_accept_online_orders, 
              sp.can_accept_reservations, 
              sp.can_accept_special_orders, 
              sp.priority_support,
              sp.analytics_access, 
              sp.custom_branding
       FROM business_subscriptions bs
       JOIN subscription_plans sp ON bs.plan_id = sp.id
       WHERE bs.business_id = $1 AND bs.status = 'active'
       ORDER BY bs.created_at DESC
       LIMIT 1`,
      [businessId]
    );
    return result.rows[0];
  }

  static async create(subscriptionData) {
    const { business_id, plan_id, start_date, end_date, next_billing_date, auto_renew } = subscriptionData;
    
    const result = await pool.query(
      `INSERT INTO business_subscriptions 
       (business_id, plan_id, status, start_date, end_date, next_billing_date, auto_renew)
       VALUES ($1, $2, 'active', $3, $4, $5, $6)
       RETURNING *`,
      [business_id, plan_id, start_date, end_date, next_billing_date, auto_renew]
    );
    return result.rows[0];
  }

  static async updateStatus(id, status) {
    const result = await pool.query(
      'UPDATE business_subscriptions SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );
    return result.rows[0];
  }

  static async cancel(businessId) {
    const result = await pool.query(
      `UPDATE business_subscriptions 
       SET status = 'cancelled', auto_renew = false 
       WHERE business_id = $1 AND status = 'active'
       RETURNING *`,
      [businessId]
    );
    return result.rows[0];
  }

  static async getExpiring(days = 7) {
    const result = await pool.query(
      `SELECT bs.*, b.name as business_name, sp.display_name as plan_name
       FROM business_subscriptions bs
       JOIN businesses b ON bs.business_id = b.id
       JOIN subscription_plans sp ON bs.plan_id = sp.id
       WHERE bs.status = 'active' 
       AND bs.end_date IS NOT NULL
       AND bs.end_date BETWEEN NOW() AND NOW() + INTERVAL '${days} days'
       ORDER BY bs.end_date ASC`
    );
    return result.rows;
  }

  static async getBusinessSubscription(businessId) {
    const result = await pool.query(
      `SELECT bs.*, sp.commission_rate, sp.billing_period  -- ✅ AJOUTÉ
      FROM business_subscriptions bs
      JOIN subscription_plans sp ON bs.plan_id = sp.id
      WHERE bs.business_id = $1 AND bs.status = 'active'
      ORDER BY bs.created_at DESC
      LIMIT 1`,
      [businessId]
    );
    return result.rows[0];
  }
}

module.exports = Subscription;