// controllers/driverController.js
const Driver   = require('../models/Driver');
const Business = require('../models/Business');
const { pool } = require('../config/db');
const { asyncHandler } = require('../middleware/errorHandler');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const crypto = require('crypto');
const { notifyDriver, notifyBusiness, notifyClient } = require('../utils/socketEmit');
const { sendPushToUser } = require('../utils/webPush');

// ─── Générer mot de passe temporaire ────────────────────────
function generateTempPassword() {
  return crypto.randomBytes(4).toString('hex').toUpperCase(); // ex: A3F9B2C1
}

// ─── Créer un livreur (admin peut créer sans établissement) ──
const createDriver = asyncHandler(async (req, res) => {
  const {
    first_name, last_name, phone, email,
    vehicle_type, max_concurrent_orders, business_id,
    password: customPassword,
    district
  } = req.body;

  // ✅ Email maintenant requis
  if (!first_name || !last_name || !phone || !email) {
    return res.status(400).json({
      success: false,
      error: 'Nom, prénom, téléphone et email sont requis'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ success: false, error: 'Email invalide' });
  }

  let targetBusinessId = null;
  let createdByType    = 'admin';

  if (req.user.role !== 'superadmin') {
    const business = await Business.findByUserId(req.user.id);
    if (!business) return res.status(404).json({ success: false, error: 'Établissement introuvable' });
    targetBusinessId = business.id;
    createdByType    = 'establishment';
  } else {
    targetBusinessId = business_id || null;
  }

  const existingPhone = await pool.query('SELECT id FROM users WHERE phone = $1', [phone]);
  if (existingPhone.rows.length > 0) {
    return res.status(409).json({ success: false, error: 'Ce numéro de téléphone est déjà utilisé' });
  }

  // ✅ Vérifier aussi l'unicité de l'email
  const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (existingEmail.rows.length > 0) {
    return res.status(409).json({ success: false, error: 'Cet email est déjà utilisé' });
  }

  const tempPassword = (customPassword && customPassword.trim().length >= 6)
    ? customPassword.trim()
    : generateTempPassword();

  const driver = await Driver.create({
    business_id: targetBusinessId,
    created_by_type: createdByType,
    created_by_id: req.user.id,
    first_name, last_name, phone,
    email,
    vehicle_type: vehicle_type || 'moto',
    max_concurrent_orders: max_concurrent_orders || 3,
    temp_password: tempPassword,
    district: district || null
  });

  logger.info('Livreur créé', { driverId: driver.id, businessId: targetBusinessId });

  res.status(201).json({
    success: true,
    message: `Livreur${!targetBusinessId ? ' plateforme' : ''} créé avec succès`,
    data: driver,
    credentials: {
      phone, email, temp_password: tempPassword, login_url: '/driver/login',
      is_platform_driver: !targetBusinessId,
      note: 'Communiquez ces identifiants au livreur. Il pourra réinitialiser son mot de passe via son email en cas d\'oubli.'
    }
  });
});

// ─── Suppression définitive d'un livreur ─────────────────────
const deleteDriverPermanently = asyncHandler(async (req, res) => {
  const { driverId } = req.params;

  const driver = await Driver.findById(driverId);
  if (!driver) return res.status(404).json({ success: false, error: 'Livreur introuvable' });

  // Vérification des droits
  if (req.user.role !== 'superadmin') {
    const business = await Business.findByUserId(req.user.id);
    // Un établissement ne peut supprimer que SES livreurs (pas les livreurs plateforme)
    if (!business || business.id !== driver.business_id) {
      return res.status(403).json({
        success: false,
        error: 'Non autorisé. Vous ne pouvez supprimer que vos propres livreurs.'
      });
    }
  }

  await Driver.deleteForever(driverId);

  logger.info('Livreur supprimé définitivement', { driverId, userId: req.user.id });

  res.json({ success: true, message: 'Livreur supprimé définitivement' });
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

const toggleDriverActive = asyncHandler(async (req, res) => {
  const { driverId } = req.params;

  // Vérifier les droits : admin ou établissement propriétaire
  const driver = await Driver.findById(driverId);
  if (!driver) {
    return res.status(404).json({ success: false, error: 'Livreur introuvable' });
  }

  if (req.user.role !== 'superadmin') {
    const business = await Business.findByUserId(req.user.id);
    if (!business || business.id !== driver.business_id) {
      return res.status(403).json({ success: false, error: 'Non autorisé' });
    }
  }

  const newIsActive = !driver.is_active;

  // Mettre à jour le profil livreur ET le compte utilisateur
  await pool.query(
    `UPDATE drivers SET is_active = $1, updated_at = NOW() WHERE id = $2`,
    [newIsActive, driverId]
  );
  await pool.query(
    `UPDATE users SET is_active = $1, updated_at = NOW() WHERE id = $2`,
    [newIsActive, driver.user_id]
  );

  // Si désactivé, mettre le statut à offline
  if (!newIsActive) {
    await pool.query(
      `UPDATE drivers SET status = 'offline', updated_at = NOW() WHERE id = $1`,
      [driverId]
    );
  }

  logger.info(`Livreur ${newIsActive ? 'réactivé' : 'désactivé'}`, {
    driverId, userId: req.user.id
  });

  res.json({
    success: true,
    message: `Livreur ${newIsActive ? 'réactivé' : 'désactivé'} avec succès`,
    data: { id: parseInt(driverId), is_active: newIsActive }
  });
});

// ─── Assigner un livreur à une commande ─────────────────────
const assignDriver = asyncHandler(async (req, res) => {
  const { orderId }  = req.params;
  const { driver_id } = req.body;

  if (!driver_id) {
    return res.status(400).json({ success: false, error: 'driver_id requis' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ✅ FIX CRITIQUE : FOR UPDATE uniquement sur la ligne driver (sans GROUP BY ni JOIN)
    const lockResult = await client.query(
      `SELECT id, status, is_active, max_concurrent_orders
       FROM drivers
       WHERE id = $1 AND is_active = true
       FOR UPDATE`,
      [driver_id]
    );

    if (lockResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Livreur introuvable ou inactif' });
    }

    const driver = lockResult.rows[0];

    if (driver.status === 'offline') {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'Le livreur est hors ligne' });
    }

    // ✅ Comptage séparé — jamais de FOR UPDATE avec GROUP BY
    const countResult = await client.query(
      `SELECT COUNT(*) AS count
       FROM delivery_assignments
       WHERE driver_id = $1 AND status IN ('assigned','picked_up')`,
      [driver_id]
    );
    const activeCount = parseInt(countResult.rows[0].count);

    if (activeCount >= driver.max_concurrent_orders) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: `Livreur à capacité maximale (${driver.max_concurrent_orders} commandes actives)`
      });
    }

    // Vérifier et verrouiller la commande
    const orderResult = await client.query(
      `SELECT id, business_id, status, delivery_status, current_assignment_id
       FROM orders WHERE id = $1 FOR UPDATE`,
      [orderId]
    );

    if (orderResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Commande introuvable' });
    }

    const order = orderResult.rows[0];

    // Bloquer si le client n'a pas demandé la livraison
    if (order.delivery_status === 'pending' && !order.delivery_address) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Cette commande ne nécessite pas de livraison (commande à emporter)'
      });
    }

    // Annuler l'ancienne assignation si elle existe
    if (order.current_assignment_id) {
      await client.query(
        `UPDATE delivery_assignments
         SET status = 'failed', failed_at = NOW(),
             failure_reason = 'Réassigné à un autre livreur'
         WHERE id = $1 AND status NOT IN ('delivered','failed')`,
        [order.current_assignment_id]
      );
    }

    // Créer / remplacer l'assignation
    const assignedByType = req.user.role === 'superadmin' ? 'admin' : 'establishment';
    const assignmentResult = await client.query(
      `INSERT INTO delivery_assignments
         (order_id, driver_id, assigned_by_type, assigned_by_id, status, assigned_at)
       VALUES ($1, $2, $3, $4, 'assigned', NOW())
       ON CONFLICT (order_id) DO UPDATE
         SET driver_id        = EXCLUDED.driver_id,
             assigned_by_type = EXCLUDED.assigned_by_type,
             assigned_by_id   = EXCLUDED.assigned_by_id,
             status           = 'assigned',
             assigned_at      = NOW(),
             failed_at        = NULL,
             failure_reason   = NULL
       RETURNING *`,
      [orderId, driver_id, assignedByType, req.user.id]
    );
    const assignment = assignmentResult.rows[0];

    // Mettre à jour le statut livraison de la commande
    await client.query(
      `UPDATE orders
       SET delivery_status = 'assigned', current_assignment_id = $1, updated_at = NOW()
       WHERE id = $2`,
      [assignment.id, orderId]
    );

    // Recalculer le statut du livreur
    const newActive  = activeCount + 1;
    const newStatus  = newActive >= driver.max_concurrent_orders ? 'at_capacity' : 'available';
    await client.query(
      `UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2`,
      [newStatus, driver_id]
    );

    await client.query('COMMIT');

    // Infos du livreur pour la réponse
    const driverInfo = await pool.query(
      `SELECT d.id, d.vehicle_type, d.status, u.first_name, u.last_name, u.phone
       FROM drivers d JOIN users u ON d.user_id = u.id WHERE d.id = $1`,
      [driver_id]
    );

    logger.info('Livreur assigné', { orderId, driverId: driver_id, by: req.user.id });

    const io = req.app.get('io');   // récupère l'instance existante
    notifyDriver(io, driver_id, 'new_assignment', {
      order_id: parseInt(orderId),
      assigned_at: assignment.assigned_at
    });
    notifyBusiness(io, order.business_id, 'order_updated', {
      orderId: parseInt(orderId),
      delivery_status: 'assigned',
      current_assignment_id: assignment.id
    });

    const driverUserResult = await pool.query('SELECT user_id FROM drivers WHERE id = $1', [driver_id]);
      if (driverUserResult.rows[0]) {
        console.log('[AssignDriver] Déclenchement push vers user_id', driverUserResult.rows[0].user_id);
        sendPushToUser(pool, driverUserResult.rows[0].user_id, {
          title: '🆕 Nouvelle commande !',
          body: `Commande ${orderId} vous a été assignée — touchez pour ouvrir`,
          url: '/driver/dashboard'
        }).catch(err => console.error('[AssignDriver] ❌ sendPushToUser a levé une erreur:', err));
      } else {
        console.warn('[AssignDriver] ⚠️ Aucun user_id trouvé pour driver_id', driver_id);
      }
    res.json({
      success: true,
      message: 'Livreur assigné avec succès',
      data: { assignment, driver: driverInfo.rows[0] }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    logger.error('Erreur assignation:', err.message);
    throw err;
  } finally {
    client.release();
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

  await pool.query(`UPDATE drivers SET last_seen_at = NOW() WHERE id = $1`, [driver.id]);

  // ✅ Récupérer les stats temps réel depuis la vue driver_availability
  const statsResult = await pool.query(
    `SELECT active_orders_count, remaining_slots, real_status
     FROM driver_availability WHERE id = $1`,
    [driver.id]
  );

  const stats = statsResult.rows[0] || { active_orders_count: 0, remaining_slots: driver.max_concurrent_orders, real_status: driver.status };

  const activeOrders = await Driver.getActiveOrders(driver.id);
  const history = await Driver.getHistory(driver.id, 5);

  res.json({
    success: true,
    data: {
      driver: {
        ...driver,
        active_orders_count: parseInt(stats.active_orders_count) || 0,  // ✅ depuis la vue
        remaining_slots:     parseInt(stats.remaining_slots) || driver.max_concurrent_orders,
        real_status:         stats.real_status || driver.status
      },
      active_orders: activeOrders,
      recent_history: history
    }
  });
});

// ── Accepter la commande (nouveau) ───────────────────────────
const acceptOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(403).json({ success: false, error: 'Profil livreur introuvable' });

  const result = await pool.query(
    `UPDATE delivery_assignments
     SET accepted_at = NOW(), updated_at = NOW()
     WHERE order_id = $1 AND driver_id = $2
       AND status = 'assigned' AND accepted_at IS NULL
     RETURNING *`,
    [orderId, driver.id]
  );

  if (result.rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Assignation introuvable ou déjà acceptée' });
  }

  // ✅ Persister sur la commande pour que l'établissement le voie (même après refresh)
  const orderResult = await pool.query(
    `UPDATE orders SET driver_accepted_at = NOW(), updated_at = NOW()
     WHERE id = $1 RETURNING business_id`,
    [orderId]
  );

  // ✅ Notifier l'établissement en temps réel
  const io = req.app.get('io');
  if (orderResult.rows[0]) {
    notifyBusiness(io, orderResult.rows[0].business_id, 'order_updated', {
      orderId: parseInt(orderId),
      driver_accepted_at: result.rows[0].accepted_at
    });
  }

  logger.info('Commande acceptée par livreur', { orderId, driverId: driver.id });

  res.json({
    success: true,
    message: 'Commande acceptée',
    data: { orderId: parseInt(orderId), accepted_at: result.rows[0].accepted_at }
  });
});

const refuseOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { reason } = req.body;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(403).json({ success: false, error: 'Profil livreur introuvable' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Vérifier que la commande est bien assignée à ce livreur et pas encore acceptée
    const assignResult = await client.query(
      `UPDATE delivery_assignments
       SET status = 'failed', failed_at = NOW(),
           failure_reason = $1, updated_at = NOW()
       WHERE order_id = $2 AND driver_id = $3
         AND status = 'assigned' AND accepted_at IS NULL
       RETURNING *`,
      [reason || 'Refusé par le livreur', orderId, driver.id]
    );

    if (assignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Assignation introuvable, déjà acceptée ou déjà refusée'
      });
    }

    // Remettre la commande disponible pour réassignation
    const orderResult = await client.query(
      `UPDATE orders
       SET delivery_status = 'ready_for_pickup',
           current_assignment_id = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING business_id, client_name`,
      [orderId]
    );

    await Driver.recalcStatus(driver.id);
    await client.query('COMMIT');

    // Notifier l'établissement
    if (orderResult.rows[0]) {
      await notificationService.createNotification({
        business_id:    orderResult.rows[0].business_id,
        type:           'delivery_failed',
        title:          '❌ Commande refusée par le livreur',
        message:        `${driver.first_name} ${driver.last_name} a refusé la commande ${orderId}. Veuillez assigner un autre livreur.`,
        priority:       'urgent',
        reference_id:   parseInt(orderId),
        reference_type: 'order',
        metadata:       { order_id: orderId, driver_id: driver.id, reason: reason || 'Refusé par le livreur' }
      });

      const io = req.app.get('io');
      notifyBusiness(io, orderResult.rows[0].business_id, 'order_updated', {
        orderId: parseInt(orderId),
        delivery_status: 'ready_for_pickup',
        current_assignment_id: null
      });
    }

    logger.info('Commande refusée par livreur', { orderId, driverId: driver.id, reason });

    res.json({
      success: true,
      message: 'Commande refusée — l\'établissement a été notifié',
      data: { orderId: parseInt(orderId) }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── Récupérer la commande ─────────────────────────────────────
const pickupOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(403).json({ success: false, error: 'Profil livreur introuvable' });

  // 1. Mettre à jour l'assignation
  const assignResult = await pool.query(
    `UPDATE delivery_assignments
     SET status = 'picked_up', picked_up_at = NOW(), updated_at = NOW()
     WHERE order_id = $1 AND driver_id = $2 AND status = 'assigned'
     RETURNING *`,
    [orderId, driver.id]
  );

  if (assignResult.rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Assignation introuvable ou déjà récupérée' });
  }

  // 2. ✅ Mettre à jour delivery_status → 'in_transit'
  await pool.query(
    `UPDATE orders
     SET delivery_status = 'in_transit', updated_at = NOW()
     WHERE id = $1`,
    [orderId]
  );

  // 3. ✅ Notifier l'établissement
  const orderInfo = await pool.query(
    `SELECT o.business_id, o.client_name FROM orders o WHERE o.id = $1`,
    [orderId]
  );

  if (orderInfo.rows[0]) {
    await notificationService.createNotification({
      business_id:    orderInfo.rows[0].business_id,
      type:           'driver_picked_up',
      title:          '🚀 Commande en route',
      message:        `${driver.first_name} ${driver.last_name} a récupéré la commande #${orderId} (${orderInfo.rows[0].client_name}) et part livrer`,
      priority:       'normal',
      reference_id:   parseInt(orderId),
      reference_type: 'order',
      metadata:       { order_id: orderId, driver_id: driver.id }
    });
  }

  logger.info('Commande récupérée par livreur', { orderId, driverId: driver.id });

  const io = req.app.get('io');
  notifyBusiness(io, orderInfo.rows[0].business_id, 'order_updated', {
    orderId: parseInt(orderId),
    delivery_status: 'in_transit'
  });

  res.json({
    success: true,
    message: 'Commande récupérée — vous êtes en route !',
    data: { orderId: parseInt(orderId), delivery_status: 'in_transit' }
  });
});

// ── Confirmer la livraison ────────────────────────────────────
const deliverOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(403).json({ success: false, error: 'Profil livreur introuvable' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Clôturer l'assignation
    const assignResult = await client.query(
      `UPDATE delivery_assignments
       SET status = 'delivered', delivered_at = NOW(), updated_at = NOW()
       WHERE order_id = $1 AND driver_id = $2 AND status = 'picked_up'
       RETURNING *`,
      [orderId, driver.id]
    );

    if (assignResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'La commande n\'est pas en cours de livraison' });
    }

    // 2. ✅ Mettre à jour order.delivery_status ET order.status
    const orderResult = await client.query(
      `UPDATE orders
       SET delivery_status = 'delivered',
           status = 'delivered',
           updated_at = NOW()
       WHERE id = $1
       RETURNING *, (SELECT id FROM users WHERE id = client_id) as client_id_check`,
      [orderId]
    );

    const order = orderResult.rows[0];

    // 3. Recalculer statut livreur
    await Driver.recalcStatus(driver.id);

    await client.query('COMMIT');

    // 4. ✅ Notifier l'établissement
    await notificationService.createNotification({
      business_id:    order.business_id,
      type:           'delivery_confirmed',
      title:          '✅ Commande livrée',
      message:        `La commande ${orderId} (${order.client_name}) a été livrée par ${driver.first_name} ${driver.last_name}`,
      priority:       'high',
      reference_id:   parseInt(orderId),
      reference_type: 'order',
      metadata:       { order_id: orderId, driver_id: driver.id }
    });

    // 5. ✅ Notifier le client s'il est connecté
    if (order.client_id) {
      const ClientNotification = require('../models/ClientNotification');
      await ClientNotification.create({
        user_id:        order.client_id,
        type:           'order_delivered',
        title:          '📦 Commande livrée !',
        message:        `Votre commande ${orderId} a été livrée. Confirmez la réception dans votre espace client.`,
        reference_id:   parseInt(orderId),
        reference_type: 'order',
        priority:       'high',
        metadata:       { order_id: orderId }
      });
    }

    logger.info('Commande livrée', { orderId, driverId: driver.id });

    const io = req.app.get('io');
    notifyBusiness(io, order.business_id, 'order_updated', {
      orderId: parseInt(orderId),
      delivery_status: 'delivered',
      status: 'delivered'
    });
    if (order.client_id) {
      notifyClient(io, order.client_id, 'order_updated', {
        orderId: parseInt(orderId),
        delivery_status: 'delivered',
        status: 'delivered'
      });
    }
    
    res.json({
      success: true,
      message: 'Livraison confirmée avec succès !',
      data: { orderId: parseInt(orderId), status: 'delivered', delivery_status: 'delivered' }
    });

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
});

// ── Signaler un problème ──────────────────────────────────────
const failOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  // ✅ Accepter les deux noms de champ pour compatibilité
  const reason = req.body.reason || req.body.failure_reason;
  const driver = await Driver.findByUserId(req.user.id);
  if (!driver) return res.status(403).json({ success: false, error: 'Profil livreur introuvable' });

  if (!reason?.trim()) {
    return res.status(400).json({ success: false, error: 'La raison est requise' });
  }

  const assignResult = await pool.query(
    `UPDATE delivery_assignments
     SET status = 'failed', failed_at = NOW(), failure_reason = $1, updated_at = NOW()
     WHERE order_id = $2 AND driver_id = $3 AND status IN ('assigned','picked_up')
     RETURNING *`,
    [reason, orderId, driver.id]
  );

  if (assignResult.rows.length === 0) {
    return res.status(400).json({ success: false, error: 'Assignation introuvable' });
  }

  const orderResult = await pool.query(
    `UPDATE orders
     SET delivery_status = 'failed', 
     current_assignment_id = NULL,
     last_delivery_failure_reason = $1, 
     updated_at = NOW()
     WHERE id = $2
     RETURNING business_id, client_name`,
    [reason, orderId]
  );

  await Driver.recalcStatus(driver.id);

  if (orderResult.rows[0]) {
    await notificationService.createNotification({
      business_id:    orderResult.rows[0].business_id,
      type:           'delivery_failed',
      title:          '⚠️ Problème de livraison signalé',
      message:        `${driver.first_name} ${driver.last_name} a signalé un problème sur la commande ${orderId} (${orderResult.rows[0].client_name}) : "${reason}"`,
      priority:       'urgent',
      reference_id:   parseInt(orderId),
      reference_type: 'order',
      metadata:       { order_id: orderId, driver_id: driver.id, reason }
    });
  }

  logger.warn('Problème livraison signalé', { orderId, driverId: driver.id, reason });

  const io = req.app.get('io');
  notifyBusiness(io, orderResult.rows[0].business_id, 'order_updated', {
    orderId: parseInt(orderId),
    delivery_status: 'failed',
    last_delivery_failure_reason: reason
  });

  res.json({
    success: true,
    message: 'Problème signalé.',
    data: { orderId: parseInt(orderId), delivery_status: 'failed', reason }
  });
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
  toggleDriverActive, assignDriver, unassignDriver, toggleStatus, getMyOrders, 
  pickupOrder, acceptOrder, refuseOrder, deliverOrder, failOrder, 
  changePassword, deleteDriverPermanently
};