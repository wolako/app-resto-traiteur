const pool = require('../config/db');
const crypto = require('crypto');

class PasswordResetToken {
  /**
   * Créer un nouveau token de réinitialisation
   */
  static async create(userId, expiresInMinutes = 60) {
    // Générer un token sécurisé
    const token = crypto.randomBytes(32).toString('hex');
    
    // Calculer la date d'expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiresInMinutes);

    const query = `
      INSERT INTO password_reset_tokens (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token, expires_at, used, created_at
    `;

    const result = await pool.query(query, [userId, token, expiresAt]);
    return result.rows[0];
  }

  /**
   * Trouver un token valide
   */
  static async findValidToken(token) {
    const query = `
      SELECT 
        prt.*,
        u.id as user_id,
        u.email,
        u.first_name,
        u.last_name
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = $1
        AND prt.used = false
        AND prt.expires_at > CURRENT_TIMESTAMP
    `;

    const result = await pool.query(query, [token]);
    return result.rows[0] || null;
  }

  /**
   * Marquer un token comme utilisé
   */
  static async markAsUsed(token) {
    const query = `
      UPDATE password_reset_tokens
      SET used = true, used_at = CURRENT_TIMESTAMP
      WHERE token = $1
      RETURNING id
    `;

    const result = await pool.query(query, [token]);
    return result.rows[0];
  }

  /**
   * Invalider tous les tokens d'un utilisateur
   */
  static async invalidateUserTokens(userId) {
    const query = `
      UPDATE password_reset_tokens
      SET used = true, used_at = CURRENT_TIMESTAMP
      WHERE user_id = $1 AND used = false
    `;

    await pool.query(query, [userId]);
  }

  /**
   * Nettoyer les tokens expirés (à appeler périodiquement)
   */
  static async cleanupExpiredTokens() {
    const query = `
      DELETE FROM password_reset_tokens
      WHERE expires_at < CURRENT_TIMESTAMP
        OR (used = true AND used_at < CURRENT_TIMESTAMP - INTERVAL '7 days')
    `;

    const result = await pool.query(query);
    return result.rowCount;
  }

  /**
   * Vérifier si un utilisateur a déjà un token actif
   */
  static async hasActiveToken(userId) {
    const query = `
      SELECT COUNT(*) as count
      FROM password_reset_tokens
      WHERE user_id = $1
        AND used = false
        AND expires_at > CURRENT_TIMESTAMP
    `;

    const result = await pool.query(query, [userId]);
    return result.rows[0].count > 0;
  }
}

module.exports = PasswordResetToken;