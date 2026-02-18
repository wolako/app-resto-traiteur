const { pool } = require('../config/db.js');

class Business {
  static async findById(id) {
    const result = await pool.query(
      `SELECT b.*, u.first_name, u.last_name, u.email, u.phone as owner_phone
       FROM businesses b
       JOIN users u ON b.user_id = u.id
       WHERE b.id = $1`,
      [id]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM businesses WHERE user_id = $1',
      [userId]
    );
    return result.rows[0];
  }

  static async create(businessData) {
    const {
      user_id,
      name,
      type,
      description,
      address,
      phone,
      opening_hour,
      closing_hour,
      availability_start,
      availability_end,
    } = businessData;

    // Si phone n'est pas fourni, récupérer celui de l'utilisateur
    let businessPhone = phone;
    if (!businessPhone && user_id) {
      const userResult = await pool.query(
        'SELECT phone FROM users WHERE id = $1',
        [user_id]
      );
      if (userResult.rows[0]?.phone) {
        businessPhone = userResult.rows[0].phone;
      }
    }

    const result = await pool.query(
      `INSERT INTO businesses 
      (user_id, name, type, description, address, phone, opening_hour, closing_hour, 
        availability_start, availability_end, is_available, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        user_id, 
        name, 
        type, 
        description, 
        address, 
        businessPhone,
        opening_hour, 
        closing_hour, 
        availability_start, 
        availability_end,
        type === 'traiteur' ? false : null, 
        true
      ]
    );

    return result.rows[0];
  }

  // ✅ MÉTHODE CORRIGÉE : Gestion des champs TIME vides
  static async update(id, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    // ✅ CORRECTION : Filtrer les valeurs vides pour les champs TIME
    const timeFields = ['opening_hour', 'closing_hour', 'availability_start', 'availability_end'];

    Object.keys(updates).forEach(key => {
      // Si la valeur est undefined, on la saute
      if (updates[key] === undefined) {
        return;
      }

      // ✅ Si c'est un champ TIME et qu'il est vide ou null, on le met à NULL
      if (timeFields.includes(key) && (updates[key] === '' || updates[key] === null)) {
        fields.push(`${key} = $${paramCount}`);
        values.push(null);
        paramCount++;
        return;
      }

      // Sinon, on ajoute normalement
      fields.push(`${key} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    if (fields.length === 0) {
      throw new Error('Aucune donnée à mettre à jour');
    }

    values.push(id);

    const result = await pool.query(
      `UPDATE businesses SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );

    return result.rows[0];
  }

  static async updateAvailability(id, isAvailable) {
    const result = await pool.query(
      `UPDATE businesses SET is_available = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND (type = 'traiteur')
       RETURNING *`,
      [isAvailable, id]
    );

    return result.rows[0];
  }

  static async updateStatus(id, isActive) {
    const result = await pool.query(
      `UPDATE businesses SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [isActive, id]
    );

    return result.rows[0];
  }
  
  static async delete(id) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 1. Récupérer l'user_id avant la suppression
      const businessResult = await client.query(
        'SELECT user_id, name FROM businesses WHERE id = $1',
        [id]
      );
      
      if (!businessResult.rows[0]) {
        await client.query('ROLLBACK');
        throw new Error('Établissement introuvable');
      }
      
      const { user_id: userId, name: businessName } = businessResult.rows[0];
      
      // 2. Supprimer toutes les données liées manuellement (dans l'ordre)
      
      // Supprimer les tokens de vérification d'email
      await client.query('DELETE FROM email_verification_tokens WHERE user_id = $1', [userId]);
      
      // Supprimer les tokens de réinitialisation de mot de passe
      await client.query('DELETE FROM password_reset_tokens WHERE user_id = $1', [userId]);
      
      // Supprimer les réservations
      await client.query('DELETE FROM reservations WHERE restaurant_id = $1', [id]);
      
      // Supprimer les commandes spéciales
      await client.query('DELETE FROM special_orders WHERE business_id = $1', [id]);
      
      // Supprimer les paiements liés aux commandes de cet établissement
      await client.query(`
        DELETE FROM payments 
        WHERE order_id IN (SELECT id FROM orders WHERE business_id = $1)
      `, [id]);
      
      // Supprimer les items de commandes
      await client.query(`
        DELETE FROM order_items 
        WHERE order_id IN (SELECT id FROM orders WHERE business_id = $1)
      `, [id]);
      
      // Supprimer les commandes
      await client.query('DELETE FROM orders WHERE business_id = $1', [id]);
      
      // Supprimer les items de menu
      await client.query(`
        DELETE FROM menu_items 
        WHERE menu_id IN (SELECT id FROM menus WHERE business_id = $1)
      `, [id]);
      
      // Supprimer les menus
      await client.query('DELETE FROM menus WHERE business_id = $1', [id]);
      
      // Supprimer l'établissement
      await client.query('DELETE FROM businesses WHERE id = $1', [id]);
      
      // Supprimer l'utilisateur
      const deleteResult = await client.query(
        'DELETE FROM users WHERE id = $1 RETURNING id',
        [userId]
      );
      
      if (deleteResult.rowCount === 0) {
        await client.query('ROLLBACK');
        throw new Error('Impossible de supprimer l\'utilisateur');
      }
      
      await client.query('COMMIT');
      
      console.log(`✅ Utilisateur ${userId} et établissement ${id} (${businessName}) supprimés avec succès`);
      
      return { id, userId, businessName };
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Erreur lors de la suppression:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT b.*, u.first_name, u.last_name, u.email as owner_email, u.phone as owner_phone
      FROM businesses b
      JOIN users u ON b.user_id = u.id
      WHERE b.is_active = true
    `;
    const values = [];
    let paramCount = 1;

    if (filters.type) {
      query += ` AND b.type = $${paramCount}`;
      values.push(filters.type);
      paramCount++;
    }

    if (filters.is_available !== undefined && (filters.type === 'traiteur')) {
      query += ` AND b.is_available = $${paramCount}`;
      values.push(filters.is_available);
      paramCount++;
    }

    query += ` ORDER BY b.created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  static async getRestaurants() {
    const result = await pool.query(
      `SELECT b.*, u.first_name, u.last_name, u.phone as owner_phone
       FROM businesses b
       JOIN users u ON b.user_id = u.id
       WHERE b.type = 'restaurant' AND b.is_active = true
       ORDER BY b.name`
    );
    return result.rows;
  }

  static async getAvailableCaterers() {
    const result = await pool.query(
      `SELECT b.*, u.first_name, u.last_name, u.phone as owner_phone
       FROM businesses b
       JOIN users u ON b.user_id = u.id
       WHERE (b.type = 'traiteur') AND b.is_active = true AND b.is_available = true
       ORDER BY b.name`
    );
    return result.rows;
  }

  // ✅ Sélectionne tous les champs y compris b.phone
  static async getAllForAdmin() {
    const result = await pool.query(
      `SELECT b.id,
              b.user_id,
              b.name,
              b.type,
              b.description,
              b.address,
              b.phone,
              b.opening_hour,
              b.closing_hour,
              b.availability_start,
              b.availability_end,
              b.is_available,
              b.is_active,
              b.created_at,
              b.updated_at,
              u.first_name, 
              u.last_name, 
              u.email as owner_email,
              u.phone as owner_phone
       FROM businesses b
       JOIN users u ON b.user_id = u.id
       ORDER BY b.created_at DESC`
    );
    return result.rows;
  }

  static async getCount() {
    const result = await pool.query('SELECT COUNT(*) as total FROM businesses WHERE is_active = true');
    return parseInt(result.rows[0].total);
  }

  static async getCountByType() {
    const result = await pool.query(`
      SELECT type, COUNT(*) as count
      FROM businesses
      WHERE is_active = true
      GROUP BY type
      ORDER BY type
    `);
    return result.rows;
  }
}

module.exports = Business;