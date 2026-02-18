const Commission = require('../models/Commission');
const Subscription = require('../models/Subscription');
const AppSetting = require('../models/AppSetting');
const pool = require('../config/db');

// Créer une commission (appelé automatiquement après une commande)
exports.createCommission = async (orderId, specialOrderId, businessId, orderAmount) => {
  try {
    const subscription = await Subscription.getByBusinessId(businessId);
    let commissionRate;

    if (subscription && subscription.commission_rate !== null) {
      commissionRate = subscription.commission_rate;
    } else {
      commissionRate = await AppSetting.getValue('default_commission_rate') || 5.0;
    }

    const commissionAmount = (orderAmount * commissionRate) / 100;

    const commission = await Commission.create({
      order_id: orderId,
      special_order_id: specialOrderId,
      business_id: businessId,
      order_amount: orderAmount,
      commission_rate: commissionRate,
      commission_amount: commissionAmount
    });

    return commission;
  } catch (error) {
    console.error('Erreur création commission:', error);
    throw error;
  }
};

// ✅ Helper interne : retrouver le business_id depuis req.user.id
async function _getBusinessIdForUser(userId) {
  const result = await pool.query(
    'SELECT id FROM businesses WHERE user_id = $1 LIMIT 1',
    [userId]
  );
  if (!result.rows.length) throw new Error('Aucun établissement trouvé pour cet utilisateur');
  return result.rows[0].id;
}

// Obtenir les commissions du business connecté (route GET /)
exports.getBusinessCommissions = async (req, res) => {
  try {
    // ✅ CORRIGÉ : business_id n'est pas sur req.user, on le résout via user_id
    const businessId = await _getBusinessIdForUser(req.user.id);
    const { status } = req.query;

    const commissions = await Commission.getByBusinessId(businessId, status);
    const totals    = await Commission.getTotalByBusiness(businessId);

    res.json({ commissions, totals });
  } catch (error) {
    console.error('Erreur récupération commissions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// ✅ NOUVEAU : route GET /business/:businessId utilisée par le frontend dashboard
exports.getCommissionsByBusinessId = async (req, res) => {
  try {
    const { businessId } = req.params;
    const requestedId = parseInt(businessId, 10);

    // Sécurité : un non-admin ne peut voir que son propre business
    if (req.user.role !== 'SUPER_ADMIN') {
      const ownBusinessId = await _getBusinessIdForUser(req.user.id);
      if (ownBusinessId !== requestedId) {
        return res.status(403).json({ error: 'Accès refusé' });
      }
    }

    const { status } = req.query;
    const commissions = await Commission.getByBusinessId(requestedId, status);
    const totals      = await Commission.getTotalByBusiness(requestedId);

    // ✅ Calcul des stats détaillées pour le widget frontend (en nombres, pas strings)
    const stats = {
      total_pending:   parseFloat(totals.pending_amount || 0),
      total_collected: parseFloat(totals.collected_amount || 0),
      total_paid:      parseFloat(totals.paid_amount || 0),
      count:           parseInt(totals.total_count, 10) || 0,
    };

    res.json({ commissions, totals, stats });
  } catch (error) {
    console.error('Erreur récupération commissions business:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Obtenir toutes les commissions
exports.getAllCommissions = async (req, res) => {
  try {
    const { status, business_id, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let query = `
      SELECT c.*,
             b.name as business_name,
             o.id   as order_number,
             so.event_type as special_order_type
      FROM commissions c
      JOIN businesses b ON c.business_id = b.id
      LEFT JOIN orders o ON c.order_id = o.id
      LEFT JOIN special_orders so ON c.special_order_id = so.id
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (status) {
      query += ` AND c.status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (business_id) {
      query += ` AND c.business_id = $${paramCount}`;
      params.push(business_id);
      paramCount++;
    }

    query += ` ORDER BY c.created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    let countQuery = 'SELECT COUNT(*) FROM commissions WHERE 1=1';
    const countParams = [];
    let countParamCount = 1;

    if (status) {
      countQuery += ` AND status = $${countParamCount}`;
      countParams.push(status);
      countParamCount++;
    }

    if (business_id) {
      countQuery += ` AND business_id = $${countParamCount}`;
      countParams.push(business_id);
    }

    const countResult = await pool.query(countQuery, countParams);

    res.json({
      commissions: result.rows,
      total:       parseInt(countResult.rows[0].count),
      page:        parseInt(page),
      limit:       parseInt(limit)
    });
  } catch (error) {
    console.error('Erreur liste commissions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Marquer une commission comme collectée
exports.markAsCollected = async (req, res) => {
  try {
    const { id } = req.params;
    const commission = await Commission.updateStatus(id, 'collected');

    if (!commission) {
      return res.status(404).json({ error: 'Commission non trouvée' });
    }

    res.json(commission);
  } catch (error) {
    console.error('Erreur mise à jour commission:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Marquer une commission comme payée
exports.markAsPaid = async (req, res) => {
  try {
    const { id } = req.params;
    const commission = await Commission.updateStatus(id, 'paid');

    if (!commission) {
      return res.status(404).json({ error: 'Commission non trouvée' });
    }

    res.json(commission);
  } catch (error) {
    console.error('Erreur mise à jour commission:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Admin: Statistiques des commissions
exports.getCommissionStats = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        COUNT(*)                                                                    as total_commissions,
        COALESCE(SUM(commission_amount), 0)                                         as total_amount,
        COALESCE(SUM(CASE WHEN status = 'pending'   THEN commission_amount ELSE 0 END), 0) as pending_amount,
        COALESCE(SUM(CASE WHEN status = 'collected' THEN commission_amount ELSE 0 END), 0) as collected_amount,
        COALESCE(SUM(CASE WHEN status = 'paid'      THEN commission_amount ELSE 0 END), 0) as paid_amount,
        COUNT(CASE WHEN status = 'pending'   THEN 1 END) as pending_count,
        COUNT(CASE WHEN status = 'collected' THEN 1 END) as collected_count,
        COUNT(CASE WHEN status = 'paid'      THEN 1 END) as paid_count
      FROM commissions
    `);

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Erreur stats commissions:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};