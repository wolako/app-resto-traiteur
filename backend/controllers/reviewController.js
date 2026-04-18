const { pool } = require('../config/db');

/**
 * Créer un avis (CLIENT connecté OU INVITÉ)
 * POST /api/reviews
 *
 * Payload client connecté :
 *   { business_id, rating, comment, order_id? }
 *
 * Payload invité :
 *   { business_id, rating, comment, guest_name, guest_phone }
 */
const createReview = async (req, res) => {
  try {
    const { business_id, order_id, rating, comment, guest_name, guest_phone } = req.body;
    const userId = req.user?.id || null; // null si invité

    // ── Validation de base ──────────────────────────────────────
    if (!business_id || !rating) {
      return res.status(400).json({
        success: false,
        error: 'Le business_id et la note sont requis'
      });
    }

    if (rating < 1 || rating > 5) {
      return res.status(400).json({
        success: false,
        error: 'La note doit être entre 1 et 5'
      });
    }

    // ── Validation invité ────────────────────────────────────────
    if (!userId) {
      if (!guest_name || !guest_phone) {
        return res.status(400).json({
          success: false,
          error: 'Les invités doivent fournir un nom et un numéro de téléphone'
        });
      }

      if (!/^[+]?[\d\s\-]{8,15}$/.test(guest_phone)) {
        return res.status(400).json({
          success: false,
          error: 'Numéro de téléphone invalide'
        });
      }

      // ✅ Rate limiting invité : 1 avis par (business, téléphone)
      const guestDuplicate = await pool.query(
        `SELECT id FROM reviews
         WHERE business_id = $1 AND guest_phone = $2`,
        [business_id, guest_phone]
      );
      if (guestDuplicate.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Un avis a déjà été soumis avec ce numéro pour cet établissement'
        });
      }
    }

    // ── Vérification du business ─────────────────────────────────
    const businessCheck = await pool.query(
      'SELECT id FROM businesses WHERE id = $1 AND is_active = true',
      [business_id]
    );
    if (businessCheck.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Établissement introuvable'
      });
    }

    // ── Vérification commande (client seulement) ─────────────────
    if (userId && order_id) {
      const orderCheck = await pool.query(
        'SELECT id FROM orders WHERE id = $1 AND client_id = $2 AND business_id = $3',
        [order_id, userId, business_id]
      );
      if (orderCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Cette commande ne vous appartient pas'
        });
      }
    }

    // ── Anti-doublon client connecté ─────────────────────────────
    if (userId) {
      const existingReview = await pool.query(
        'SELECT id FROM reviews WHERE business_id = $1 AND user_id = $2',
        [business_id, userId]
      );
      if (existingReview.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Vous avez déjà laissé un avis pour cet établissement'
        });
      }
    }

    // ── Insertion ────────────────────────────────────────────────
    const result = await pool.query(
      `INSERT INTO reviews
         (business_id, user_id, order_id, rating, comment, status, guest_name, guest_phone)
       VALUES ($1, $2, $3, $4, $5, 'approved', $6, $7)
       RETURNING *`,
      [
        business_id,
        userId,
        order_id || null,
        rating,
        comment || null,
        userId ? null : guest_name,   // guest_name seulement si invité
        userId ? null : guest_phone   // guest_phone seulement si invité
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Merci pour votre avis !',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erreur création avis:', error);
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        error: 'Un avis existe déjà pour cet établissement'
      });
    }
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * Obtenir les avis d'un business (PUBLIC)
 * GET /api/reviews/business/:businessId
 */
const getBusinessReviews = async (req, res) => {
  try {
    const { businessId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await pool.query(
      `SELECT
        r.id,
        r.rating,
        r.comment,
        r.response,
        r.responded_at,
        r.created_at,
        r.user_id,
        -- ✅ Nom affiché : client connecté ou invité
        CASE
          WHEN r.user_id IS NOT NULL
            THEN COALESCE(u.first_name || ' ' || u.last_name, 'Utilisateur')
          ELSE COALESCE(r.guest_name, 'Invité')
        END AS user_name,
        -- ✅ Badge pour distinguer les avis invités
        CASE WHEN r.user_id IS NULL THEN true ELSE false END AS is_guest
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.business_id = $1 AND r.status = 'approved'
       ORDER BY r.created_at DESC
       LIMIT $2 OFFSET $3`,
      [businessId, parseInt(limit), parseInt(offset)]
    );

    const statsResult = await pool.query(
      `SELECT
        COALESCE(ROUND(AVG(rating)::numeric, 1), 0) as average_rating,
        COUNT(*)                                     as total_reviews,
        COUNT(CASE WHEN rating = 5 THEN 1 END)       as five_stars,
        COUNT(CASE WHEN rating = 4 THEN 1 END)       as four_stars,
        COUNT(CASE WHEN rating = 3 THEN 1 END)       as three_stars,
        COUNT(CASE WHEN rating = 2 THEN 1 END)       as two_stars,
        COUNT(CASE WHEN rating = 1 THEN 1 END)       as one_star
       FROM reviews
       WHERE business_id = $1 AND status = 'approved'`,
      [businessId]
    );

    res.json({
      success: true,
      data: {
        reviews: result.rows,
        stats: statsResult.rows[0],
        pagination: {
          limit:  parseInt(limit),
          offset: parseInt(offset),
          total:  result.rows.length
        }
      }
    });

  } catch (error) {
    console.error('❌ Erreur récupération avis:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * Obtenir les avis du client connecté
 * GET /api/reviews/my-reviews
 */
const getUserReviews = async (req, res) => {
  try {
    const userId = req.user.id;
    const result = await pool.query(
      `SELECT r.*, b.name as business_name, b.type as business_type
       FROM reviews r
       JOIN businesses b ON r.business_id = b.id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('❌ Erreur récupération avis utilisateur:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * Vérifier si le client a déjà noté un business
 * GET /api/reviews/check/:businessId
 */
const checkUserReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { businessId } = req.params;
    const result = await pool.query(
      'SELECT id, rating FROM reviews WHERE business_id = $1 AND user_id = $2',
      [businessId, userId]
    );
    res.json({
      success: true,
      hasReviewed: result.rows.length > 0,
      review: result.rows[0] || null
    });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * Mettre à jour un avis (CLIENT uniquement)
 * PUT /api/reviews/:id
 */
const updateReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { rating, comment } = req.body;

    const reviewCheck = await pool.query(
      'SELECT * FROM reviews WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Avis introuvable' });
    }

    if (rating && (rating < 1 || rating > 5)) {
      return res.status(400).json({ success: false, error: 'La note doit être entre 1 et 5' });
    }

    const result = await pool.query(
      `UPDATE reviews
       SET rating = COALESCE($1, rating),
           comment = COALESCE($2, comment),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND user_id = $4
       RETURNING *`,
      [rating || null, comment !== undefined ? comment : null, id, userId]
    );

    res.json({ success: true, message: 'Avis mis à jour', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * Supprimer un avis (CLIENT uniquement)
 * DELETE /api/reviews/:id
 */
const deleteReview = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Avis introuvable' });
    }
    res.json({ success: true, message: 'Avis supprimé' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * Répondre à un avis (RESTAURANT ou TRAITEUR)
 * PUT /api/reviews/:id/respond
 */
const respondToReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { response } = req.body;
    const userId = req.user.id;

    if (!response || !response.trim()) {
      return res.status(400).json({ success: false, error: 'La réponse est requise' });
    }

    const businessResult = await pool.query(
      'SELECT id FROM businesses WHERE user_id = $1 AND is_active = true LIMIT 1',
      [userId]
    );
    if (businessResult.rows.length === 0) {
      return res.status(403).json({ success: false, error: 'Aucun établissement trouvé' });
    }

    const businessId = businessResult.rows[0].id;

    const reviewCheck = await pool.query(
      'SELECT * FROM reviews WHERE id = $1 AND business_id = $2',
      [id, businessId]
    );
    if (reviewCheck.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Avis introuvable' });
    }

    const result = await pool.query(
      `UPDATE reviews
       SET response = $1, responded_at = CURRENT_TIMESTAMP
       WHERE id = $2 AND business_id = $3
       RETURNING *`,
      [response.trim(), id, businessId]
    );

    res.json({ success: true, message: 'Réponse publiée', data: result.rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

module.exports = {
  createReview,
  getBusinessReviews,
  getUserReviews,
  checkUserReview,
  updateReview,
  deleteReview,
  respondToReview
};