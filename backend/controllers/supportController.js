const { pool } = require('../config/db');

/**
 * ✅ Helper central : récupère le business_id depuis req.user.id
 * Remplace req.business?.id (jamais défini par le middleware auth)
 */
async function getBusinessIdFromUser(userId) {
  const result = await pool.query(
    'SELECT id FROM businesses WHERE user_id = $1 AND is_active = true LIMIT 1',
    [userId]
  );
  return result.rows[0]?.id || null;
}

/**
 * Helper : abonnement actif du business
 */
async function getBusinessSubscription(businessId) {
  try {
    const result = await pool.query(
      `SELECT bs.*, sp.priority_support, sp.name as plan_name
       FROM business_subscriptions bs
       JOIN subscription_plans sp ON bs.plan_id = sp.id
       WHERE bs.business_id = $1 AND bs.status = 'active'
       ORDER BY bs.created_at DESC
       LIMIT 1`,
      [businessId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Erreur getBusinessSubscription:', error);
    return null;
  }
}

/**
 * Créer un ticket de support
 * POST /api/support
 */
const createTicket = async (req, res) => {
  try {
    const { subject, message } = req.body;

    // ✅ CORRIGÉ : lookup via user_id
    const businessId = await getBusinessIdFromUser(req.user.id);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        error: 'Aucun établissement trouvé pour cet utilisateur'
      });
    }

    if (!subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'Le sujet et le message sont requis'
      });
    }

    if (subject.length > 255) {
      return res.status(400).json({
        success: false,
        error: 'Le sujet ne peut pas dépasser 255 caractères'
      });
    }

    const subscription = await getBusinessSubscription(businessId);
    const isPremium = subscription?.priority_support === true;
    const priority = isPremium ? 'high' : 'normal';

    // Insertion avec fallback si colonne is_premium absente
    let result;
    try {
      result = await pool.query(
        `INSERT INTO support_tickets (business_id, subject, message, priority, is_premium)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [businessId, subject, message, priority, isPremium]
      );
    } catch (insertError) {
      if (insertError.code === '42703') {
        result = await pool.query(
          `INSERT INTO support_tickets (business_id, subject, message, priority)
           VALUES ($1, $2, $3, $4)
           RETURNING *`,
          [businessId, subject, message, priority]
        );
      } else {
        throw insertError;
      }
    }

    res.status(201).json({
      success: true,
      message: isPremium
        ? '🌟 Ticket prioritaire créé ! Réponse garantie sous 2 heures.'
        : 'Ticket créé ! Nous vous répondrons sous 24-48h.',
      data: result.rows[0]
    });

  } catch (error) {
    console.error('❌ Erreur création ticket:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la création du ticket' });
  }
};

/**
 * Obtenir les tickets du business connecté
 * GET /api/support/my-tickets
 */
const getBusinessTickets = async (req, res) => {
  try {
    // ✅ CORRIGÉ
    const businessId = await getBusinessIdFromUser(req.user.id);

    if (!businessId) {
      return res.status(403).json({
        success: false,
        error: 'Aucun établissement trouvé pour cet utilisateur'
      });
    }

    const result = await pool.query(
      `SELECT * FROM support_tickets
       WHERE business_id = $1
       ORDER BY created_at DESC`,
      [businessId]
    );

    res.json({ success: true, data: result.rows });

  } catch (error) {
    console.error('❌ Erreur récupération tickets:', error);
    res.status(500).json({ success: false, error: 'Erreur lors de la récupération des tickets' });
  }
};

/**
 * Obtenir un ticket par ID
 * GET /api/support/tickets/:id
 */
const getTicketById = async (req, res) => {
  try {
    const { id } = req.params;
    const isAdmin = req.user?.role === 'superadmin';

    let result;

    if (isAdmin) {
      result = await pool.query(
        `SELECT st.*, b.name as business_name, b.type as business_type
         FROM support_tickets st
         JOIN businesses b ON st.business_id = b.id
         WHERE st.id = $1`,
        [id]
      );
    } else {
      // ✅ CORRIGÉ
      const businessId = await getBusinessIdFromUser(req.user.id);
      if (!businessId) {
        return res.status(403).json({ success: false, error: 'Établissement introuvable' });
      }
      result = await pool.query(
        'SELECT * FROM support_tickets WHERE id = $1 AND business_id = $2',
        [id, businessId]
      );
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket introuvable' });
    }

    res.json({ success: true, data: result.rows[0] });

  } catch (error) {
    console.error('❌ Erreur récupération ticket:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * ADMIN : Obtenir tous les tickets
 * GET /api/support/all
 */
const getAllTickets = async (req, res) => {
  try {
    const { status } = req.query;

    let query = `
      SELECT st.*, b.name as business_name, b.type as business_type
      FROM support_tickets st
      JOIN businesses b ON st.business_id = b.id
      WHERE 1=1
    `;

    const params = [];

    if (status && status !== 'all') {
      params.push(status);
      query += ` AND st.status = $${params.length}`;
    } else {
      query += ` AND st.status != 'closed'`;
    }

    query += `
      ORDER BY
        COALESCE(st.priority = 'high', false) DESC,
        st.created_at ASC
      LIMIT 100
    `;

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows, count: result.rows.length });

  } catch (error) {
    console.error('❌ Erreur récupération tickets admin:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * ADMIN : Répondre à un ticket
 * PUT /api/support/tickets/:id/respond
 */
const respondToTicket = async (req, res) => {
  try {
    const { id } = req.params;
    const { response, status } = req.body;

    if (!response) {
      return res.status(400).json({ success: false, error: 'Une réponse est requise' });
    }

    const newStatus = status || 'resolved';

    let result;
    try {
      result = await pool.query(
        `UPDATE support_tickets
         SET response = $1, responded_at = CURRENT_TIMESTAMP, status = $2, assigned_to = $3
         WHERE id = $4
         RETURNING *`,
        [response, newStatus, req.user.id, id]
      );
    } catch (updateError) {
      if (updateError.code === '42703') {
        result = await pool.query(
          `UPDATE support_tickets
           SET response = $1, responded_at = CURRENT_TIMESTAMP, status = $2
           WHERE id = $3
           RETURNING *`,
          [response, newStatus, id]
        );
      } else {
        throw updateError;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket introuvable' });
    }

    res.json({ success: true, message: 'Réponse envoyée', data: result.rows[0] });

  } catch (error) {
    console.error('❌ Erreur réponse ticket:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

/**
 * ADMIN : Mettre à jour le statut
 * PUT /api/support/tickets/:id/status
 */
const updateTicketStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Statut invalide. Valeurs acceptées: ' + validStatuses.join(', ')
      });
    }

    const result = await pool.query(
      'UPDATE support_tickets SET status = $1 WHERE id = $2 RETURNING *',
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Ticket introuvable' });
    }

    res.json({ success: true, message: 'Statut mis à jour', data: result.rows[0] });

  } catch (error) {
    console.error('❌ Erreur mise à jour statut:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

module.exports = {
  createTicket,
  getBusinessTickets,
  getTicketById,
  getAllTickets,
  respondToTicket,
  updateTicketStatus
};