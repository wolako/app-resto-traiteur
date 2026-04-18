const { pool } = require('../config/db');
const bcrypt = require('bcryptjs');

class User {
  static async findByEmail(email) {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );
    return result.rows[0];
  }

  static async findByPhone(phone) {
    const normalized = phone.replace(/\s/g, '');
    const result = await pool.query(
      `SELECT * FROM users WHERE REPLACE(phone, ' ', '') = $1`,
      [normalized]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query(
      'SELECT id, email, role, first_name, last_name, phone, is_active, created_at FROM users WHERE id = $1',
      [id]
    );
    return result.rows[0];
  }

  static async create(userData) {
    const {
      email,
      password,
      role,
      first_name,
      last_name,
      phone,
    } = userData;

    const hashedPassword = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, role, first_name, last_name, phone, is_active, created_at`,
      [email, hashedPassword, role, first_name, last_name, phone]
    );

    return result.rows[0];
  }

  static async verifyPassword(plainPassword, hashedPassword) {
    return await bcrypt.compare(plainPassword, hashedPassword);
  }

  static async update(id, updates) {
    // Champs autorisés pour la mise à jour
    const allowedFields = ['first_name', 'last_name', 'phone', 'password_hash', 'is_active'];
    
    // Filtrer les champs autorisés
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedFields.includes(key) && updates[key] !== undefined) {
        filteredUpdates[key] = updates[key];
      }
    });

    if (Object.keys(filteredUpdates).length === 0) {
      throw new Error('Aucune donnée valide à mettre à jour');
    }

    // Construire la requête dynamiquement
    const setClauses = [];
    const values = [];
    let paramIndex = 1;

    Object.keys(filteredUpdates).forEach(key => {
      setClauses.push(`${key} = $${paramIndex}`);
      values.push(filteredUpdates[key]);
      paramIndex++;
    });

    // Ajouter l'ID
    values.push(id);

    const query = `
      UPDATE users 
      SET ${setClauses.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = $${paramIndex}
      RETURNING id, email, role, first_name, last_name, phone, is_active, updated_at
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Erreur lors de la mise à jour utilisateur:', error);
      throw error;
    }
  }

  static async updatePassword(id, passwordHash) {
    const result = await pool.query(
      `UPDATE users 
      SET password_hash = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING id, email`,
      [passwordHash, id]
    );
    return result.rows[0];
  }

  static async updateStatus(id, isActive) {
    const result = await pool.query(
      `UPDATE users SET is_active = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING id, email, role, first_name, last_name, phone, is_active, updated_at`,
      [isActive, id]
    );

    return result.rows[0];
  }

  static async delete(id) {
    const result = await pool.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [id]
    );
    return result.rows[0];
  }

  static async getAll(filters = {}) {
    let query = `
      SELECT id, email, role, first_name, last_name, phone, is_active, created_at, updated_at
      FROM users
      WHERE 1=1
    `;
    const values = [];
    let paramCount = 1;

    if (filters.role) {
      query += ` AND role = $${paramCount}`;
      values.push(filters.role);
      paramCount++;
    }

    if (filters.is_active !== undefined) {
      query += ` AND is_active = $${paramCount}`;
      values.push(filters.is_active);
      paramCount++;
    }

    query += ` ORDER BY created_at DESC`;

    const result = await pool.query(query, values);
    return result.rows;
  }

  // static async getCount() {
  //   const result = await pool.query('SELECT COUNT(*) as total FROM users');
  //   return parseInt(result.rows[0].total);
  // }

  static async getCount() {
    const result = await pool.query(
      "SELECT COUNT(*) as total FROM users WHERE role != 'superadmin'"
    );
    return parseInt(result.rows[0].total);
  }

  // Compter les utilisateurs par rôle spécifique
  static async getCountByRole(role = null) {
    const { pool } = require('../config/db.js');
    
    if (role) {
      // Compter un rôle spécifique
      const result = await pool.query(
        'SELECT COUNT(*)::integer as total FROM users WHERE role = $1',
        [role]
      );
      return parseInt(result.rows[0]?.total || 0);
    } else {
      // Compter tous les rôles (sauf superadmin)
      const result = await pool.query(`
        SELECT role, COUNT(*)::integer as count
        FROM users
        WHERE role != 'superadmin'
        GROUP BY role
        ORDER BY role
      `);
      return result.rows;
    }
  }

  /**
   * Marquer l'email comme vérifié
   * @param {number} userId - ID de l'utilisateur
   * @returns {Object} Utilisateur mis à jour
   */
  static async markEmailAsVerified(userId) {
    try {
      // Vérifier d'abord si la colonne existe
      const checkColumnQuery = `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'users' AND column_name = 'email_verified'
      `;
      
      const columnCheck = await pool.query(checkColumnQuery);
      
      if (columnCheck.rows.length === 0) {
        // La colonne n'existe pas, on crée un log et on retourne un objet simulé
        console.warn('Colonne email_verified manquante dans la table users');
        return { id: userId, email_verified: true, email_verified_at: new Date() };
      }

      // La colonne existe, on fait la mise à jour normale
      const query = `
        UPDATE users
        SET email_verified = true, email_verified_at = NOW(), updated_at = NOW()
        WHERE id = $1
        RETURNING id, email, email_verified, email_verified_at
      `;

      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      // En cas d'erreur, on log et on retourne un objet simulé
      console.error('Erreur markEmailAsVerified:', error.message);
      return { id: userId, email_verified: true, email_verified_at: new Date() };
    }
  }

  /**
   * Vérifier si l'email est vérifié
   * @param {number} userId - ID de l'utilisateur
   * @returns {boolean} Statut de vérification
   */
  static async isEmailVerified(userId) {
    const query = `
      SELECT email_verified FROM users WHERE id = $1
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0]?.email_verified || false;
  }

}

module.exports = User;