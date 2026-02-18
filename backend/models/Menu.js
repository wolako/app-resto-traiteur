const { pool } = require('../config/db');

class Menu {
  static async findById(id) {
    const result = await pool.query(
      'SELECT * FROM menus WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async findByBusinessId(businessId) {
    const result = await pool.query(
      'SELECT * FROM menus WHERE business_id = $1 ORDER BY created_at DESC',
      [businessId]
    );
    return result.rows;
  }

  static async create(menuData) {
    const { business_id, name, description, is_active } = menuData;

    const result = await pool.query(
      `INSERT INTO menus (business_id, name, description, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [business_id, name, description, is_active !== undefined ? is_active : true]
    );

    return result.rows[0];
  }

  // ✅ FIX: Correction des placeholders
  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (updates[key] !== undefined) {
        // Conversion explicite pour les boolean
        if (key === 'is_active') {
          fields.push(`${key} = $${paramCount}`);
          values.push(Boolean(updates[key]));
        } else {
          fields.push(`${key} = $${paramCount}`);
          values.push(updates[key]);
        }
        paramCount++;
      }
    });

    if (fields.length === 0) {
      throw new Error('Aucune donnée à mettre à jour');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE menus SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  static async delete(id) {
    // D'abord supprimer les items du menu
    await pool.query('DELETE FROM menu_items WHERE menu_id = $1', [id]);
    
    // Ensuite supprimer le menu
    const result = await pool.query(
      'DELETE FROM menus WHERE id = $1 RETURNING *',
      [id]
    );
    return result.rows[0];
  }

  static async getWithItems(businessId) {
    const result = await pool.query(
      `SELECT 
         m.*,
         COALESCE(
           JSON_AGG(
             JSON_BUILD_OBJECT(
               'id', mi.id,
               'name', mi.name,
               'description', mi.description,
               'price', mi.price,
               'category', mi.category,
               'is_available', mi.is_available,
               'image_url', mi.image_url
             )
             ORDER BY mi.id
           ) FILTER (WHERE mi.id IS NOT NULL), 
           '[]'
         ) as items
       FROM menus m
       LEFT JOIN menu_items mi ON m.id = mi.menu_id
       WHERE m.business_id = $1
       GROUP BY m.id
       ORDER BY m.created_at DESC`,
      [businessId]
    );
    return result.rows;
  }
}

module.exports = Menu;