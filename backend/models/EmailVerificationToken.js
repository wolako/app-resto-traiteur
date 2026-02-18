const { pool } = require('../config/db');
const crypto = require('crypto');

class EmailVerificationToken {
  /**
   * Créer un nouveau token de vérification d'email
   * @param {number} userId - ID de l'utilisateur
   * @param {number} expiryMinutes - Durée de validité en minutes (défaut: 24h)
   * @returns {Object} Token créé
   */
  static async create(userId, expiryMinutes = 1440) {
    // Générer un token aléatoire sécurisé
    const token = crypto.randomBytes(32).toString('hex');
    
    // Calculer la date d'expiration
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    const query = `
      INSERT INTO email_verification_tokens 
        (user_id, token, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id, user_id, token, expires_at, created_at
    `;

    const result = await pool.query(query, [userId, token, expiresAt]);
    return result.rows[0];
  }

  /**
   * Trouver un token valide (non expiré et non utilisé)
   * @param {string} token - Token à vérifier
   * @returns {Object|null} Données du token avec infos utilisateur
   */
  static async findValidToken(token) {
    const query = `
      SELECT 
        evt.id,
        evt.user_id,
        evt.token,
        evt.expires_at,
        evt.verified,
        evt.verified_at,
        u.email,
        u.first_name,
        u.role
      FROM email_verification_tokens evt
      JOIN users u ON evt.user_id = u.id
      WHERE evt.token = $1
        AND evt.verified = false
        AND evt.expires_at > NOW()
        AND u.is_active = true
    `;

    const result = await pool.query(query, [token]);
    return result.rows[0] || null;
  }

  /**
   * Marquer un token comme utilisé (vérifié)
   * @param {string} token - Token à marquer
   * @returns {boolean} Succès de l'opération
   */
  static async markAsVerified(token) {
    const query = `
      UPDATE email_verification_tokens
      SET verified = true, verified_at = NOW()
      WHERE token = $1
      RETURNING id
    `;

    const result = await pool.query(query, [token]);
    return result.rowCount > 0;
  }

  /**
   * Invalider tous les tokens d'un utilisateur
   * @param {number} userId - ID de l'utilisateur
   * @returns {boolean} Succès de l'opération
   */
  static async invalidateUserTokens(userId) {
    const query = `
      UPDATE email_verification_tokens
      SET verified = true
      WHERE user_id = $1 AND verified = false
      RETURNING id
    `;

    const result = await pool.query(query, [userId]);
    return result.rowCount > 0;
  }

  /**
   * Supprimer les tokens expirés (nettoyage)
   * @returns {number} Nombre de tokens supprimés
   */
  static async deleteExpiredTokens() {
    const query = `
      DELETE FROM email_verification_tokens
      WHERE expires_at < NOW()
      RETURNING id
    `;

    const result = await pool.query(query);
    return result.rowCount;
  }
}

module.exports = EmailVerificationToken;