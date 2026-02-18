// backend/services/testimonialService.js
// CORRECTION : u.photo → la table users n'a PAS de colonne photo
//              Remplacé par t.display_photo (colonne dans testimonials)

const { pool } = require('../config/db');

class TestimonialService {

  // =============================================
  // ELIGIBILITY CHECK
  // =============================================

  async checkEligibility(userId) {
    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    if (!user) throw { status: 404, message: 'Utilisateur non trouvé' };

    const accountAgeDays = Math.floor(
      (new Date() - new Date(user.created_at)) / (1000 * 60 * 60 * 24)
    );
    if (accountAgeDays < 30) {
      throw {
        status: 400,
        message: `Votre compte doit être actif depuis au moins 30 jours. Âge actuel : ${accountAgeDays} jours.`
      };
    }

    const ordersResult = await pool.query(
      `SELECT COUNT(*) as count FROM orders WHERE client_id = $1 AND status = 'delivered'`,
      [userId]
    );
    const deliveredOrdersCount = parseInt(ordersResult.rows[0].count);
    if (deliveredOrdersCount < 3) {
      throw {
        status: 400,
        message: `Vous devez avoir au moins 3 commandes livrées. Vous en avez ${deliveredOrdersCount}.`
      };
    }

    const existingResult = await pool.query('SELECT id FROM testimonials WHERE user_id = $1', [userId]);
    if (existingResult.rows.length > 0) {
      throw { status: 409, message: 'Vous avez déjà soumis un témoignage' };
    }

    return true;
  }

  // =============================================
  // PUBLIC METHODS
  // =============================================

  async getApprovedTestimonials(featured = false, limit = 10) {
    // ✅ FIX : u.photo n'existe pas → supprimé
    //          On utilise t.display_photo (dans testimonials) + u.phone si besoin
    let query = `
      SELECT
        t.id,
        t.user_id,
        t.rating,
        t.comment,
        t.status,
        t.is_featured,
        t.display_name,
        t.display_photo,
        t.rejection_reason,
        t.created_at,
        t.updated_at,
        u.first_name,
        u.last_name,
        u.email,
        u.phone
      FROM testimonials t
      LEFT JOIN users u ON t.user_id = u.id
      WHERE t.status = 'approved'
    `;

    const params = [];
    let paramIndex = 1;

    if (featured) {
      query += ` AND t.is_featured = $${paramIndex}`;
      params.push(true);
      paramIndex++;
    }

    query += ` ORDER BY t.is_featured DESC, t.created_at DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows.map(row => this.formatTestimonialWithUser(row));
  }

  // =============================================
  // CLIENT METHODS
  // =============================================

  async submitTestimonial(userId, data) {
    await this.checkEligibility(userId);

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = userResult.rows[0];

    const displayName  = data.displayName || `${user.first_name} ${user.last_name.charAt(0)}.`;
    // ✅ FIX : user.photo n'existe pas → display_photo vient des données soumises uniquement
    const displayPhoto = data.allowPhoto ? (data.photoUrl || null) : null;

    const result = await pool.query(
      `INSERT INTO testimonials (user_id, rating, comment, status, display_name, display_photo)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [userId, data.rating, data.comment.trim(), 'pending', displayName, displayPhoto]
    );

    return result.rows[0];
  }

  async getUserTestimonial(userId) {
    // ✅ FIX : u.photo supprimé
    const result = await pool.query(
      `SELECT
         t.id, t.user_id, t.rating, t.comment, t.status, t.is_featured,
         t.display_name, t.display_photo, t.rejection_reason, t.created_at, t.updated_at,
         u.first_name, u.last_name, u.email, u.phone
       FROM testimonials t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.user_id = $1`,
      [userId]
    );

    if (result.rows.length === 0) return { hasTestimonial: false };

    return {
      hasTestimonial: true,
      testimonial: this.formatTestimonialWithUser(result.rows[0])
    };
  }

  async updateMyTestimonial(userId, data) {
    const existingResult = await pool.query('SELECT * FROM testimonials WHERE user_id = $1', [userId]);
    if (existingResult.rows.length === 0) throw { status: 404, message: 'Aucun témoignage trouvé' };

    const testimonial = existingResult.rows[0];
    if (testimonial.status === 'approved') {
      throw { status: 403, message: 'Vous ne pouvez pas modifier un témoignage déjà approuvé' };
    }

    const fields  = [];
    const params  = [];
    let paramIndex = 1;

    if (data.rating     !== undefined) { fields.push(`rating = $${paramIndex}`);       params.push(data.rating);            paramIndex++; }
    if (data.comment    !== undefined) { fields.push(`comment = $${paramIndex}`);      params.push(data.comment.trim());    paramIndex++; }
    if (data.displayName !== undefined) { fields.push(`display_name = $${paramIndex}`); params.push(data.displayName);      paramIndex++; }

    if (data.allowPhoto !== undefined) {
      // ✅ FIX : on utilise data.photoUrl si fourni, pas user.photo
      fields.push(`display_photo = $${paramIndex}`);
      params.push(data.allowPhoto ? (data.photoUrl || null) : null);
      paramIndex++;
    }

    if (testimonial.status === 'rejected') {
      fields.push(`status = $${paramIndex}`);       params.push('pending'); paramIndex++;
      fields.push(`rejection_reason = NULL`);
    }

    fields.push(`updated_at = NOW()`);
    params.push(userId);

    const result = await pool.query(
      `UPDATE testimonials SET ${fields.join(', ')} WHERE user_id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0];
  }

  // =============================================
  // ADMIN METHODS
  // =============================================

  async getAllTestimonials(status = null) {
    // ✅ FIX : u.photo supprimé
    let query = `
      SELECT
        t.id, t.user_id, t.rating, t.comment, t.status, t.is_featured,
        t.display_name, t.display_photo, t.rejection_reason, t.created_at, t.updated_at,
        u.first_name, u.last_name, u.email, u.phone
      FROM testimonials t
      LEFT JOIN users u ON t.user_id = u.id
    `;

    const params = [];
    if (status) { query += ' WHERE t.status = $1'; params.push(status); }
    query += ' ORDER BY t.created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(row => this.formatTestimonialWithUser(row));
  }

  async getTestimonialStats() {
    const result = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'pending')  as pending,
        COUNT(*) FILTER (WHERE status = 'approved') as approved,
        COUNT(*) FILTER (WHERE status = 'rejected') as rejected,
        COUNT(*) FILTER (WHERE status = 'approved' AND is_featured = true) as featured,
        ROUND(AVG(rating) FILTER (WHERE status = 'approved'), 1) as average_rating
      FROM testimonials
    `);
    const s = result.rows[0];
    return {
      total:          parseInt(s.total),
      pending:        parseInt(s.pending),
      approved:       parseInt(s.approved),
      rejected:       parseInt(s.rejected),
      featured:       parseInt(s.featured),
      average_rating: parseFloat(s.average_rating) || 0
    };
  }

  async approveTestimonial(id, featured = false) {
    const result = await pool.query(
      `UPDATE testimonials SET status = 'approved', is_featured = $1, rejection_reason = NULL, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [featured, id]
    );
    if (result.rows.length === 0) throw { status: 404, message: 'Témoignage non trouvé' };
    return result.rows[0];
  }

  async rejectTestimonial(id, reason = null) {
    const result = await pool.query(
      `UPDATE testimonials SET status = 'rejected', is_featured = false, rejection_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, id]
    );
    if (result.rows.length === 0) throw { status: 404, message: 'Témoignage non trouvé' };
    return result.rows[0];
  }

  async toggleFeatured(id) {
    const getResult = await pool.query('SELECT * FROM testimonials WHERE id = $1', [id]);
    if (getResult.rows.length === 0) throw { status: 404, message: 'Témoignage non trouvé' };
    const t = getResult.rows[0];
    if (t.status !== 'approved') throw { status: 400, message: 'Seuls les témoignages approuvés peuvent être mis en vedette' };

    const result = await pool.query(
      `UPDATE testimonials SET is_featured = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [!t.is_featured, id]
    );
    return result.rows[0];
  }

  async deleteTestimonial(id) {
    const result = await pool.query('DELETE FROM testimonials WHERE id = $1 RETURNING id', [id]);
    if (result.rows.length === 0) throw { status: 404, message: 'Témoignage non trouvé' };
    return true;
  }

  // =============================================
  // UTILITY METHODS
  // =============================================

  formatTestimonialWithUser(row) {
    return {
      id:               row.id,
      user_id:          row.user_id,
      rating:           row.rating,
      comment:          row.comment,
      status:           row.status,
      is_featured:      row.is_featured,
      display_name:     row.display_name,
      display_photo:    row.display_photo,
      rejection_reason: row.rejection_reason,
      created_at:       row.created_at,
      updated_at:       row.updated_at,
      // ✅ FIX : photo supprimé (n'existe pas dans users)
      user: row.user_id ? {
        id:         row.user_id,
        first_name: row.first_name,
        last_name:  row.last_name,
        email:      row.email,
        phone:      row.phone         // ← phone (pas photo)
      } : null
    };
  }
}

module.exports = new TestimonialService();