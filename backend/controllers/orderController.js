// backend/controllers/orderController.js
// VERSION COMPLÈTE AVEC ENVOI AUTOMATIQUE DU REÇU PDF (commandes spéciales)

const Order = require('../models/Order');
const Business = require('../models/Business');
const { HTTP_STATUS, ERROR_CODES, ORDER_STATUS } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const SpecialOrder = require('../models/SpecialOrder');
const notificationService = require('../services/notificationService');
const { emailService } = require('../services/emailService');
const { smsService } = require('../services/smsService');
const clientNotificationService = require('../services/clientNotificationService');
const User = require('../models/User');
const { pool } = require('../config/db');
const Commission = require('../models/Commission');
const Subscription = require('../models/Subscription');
const orderReceiptService = require('../services/orderReceiptService'); // 🆕 REÇU

// ─────────────────────────────────────────────────────────────────────────────
// Créer une commande (public)
// ─────────────────────────────────────────────────────────────────────────────
const createOrder = asyncHandler(async (req, res) => {
  const { business_id, items, ...orderData } = req.body;

  const business = await Business.findById(business_id);
  if (!business || !business.is_active) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable ou inactif',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  const totalAmount = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);

  const order = await Order.create({
    business_id,
    ...orderData,
    total_amount: totalAmount,
  }, items);

  if (req.user && req.user.role === 'client') {
    await pool.query('UPDATE orders SET client_id = $1 WHERE id = $2', [req.user.id, order.id]);
    order.client_id = req.user.id;
  }

  if (business) {
    await notificationService.notifyNewOrder(order, business);
  }

  logger.info('Nouvelle commande créée', {
    orderId: order.id,
    businessId: business_id,
    clientName: order.client_name,
    totalAmount: order.total_amount,
    clientId: order.client_id || null,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Commande créée avec succès',
    data: order,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir une commande par ID
// ─────────────────────────────────────────────────────────────────────────────
const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await Order.getWithItems(id);
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Commande introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({ success: true, data: order });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir les commandes d'un établissement
// ─────────────────────────────────────────────────────────────────────────────
const getBusinessOrders = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { status, payment_status } = req.query;

  const orders = await Order.getByBusinessId(businessId, { status, payment_status });

  res.json({ success: true, data: orders });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mettre à jour le statut d'une commande (AVEC COMMISSION AUTOMATIQUE)
// ─────────────────────────────────────────────────────────────────────────────
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!Object.values(ORDER_STATUS).includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Statut invalide',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await Order.updateStatus(id, status);
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Commande introuvable',
        code: ERROR_CODES.NOT_FOUND,
      });
    }

    // Si la commande est livrée et payée → créer commission
    // if (status === 'delivered' && order.payment_status === 'paid') {
    //   const existingCommission = await Commission.getByOrderId(order.id);
    //   if (!existingCommission) {
    //     const subscription = await Subscription.getBusinessSubscription(order.business_id);
    //     const commissionRate = subscription?.commission_rate || 5.0;
    //     await Commission.createFromOrder(order.id, order.business_id, order.total_amount, commissionRate);
    //     logger.info(`Commission créée pour commande ${order.id}: ${commissionRate}% de ${order.total_amount}`);
    //   }
    // }

    await client.query('COMMIT');

    const business = await Business.findById(order.business_id);

    // Notifier le client connecté
    if (order.client_id) {
      const clientUser = await User.findById(order.client_id);
      if (clientUser) {
        const clientInfo = {
          user_id: clientUser.id,
          email: clientUser.email,
          phone: clientUser.phone,
          first_name: clientUser.first_name
        };

        if (status === 'confirmed') {
          await clientNotificationService.notifyOrderConfirmed(order, business, clientInfo);
        } else if (status === 'ready') {
          await clientNotificationService.notifyOrderReady(order, business, clientInfo);
        } else if (status === 'delivered') {
          await clientNotificationService.notifyOrderDelivered(order, business, clientInfo);
        }
      }
    }

    if (business) {
      if (status === 'delivered') await notificationService.notifyDeliveryConfirmed(order, business);
      if (status === 'cancelled') await notificationService.notifyOrderCancelled(order, business);
    }

    logger.info('Statut de commande mis à jour', { orderId: id, newStatus: status, userId: req.user?.id });

    res.json({
      success: true,
      message: `Commande ${status === 'confirmed' ? 'confirmée' : status}`,
      data: order,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating order status:', error);
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir les statistiques des commandes
// ─────────────────────────────────────────────────────────────────────────────
const getOrderStatistics = asyncHandler(async (req, res) => {
  const { business_id } = req.query;
  let businessId = business_id;
  if (!businessId && req.business) businessId = req.business.id;

  const statistics = await Order.getStatistics(businessId);
  res.json({ success: true, data: statistics });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir toutes les commandes (admin)
// ─────────────────────────────────────────────────────────────────────────────
const getAllOrders = asyncHandler(async (req, res) => {
  const { status, payment_status } = req.query;
  const orders = await Order.getAll({ status, payment_status });
  res.json({ success: true, data: orders });
});

// ─────────────────────────────────────────────────────────────────────────────
// Créer une commande spéciale
// ─────────────────────────────────────────────────────────────────────────────
const createSpecialOrder = asyncHandler(async (req, res) => {
  const orderData = req.body;

  const business = await Business.findById(orderData.business_id);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  if (!business.is_active) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Cet établissement n\'est pas actif',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const specialOrder = await SpecialOrder.create(orderData);

  if (business) {
    try {
      await notificationService.createNotification({
        business_id: business.id,
        type: 'new_order',
        title: 'Nouvelle commande spéciale',
        message: `Nouvelle commande pour ${orderData.event_type} - ${orderData.number_of_guests} invités le ${new Date(orderData.event_date).toLocaleDateString('fr-FR')}`,
        reference_id: specialOrder.id,
        reference_type: 'special_order',
        priority: 'high',
        metadata: {
          event_type: orderData.event_type,
          number_of_guests: orderData.number_of_guests,
          event_date: orderData.event_date,
        }
      });
    } catch (error) {
      logger.error('Erreur création notification:', error);
    }

    if (business.owner_email || business.email) {
      try {
        await emailService.sendSpecialOrderNotificationToCaterer(
          specialOrder,
          business,
          business.owner_email || business.email
        );
      } catch (error) {
        logger.error('Erreur envoi email au traiteur:', error);
      }
    }

    if (business.phone) {
      try {
        await smsService.sendSpecialOrderNotification(specialOrder, business);
      } catch (error) {
        logger.error('Erreur envoi SMS au traiteur:', error);
      }
    }
  }

  try {
    await emailService.sendSpecialOrderConfirmation(specialOrder, business);
  } catch (error) {
    logger.error('Erreur envoi email au client:', error);
  }

  logger.info('Commande spéciale créée', {
    orderId: specialOrder.id,
    businessId: orderData.business_id,
    businessName: business.name,
    eventType: orderData.event_type,
    clientName: orderData.client_name,
    guests: orderData.number_of_guests,
    eventDate: orderData.event_date
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Votre demande de commande spéciale a été envoyée avec succès ! Le traiteur vous contactera sous peu.',
    data: specialOrder,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir une commande spéciale par ID
// ─────────────────────────────────────────────────────────────────────────────
const getSpecialOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const specialOrder = await SpecialOrder.findById(id);
  if (!specialOrder) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Commande spéciale introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({ success: true, data: specialOrder });
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir les commandes spéciales d'un business
// ─────────────────────────────────────────────────────────────────────────────
const getBusinessSpecialOrders = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const { status } = req.query;

  let specialOrders;
  if (status) {
    specialOrders = (await SpecialOrder.findByBusinessId(businessId)).filter(o => o.status === status);
  } else {
    specialOrders = await SpecialOrder.findByBusinessId(businessId);
  }

  res.json({ success: true, data: specialOrders });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mettre à jour le statut d'une commande spéciale
// POINT DE DÉCLENCHEMENT DU REÇU pour les commandes spéciales (status = confirmed)
// ─────────────────────────────────────────────────────────────────────────────
const updateSpecialOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, estimated_budget } = req.body;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const specialOrderBefore = await SpecialOrder.findById(id);
    if (!specialOrderBefore) {
      await client.query('ROLLBACK');
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Commande spéciale introuvable',
        code: ERROR_CODES.NOT_FOUND,
      });
    }

    let updateQuery = 'UPDATE special_orders SET status = $1, updated_at = CURRENT_TIMESTAMP';
    let queryParams = [status];

    if (estimated_budget !== undefined) {
      updateQuery += ', estimated_budget = $2';
      queryParams.push(estimated_budget);
    }

    updateQuery += ` WHERE id = $${queryParams.length + 1} RETURNING *`;
    queryParams.push(id);

    const result = await client.query(updateQuery, queryParams);
    const specialOrder = result.rows[0];

    // Créer la commission si confirmée avec budget
    if (status === 'confirmed' && specialOrder.estimated_budget && specialOrder.estimated_budget > 0) {
      const existingCommission = await Commission.getBySpecialOrderId(specialOrder.id);
      if (!existingCommission) {
        const subscription = await Subscription.getBusinessSubscription(specialOrder.business_id);
        const commissionRate = subscription?.commission_rate || 5.0;
        await Commission.createFromSpecialOrder(
          specialOrder.id,
          specialOrder.business_id,
          specialOrder.estimated_budget,
          commissionRate
        );
        logger.info(`Commission créée pour commande spéciale ${specialOrder.id}: ${commissionRate}% de ${specialOrder.estimated_budget}`);
      }
    }

    await client.query('COMMIT');

    const business = await Business.findById(specialOrder.business_id);

    // Notification push au client connecté
    if (specialOrder.client_id && business) {
      try {
        const clientUser = await User.findById(specialOrder.client_id);
        if (clientUser) {
          const clientInfo = {
            user_id: clientUser.id,
            email: clientUser.email,
            phone: clientUser.phone,
            first_name: clientUser.first_name
          };

          if (status === 'confirmed') {
            await clientNotificationService.sendClientNotification({
              user_id: clientUser.id,
              type: 'order_confirmed',
              title: 'Commande spéciale confirmée',
              message: `Votre commande spéciale pour ${specialOrder.event_type} le ${new Date(specialOrder.event_date).toLocaleDateString('fr-FR')} a été confirmée par ${business.name}`,
              reference_id: specialOrder.id,
              reference_type: 'special_order',
              priority: 'high',
              metadata: { order: specialOrder, business }
            }, clientInfo);
          } else if (status === 'cancelled') {
            await clientNotificationService.sendClientNotification({
              user_id: clientUser.id,
              type: 'order_cancelled',
              title: 'Commande spéciale annulée',
              message: `Votre commande spéciale pour ${specialOrder.event_type} a été annulée par ${business.name}`,
              reference_id: specialOrder.id,
              reference_type: 'special_order',
              priority: 'high',
              metadata: { order: specialOrder, business }
            }, clientInfo);
          }
        }
      } catch (error) {
        logger.error('Erreur notification push client:', error);
      }
    }

    // Email au client
    if (specialOrder.client_email && business) {
      try {
        if (status === 'confirmed') {
          await emailService.sendSpecialOrderConfirmation(specialOrder, business);
        } else if (status === 'cancelled') {
          await emailService.sendEmail(
            specialOrder.client_email,
            `Commande spéciale annulée - ${business.name}`,
            `<h2>Commande annulée</h2>
             <p>Bonjour ${specialOrder.client_name},</p>
             <p>Votre commande spéciale pour <strong>${specialOrder.event_type}</strong> 
             le ${new Date(specialOrder.event_date).toLocaleDateString('fr-FR')} a été annulée.</p>
             <p>Pour toute question, contactez-nous.</p>
             <p>Cordialement,<br>${business.name}</p>`
          );
        }
      } catch (error) {
        logger.error('Erreur envoi email au client:', error);
      }
    }

    // 🆕 Envoyer le reçu quand la commande spéciale est CONFIRMÉE
    // En arrière-plan pour ne pas bloquer la réponse du traiteur
    if (status === 'confirmed') {
      const clientInfo = {
        email:      specialOrder.client_email,
        phone:      specialOrder.client_phone,
        first_name: specialOrder.client_name,
        user_id:    specialOrder.client_id || null, // null si invité
      };

      orderReceiptService
        .sendSpecialOrderReceipt(specialOrder.id, clientInfo)
        .then(result => logger.info(`[Reçu] ✅ Envoyé pour commande spéciale #${specialOrder.id}:`, result))
        .catch(err => logger.error(`[Reçu] ❌ Erreur commande spéciale #${specialOrder.id}:`, err.message));
    }

    logger.info('Statut de commande spéciale mis à jour', {
      orderId: id,
      newStatus: status,
      businessId: specialOrder.business_id,
      userId: req.user?.id,
    });

    res.json({
      success: true,
      message: `Commande spéciale ${status === 'confirmed' ? 'confirmée' : status === 'cancelled' ? 'annulée' : 'mise à jour'}`,
      data: specialOrder,
    });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating special order status:', error);
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Obtenir les statistiques des commandes spéciales
// ─────────────────────────────────────────────────────────────────────────────
const getSpecialOrderStatistics = asyncHandler(async (req, res) => {
  const { business_id } = req.query;
  let businessId = business_id;
  if (!businessId && req.business) businessId = req.business.id;

  const statistics = await SpecialOrder.getStatistics(businessId);
  res.json({ success: true, data: statistics });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mettre à jour le statut de paiement (AVEC COMMISSION AUTOMATIQUE)
// ─────────────────────────────────────────────────────────────────────────────
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payment_status, transaction_id } = req.body;

    await client.query('BEGIN');

    const updateQuery = `
      UPDATE orders 
      SET payment_status = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;
    const orderResult = await client.query(updateQuery, [payment_status, id]);
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    // Si paiement réussi ET livrée → créer commission
    if (payment_status === 'paid' && order.status === 'delivered') {
      const existingCommission = await Commission.getByOrderId(order.id);
      if (!existingCommission) {
        const subscription = await Subscription.getBusinessSubscription(order.business_id);
        const commissionRate = subscription?.commission_rate || 5.0;
        await Commission.createFromOrder(order.id, order.business_id, order.total_amount, commissionRate);
        logger.info(`Commission créée pour commande ${order.id}: ${commissionRate}% de ${order.total_amount}`);
      }
    }

    await client.query('COMMIT');

    res.json({ success: true, message: 'Statut de paiement mis à jour', data: order });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating payment status:', error);
    res.status(500).json({ success: false, message: 'Erreur lors de la mise à jour du statut de paiement' });
  } finally {
    client.release();
  }
});

module.exports = {
  createOrder,
  getOrderById,
  getBusinessOrders,
  updateOrderStatus,
  getOrderStatistics,
  getAllOrders,
  createSpecialOrder,
  getSpecialOrderById,
  getBusinessSpecialOrders,
  updateSpecialOrderStatus,
  getSpecialOrderStatistics,
  updatePaymentStatus,
};