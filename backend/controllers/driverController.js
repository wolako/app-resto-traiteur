// controllers/driverController.js
const Driver   = require('../models/Driver');
const Business = require('../models/Business');
const { pool } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const crypto = require('crypto');

// ─── Générer mot de passe temporaire ────────────────────────
function generateTempPassword() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // ex: A3F9B2C1
}

// ─── Créer un livreur (établissement ou admin) ──────────────
const createDriver = asyncHandler(async (req, res) => {
  const { first_name, last_name, phone, email, vehicle_type, max_concurrent_orders, business_id } = req.body;

  if (!first_name || !last_name || !phone) {
    return res.status(400).json({ success: false, error: 'Nom, prénom et téléphone sont requis' });
  }

  // Déterminer le business_id selon le rôle
  let targetBusinessId = business_id;
  let createdByType = 'admin';

  if (req.user.role !== 'superadmin') {
    // C'est un établissement — il ne peut créer que pour lui-même
    const business = await Business.findByUserId(req.user.id);
    if (!business) return res.status(404).json({ success: false, error: 'Établissement introuvable' });
    targetBusinessId = business.id;
    createdByType = 'establishment';
  }

  // Vérifier unicité du téléphone
  const existing = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existing.rows.length > 0) {
    return res.status(409).json({ success: false, error: 'Ce numéro de téléphone est déjà utilisé' });
  }

  const tempPassword = generateTempPassword();

  const driver = await Driver.create({
    business_id: targetBusinessId,
    created_by_type: createdByType,
    created_by_id: req.user.id,
    first_name, last_name, phone,
    email: email || null,
    vehicle_type: vehicle_type || 'moto',
    max_concurrent_orders: max_concurrent_orders || 3,
    temp_password: tempPassword
  });

  logger.info('Livreur créé', { driverId: driver.id, businessId: targetBusinessId, createdBy: req.user.id });

  // Retourner le mot de passe temporaire (une seule fois)
  res.status(201).json({
    success: true,
    message: 'Livreur créé avec succès',
    data: driver,
    credentials: {
      phone,
      temp_password: tempPassword,
      note: 'Communiquez ces identifiants au livreur. Il devra changer son mot de passe à la première connexion.'
    }
  });
});

// ─── Liste des livreurs d'un établissement ──────────────────
const getBusinessDrivers = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  // Vérifier accès
  if (req.user.role !== 'superadmin') {
    const business = await Business.findByUserId(req.user.id);
    if (!business || business.id != businessId) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }
  }

  const drivers = await Driver.getByBusinessId(businessId);
  res.json({ success: true, data: drivers });
});

// ─── Liste tous les livreurs (admin) ─────────────────────────
const getAllDrivers = asyncHandler(async (req, res) => {
  const drivers = await Driver.getAll();
  res.json({ success: true, data: drivers });
});

// ─── Modifier un livreur ─────────────────────────────────────
const updateDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driver = await Driver.findById(id);

  if (!driver) return res.status(404).json({ success: false, error: 'Livreur introuvable' });

  // Vérifier accès
  if (req.user.role !== 'superadmin') {
    const business = await Business.findByUserId(req.user.id);
    if (!business || business.id !== driver.business_id) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }
  }

  const updated = await Driver.update(id, req.body);
  res.json({ success: true, message: 'Livreur mis à jour', data: updated });
});

// ─── Désactiver un livreur ───────────────────────────────────
const deleteDriver = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const driver = await Driver.findById(id);
  if (!driver) return res.status(404).json({ success: false, error: 'Livreur introuvable' });

  if (req.user.role !== 'superadmin') {
    const business = await Business.findByUserId(req.user.id);
    if (!business || business.id !== driver.business_id) {
      return res.status(403).json({ success: false, error: 'Accès refusé' });
    }
  }

  // Soft delete — désactiver seulement
  await Driver.update(id, { is_active: false });
  await pool.query('UPDATE users SET is_active = false WHERE id = $1', [driver.user_id]);

  res.json({ success: true, message: 'Livreur désactivé' });
});

// ─── Assigner un livreur à une commande ─────────────────────
const assignDriver = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { driver_id } = req.body;

  if (!driver_id) return res.status(400).json({ success: false, error: 'driver_id requis' });

  const clientDb = await pool.connect();
  try {
    await clientDb.query('BEGIN');

    // 1. Lock la commande
    const { rows: [order] } = await clientDb.query(
      `SELECT * FROM orders WHERE id = $1
       AND status IN ('confirmed','preparing','ready')
       FOR UPDATE`,
      [orderId]
    );
    if (!order) {
      await clientDb.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Commande introuvable ou non assignable' });
    }

    // Vérifier accès établissement
    if (req.user.role !== 'superadmin') {
      const business = await Business.findByUserId(req.user.id);
      if (!business || business.id !== order.business_id) {
        await clientDb.query('ROLLBACK');
        return res.status(403).json({ success: false, error: 'Accès refusé' });
      }
    }

    // 2. Vérifier la disponibilité réelle du livreur (via vue)
    const { rows: [driverView] } = await clientDb.query(
      `SELECT * FROM driver_availability WHERE id = $1 FOR UPDATE`,
      [driver_id]
    );
    if (!driverView) {
      await clientDb.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Livreur introuvable' });
    }
    if (driverView.real_status !== 'available') {
      await clientDb.query('ROLLBACK');
      return res.status(409).json({
        success: false,
        error: driverView.real_status === 'offline'
          ? 'Le livreur est hors ligne'
          : driverView.real_status === 'at_capacity'
          ? 'Le livreur a atteint sa capacité maximale'
          : 'Le livreur est indisponible'
      });
    }

    // 3. Supprimer une assignation existante si besoin (réassignation)
    await clientDb.query(
      `DELETE FROM delivery_assignments WHERE order_id = $1`,
      [orderId]
    );

    // 4. Créer l'assignation
    const assignedByType = req.user.role === 'superadmin' ? 'admin' : 'establishment';
    const { rows: [assignment] } = await clientDb.query(
      `INSERT INTO delivery_assignments (order_id, driver_id, assigned_by_type, assigned_by_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [orderId, driver_id, assignedByType, req.user.id]
    );

    // 5. Mettre à jour la commande
    await clientDb.query(
      `UPDATE orders SET
         delivery_status = 'assigned',
         current_assignment_id = $1,
         updated_at = NOW()
       WHERE id = $2`,
      [assignment.id, orderId]
    );

    // 6. Recalculer statut livreur
    await clientDb.query(
      `UPDATE drivers SET
         status = CASE
           WHEN (
             SELECT COUNT(*) FROM delivery_assignments
             WHERE driver_id = $1 AND status IN ('assigned','picked_up')
           ) >= max_concurrent_orders THEN 'at_capacity'
           ELSE status -- garder 'available' si pas encore à capacité
         END,
         updated_at = NOW()
       WHERE id = $1`,
      [driver_id]
    );

    await clientDb.query('COMMIT');

    // 7. Notifier le livreur (notification in-app)
    await pool.query(
      `INSERT INTO notifications (business_id, type, title, message, reference_id, reference_type, priority, metadata)
       VALUES ($1, 'driver_assigned', '📦 Nouvelle livraison', $2, $3, 'order', 'high', $4)`,
      [
        order.business_id,
        `Commande #${orderId} — ${order.delivery_address || 'Adresse non précisée'}`,
        orderId,
        JSON.stringify({ driver_id, order_id: orderId })
      ]
    );

    logger.info('Livreur assigné', { orderId, driverId: driver_id, assignedBy: req.user.id });

    res.json({ success: true, message: 'Livreur assigné avec succès', data: assignment });
  } catch (err) {
    await clientDb.query('ROLLBACK');
    logger.error('Erreur assignation livreur', { error: err.message });
    throw err;
  } finally {
    clientDb.release();
  }
});

// ─── Désassigner (retirer livreur) ────────────────────────────
const unassignDriver = asyncHandler(async (req, res) => {
  const { orderId } = req.params;

  const { rows: [order] } = await pool.query(
    `SELECT * FROM orders WHERE id = $1`, [orderId]
  );
  if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable' });

  if (order.current_assignment_id) {
    const { rows: [assignment] } = await pool.query(
      `SELECT driver_id FROM delivery_assignments WHERE id = $1`,
      [order.current_assignment_id]
    );

    // Supprimer l'assignation
    await pool.query(`DELETE FROM delivery_assignments WHERE id = $1`, [order.current_assignment_id]);

    // Remettre la commande en ready_for_pickup
    await pool.query(
      `UPDATE orders SET delivery_status = 'ready_for_pickup', current_assignment_id = NULL, updated_at = NOW() WHERE id = $1`,
      [orderId]
    );

    // Recalculer statut livreur
    if (assignment) await Driver.recalcStatus(assignment.driver_id);
  }

  res.json({ success: true, message: 'Livreur retiré de la commande' });
});

// ═══════════════════════════════════════════════════════════
// ACTIONS LIVREUR (depuis l'interface livreur)
// ═══════════════════════════════════════════════════════════

// ─── Toggle online/offline ────────────────────────────────
const toggleStatus = asyncHandler(async (req, res) => {
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Profil livreur introuvable' });

  const newStatus = driver.status === 'offline' ? 'available' : 'offline';
  await Driver.updateStatus(driver.id, newStatus);

  // Si passage offline, recalculer (au cas où il était at_capacity)
  if (newStatus === 'offline') {
    await pool.query(
      `UPDATE drivers SET status = 'offline', updated_at = NOW() WHERE id = $1`, [driver.id]
    );
  }

  res.json({ success: true, message: `Statut : ${newStatus}`, data: { status: newStatus } });
});

// ─── Mes commandes actives (livreur) ─────────────────────
const getMyOrders = asyncHandler(async (req, res) => {
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Profil livreur introuvable' });

  // Mettre à jour last_seen
  await pool.query(`UPDATE drivers SET last_seen_at = NOW() WHERE id = $1`, [driver.id]);

  const activeOrders = await Driver.getActiveOrders(driver.id);
  const history = await Driver.getHistory(driver.id, 5);

  res.json({
    success: true,
    data: {
      driver: { ...driver },
      active_orders: activeOrders,
      recent_history: history
    }
  });
});

// ─── Marquer comme récupéré (pickup) ─────────────────────
const pickupOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Profil livreur introuvable' });

  // Vérifier que cette commande lui est bien assignée
  const { rows: [assignment] } = await pool.query(
    `SELECT * FROM delivery_assignments
     WHERE order_id = $1 AND driver_id = $2 AND status = 'assigned'`,
    [orderId, driver.id]
  );
  if (!assignment) {
    return res.status(404).json({ success: false, error: 'Assignation introuvable' });
  }

  // Mettre à jour l'assignation
  await pool.query(
    `UPDATE delivery_assignments SET status = 'picked_up', picked_up_at = NOW() WHERE id = $1`,
    [assignment.id]
  );

  // Mettre à jour la commande
  await pool.query(
    `UPDATE orders SET delivery_status = 'in_transit', updated_at = NOW() WHERE id = $1`,
    [orderId]
  );

  logger.info('Livreur parti livrer', { orderId, driverId: driver.id });
  res.json({ success: true, message: 'Récupération confirmée, livraison en cours' });
});

// ─── Confirmer livraison ──────────────────────────────────
const deliverOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { notes, proof_photo_url } = req.body;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Profil livreur introuvable' });

  const { rows: [assignment] } = await pool.query(
    `SELECT * FROM delivery_assignments
     WHERE order_id = $1 AND driver_id = $2 AND status = 'picked_up'`,
    [orderId, driver.id]
  );
  if (!assignment) {
    return res.status(404).json({ success: false, error: 'Vous n\'avez pas récupéré cette commande' });
  }

  // Finaliser l'assignation
  await pool.query(
    `UPDATE delivery_assignments
     SET status = 'delivered', delivered_at = NOW(), notes = $1, proof_photo_url = $2
     WHERE id = $3`,
    [notes || null, proof_photo_url || null, assignment.id]
  );

  // Mettre à jour commande → delivered
  await pool.query(
    `UPDATE orders SET
       delivery_status = 'delivered',
       status = 'delivered',
       delivery_confirmed = true,
       delivery_confirmed_at = NOW(),
       updated_at = NOW()
     WHERE id = $1`,
    [orderId]
  );

  // Recalculer statut livreur (libérer un slot)
  await Driver.recalcStatus(driver.id);

  // Notifier l'établissement
  const { rows: [order] } = await pool.query(
    `SELECT o.*, b.id AS bid FROM orders o JOIN businesses b ON o.business_id = b.id WHERE o.id = $1`,
    [orderId]
  );
  if (order) {
    await pool.query(
      `INSERT INTO notifications (business_id, type, title, message, reference_id, reference_type, priority)
       VALUES ($1, 'delivery_confirmed', '✅ Livraison confirmée', $2, $3, 'order', 'normal')`,
      [order.bid, `Commande #${orderId} livrée par ${driver.first_name} ${driver.last_name}`, orderId]
    );
  }

  logger.info('Livraison confirmée', { orderId, driverId: driver.id });
  res.json({ success: true, message: 'Livraison confirmée avec succès' });
});

// ─── Signaler un échec ─────────────────────────────────────
const failOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { failure_reason } = req.body;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(404).json({ success: false, error: 'Profil livreur introuvable' });

  if (!failure_reason?.trim()) {
    return res.status(400).json({ success: false, error: 'La raison de l\'échec est requise' });
  }

  const { rows: [assignment] } = await pool.query(
    `SELECT * FROM delivery_assignments
     WHERE order_id = $1 AND driver_id = $2 AND status IN ('assigned','picked_up')`,
    [orderId, driver.id]
  );
  if (!assignment) {
    return res.status(404).json({ success: false, error: 'Assignation introuvable' });
  }

  // Marquer échec
  await pool.query(
    `UPDATE delivery_assignments
     SET status = 'failed', failed_at = NOW(), failure_reason = $1
     WHERE id = $2`,
    [failure_reason, assignment.id]
  );

  // Remettre commande disponible pour réassignation
  await pool.query(
    `UPDATE orders SET
       delivery_status = 'ready_for_pickup',
       current_assignment_id = NULL,
       updated_at = NOW()
     WHERE id = $1`,
    [orderId]
  );

  // Libérer le slot du livreur
  await Driver.recalcStatus(driver.id);

  // Notifier l'établissement
  const { rows: [order] } = await pool.query(
    `SELECT o.business_id FROM orders o WHERE o.id = $1`, [orderId]
  );
  if (order) {
    await pool.query(
      `INSERT INTO notifications (business_id, type, title, message, reference_id, reference_type, priority)
       VALUES ($1, 'delivery_failed', '⚠️ Échec de livraison', $2, $3, 'order', 'high')`,
      [order.business_id, `Commande #${orderId} — ${failure_reason}`, orderId]
    );
  }

  logger.warn('Échec livraison signalé', { orderId, driverId: driver.id, reason: failure_reason });
  res.json({ success: true, message: 'Échec signalé. La commande est disponible pour réassignation.' });
});

// ─── Changer mot de passe (1er login) ────────────────────
const changePassword = asyncHandler(async (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ success: false, error: 'Mot de passe trop court (6 caractères minimum)' });
  }

  const bcrypt = require('bcryptjs');
  const hash = await bcrypt.hash(new_password, 12);

  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [hash, req.user.id]
  );
  // Marquer que le mdp temporaire a été changé
  await pool.query(
    `UPDATE drivers SET temp_password_used = false, updated_at = NOW() WHERE user_id = $1`,
    [req.user.id]
  );

  res.json({ success: true, message: 'Mot de passe mis à jour' });
});

module.exports = {
  createDriver, getBusinessDrivers, getAllDrivers, updateDriver, deleteDriver,
  assignDriver, unassignDriver,
  toggleStatus, getMyOrders, pickupOrder, deliverOrder, failOrder, changePassword
};