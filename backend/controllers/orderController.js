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
const orderReceiptService = require('../services/orderReceiptService');
const { calculateOrderFees, calculateDepositFees } = require('../utils/feeCalculator');
const { cinetpayService } = require('../services/cinetpayService');
// ✅ AJOUT
const { getSettings } = require('../utils/settingsHelper');


// ─────────────────────────────────────────────────────────────────────────────
// Créer une commande (public)
// ─────────────────────────────────────────────────────────────────────────────
const createOrder = asyncHandler(async (req, res) => {
  const {
    business_id, client_name, client_phone, client_email,
    notes, items,
    payment_type = 'online',
    payment_method,
    delivery_address,
    delivery_distance
  } = req.body;

  if (!business_id || !client_name || !client_phone || !items?.length) {
    return res.status(400).json({ success: false, error: 'Champs requis manquants' });
  }

  if (payment_type === 'online' && !payment_method) {
    return res.status(400).json({ success: false, error: 'Méthode de paiement requise pour paiement en ligne' });
  }

  const business = await Business.findById(business_id);
  if (!business) {
    return res.status(404).json({ success: false, error: 'Établissement introuvable' });
  }

  const subtotal = items.reduce((sum, item) => sum + (item.unit_price * item.quantity), 0);

  // ✅ Lire les limites configurées par l'admin en une seule requête
  const { min_order_amount, max_order_amount } = await getSettings([
    'min_order_amount',
    'max_order_amount'
  ]);

  const minAmount = min_order_amount ?? 500;    // défaut 500 FCFA
  const maxAmount = max_order_amount ?? 500000; // défaut 500 000 FCFA

  if (subtotal < minAmount) {
    return res.status(400).json({
      success: false,
      error: `Montant minimum de commande : ${minAmount.toLocaleString('fr-FR')} FCFA`
    });
  }

  if (subtotal > maxAmount) {
    return res.status(400).json({
      success: false,
      error: `Montant maximum de commande : ${maxAmount.toLocaleString('fr-FR')} FCFA`
    });
  }

  const fees = calculateOrderFees({
    subtotal,
    paymentType: payment_type,
    paymentMethod: payment_method,
    deliveryDistance: delivery_distance
  });

  const orderData = {
    business_id,
    client_id: req.user?.id || null,
    client_name, client_phone, client_email,
    status: 'pending',
    payment_type,
    payment_method: payment_type === 'online' ? payment_method : 'cash',
    payment_status: payment_type === 'cod' ? 'cod_pending' : 'pending',
    notes,
    subtotal_amount:   fees.subtotal_amount,
    delivery_fee:      fees.delivery_fee,
    payment_fee:       fees.payment_fee,
    total_amount:      fees.total_amount,
    delivery_address,
    delivery_distance
  };

  const order = await Order.create(orderData, items);

  const subscription = await Subscription.getBusinessSubscription(business_id);
  const commissionRate = subscription?.commission_rate || 5.0;
  await Commission.createFromOrder(order.id, business_id, fees.subtotal_amount, commissionRate);

  await notificationService.createNotification({
    business_id: business.id,
    type: 'new_order',
    title: payment_type === 'cod' ? '💵 Nouvelle commande COD' : '🛒 Nouvelle commande',
    message: `${client_name} a passé une commande de ${fees.total_amount.toLocaleString('fr-FR')} FCFA${payment_type === 'cod' ? ' (paiement à la livraison)' : ''}`,
    priority: payment_type === 'cod' ? 'normal' : 'high',
    metadata: { order_id: order.id, payment_type, fees }
  });

  logger.info('Commande créée', { orderId: order.id, businessId: business_id, total: fees.total_amount });

  res.status(201).json({ success: true, message: 'Commande créée avec succès', data: order });
});


// ─────────────────────────────────────────────────────────────────────────────
// Obtenir une commande par ID
// ─────────────────────────────────────────────────────────────────────────────
const getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const order = await Order.getWithItems(id);
  if (!order) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Commande introuvable', code: ERROR_CODES.NOT_FOUND });
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
// Mettre à jour le statut d'une commande
// ─────────────────────────────────────────────────────────────────────────────
const updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!Object.values(ORDER_STATUS).includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Statut invalide', code: ERROR_CODES.VALIDATION_ERROR });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const order = await Order.updateStatus(id, status);
    if (!order) {
      await client.query('ROLLBACK');
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Commande introuvable', code: ERROR_CODES.NOT_FOUND });
    }

    await client.query('COMMIT');

    const business = await Business.findById(order.business_id);

    if (order.client_id) {
      const clientUser = await User.findById(order.client_id);
      if (clientUser) {
        const clientInfo = { user_id: clientUser.id, email: clientUser.email, phone: clientUser.phone, first_name: clientUser.first_name };
        if (status === 'confirmed') await clientNotificationService.notifyOrderConfirmed(order, business, clientInfo);
        else if (status === 'ready')     await clientNotificationService.notifyOrderReady(order, business, clientInfo);
        else if (status === 'delivered') await clientNotificationService.notifyOrderDelivered(order, business, clientInfo);
      }
    }

    if (business) {
      if (status === 'delivered') await notificationService.notifyDeliveryConfirmed(order, business);
      if (status === 'cancelled') await notificationService.notifyOrderCancelled(order, business);
    }

    logger.info('Statut commande mis à jour', { orderId: id, newStatus: status, userId: req.user?.id });
    res.json({ success: true, message: `Commande ${status === 'confirmed' ? 'confirmée' : status}`, data: order });

  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error updating order status:', error);
    throw error;
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Statistiques commandes
// ─────────────────────────────────────────────────────────────────────────────
const getOrderStatistics = asyncHandler(async (req, res) => {
  const { business_id } = req.query;
  let businessId = business_id;
  if (!businessId && req.business) businessId = req.business.id;
  const statistics = await Order.getStatistics(businessId);
  res.json({ success: true, data: statistics });
});

// ─────────────────────────────────────────────────────────────────────────────
// Toutes les commandes (admin)
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
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND });
  }

  if (!business.is_active) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Cet établissement n\'est pas actif', code: ERROR_CODES.VALIDATION_ERROR });
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
        metadata: { event_type: orderData.event_type, number_of_guests: orderData.number_of_guests, event_date: orderData.event_date }
      });
    } catch (error) {
      logger.error('Erreur création notification:', error);
    }

    if (business.owner_email || business.email) {
      try {
        await emailService.sendSpecialOrderNotificationToCaterer(specialOrder, business, business.owner_email || business.email);
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

  logger.info('Commande spéciale créée', { orderId: specialOrder.id, businessId: orderData.business_id });

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
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Commande spéciale introuvable', code: ERROR_CODES.NOT_FOUND });
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
      return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Commande spéciale introuvable', code: ERROR_CODES.NOT_FOUND });
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

    if (status === 'confirmed' && specialOrder.estimated_budget && specialOrder.estimated_budget > 0) {
      const existingCommission = await Commission.getBySpecialOrderId(specialOrder.id);
      if (!existingCommission) {
        const subscription = await Subscription.getBusinessSubscription(specialOrder.business_id);
        const commissionRate = subscription?.commission_rate || 5.0;
        await Commission.createFromSpecialOrder(specialOrder.id, specialOrder.business_id, specialOrder.estimated_budget, commissionRate);
      }
    }

    await client.query('COMMIT');

    const business = await Business.findById(specialOrder.business_id);

    if (specialOrder.client_id && business) {
      try {
        const clientUser = await User.findById(specialOrder.client_id);
        if (clientUser) {
          const clientInfo = { user_id: clientUser.id, email: clientUser.email, phone: clientUser.phone, first_name: clientUser.first_name };
          if (status === 'confirmed') {
            await clientNotificationService.sendClientNotification({
              user_id: clientUser.id, type: 'order_confirmed',
              title: 'Commande spéciale confirmée',
              message: `Votre commande spéciale pour ${specialOrder.event_type} le ${new Date(specialOrder.event_date).toLocaleDateString('fr-FR')} a été confirmée par ${business.name}`,
              reference_id: specialOrder.id, reference_type: 'special_order',
              priority: 'high', metadata: { order: specialOrder, business }
            }, clientInfo);
          } else if (status === 'cancelled') {
            await clientNotificationService.sendClientNotification({
              user_id: clientUser.id, type: 'order_cancelled',
              title: 'Commande spéciale annulée',
              message: `Votre commande spéciale pour ${specialOrder.event_type} a été annulée par ${business.name}`,
              reference_id: specialOrder.id, reference_type: 'special_order',
              priority: 'high', metadata: { order: specialOrder, business }
            }, clientInfo);
          }
        }
      } catch (error) {
        logger.error('Erreur notification push client:', error);
      }
    }

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

    if (status === 'confirmed') {
      const clientInfo = {
        email:      specialOrder.client_email,
        phone:      specialOrder.client_phone,
        first_name: specialOrder.client_name,
        user_id:    specialOrder.client_id || null,
      };
      orderReceiptService
        .sendSpecialOrderReceipt(specialOrder.id, clientInfo)
        .then(result => logger.info(`[Reçu] ✅ Envoyé pour commande spéciale #${specialOrder.id}:`, result))
        .catch(err => logger.error(`[Reçu] ❌ Erreur commande spéciale #${specialOrder.id}:`, err.message));
    }

    logger.info('Statut de commande spéciale mis à jour', { orderId: id, newStatus: status, businessId: specialOrder.business_id, userId: req.user?.id });

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
// Statistiques commandes spéciales
// ─────────────────────────────────────────────────────────────────────────────
const getSpecialOrderStatistics = asyncHandler(async (req, res) => {
  const { business_id } = req.query;
  let businessId = business_id;
  if (!businessId && req.business) businessId = req.business.id;
  const statistics = await SpecialOrder.getStatistics(businessId);
  res.json({ success: true, data: statistics });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mettre à jour le statut de paiement
// ─────────────────────────────────────────────────────────────────────────────
const updatePaymentStatus = asyncHandler(async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { payment_status } = req.body;

    await client.query('BEGIN');

    const orderResult = await client.query(
      `UPDATE orders SET payment_status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [payment_status, id]
    );
    const order = orderResult.rows[0];

    if (!order) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, message: 'Commande non trouvée' });
    }

    if (payment_status === 'paid' && order.status === 'delivered') {
      const existingCommission = await Commission.getByOrderId(order.id);
      if (!existingCommission) {
        const subscription = await Subscription.getBusinessSubscription(order.business_id);
        const commissionRate = subscription?.commission_rate || 5.0;
        await Commission.createFromOrder(order.id, order.business_id, order.total_amount, commissionRate);
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

// ─────────────────────────────────────────────────────────────────────────────
// Confirmer paiement COD reçu
// ─────────────────────────────────────────────────────────────────────────────
const confirmCodPayment = asyncHandler(async (req, res) => {
  const { orderId } = req.params;
  const { cod_amount } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return res.status(404).json({ success: false, error: 'Commande introuvable' });

  if (order.payment_type !== 'cod') {
    return res.status(400).json({ success: false, error: 'Cette commande n\'est pas en paiement à la livraison' });
  }

  if (order.payment_status === 'cod_received') {
    return res.status(400).json({ success: false, error: 'Paiement déjà confirmé' });
  }

  const expectedAmount = Number(order.total_amount);
  const receivedAmount = Number(cod_amount || order.total_amount);

  if (Math.abs(receivedAmount - expectedAmount) > 0.01) {
    return res.status(400).json({ success: false, error: `Montant incorrect. Attendu: ${expectedAmount} FCFA, reçu: ${receivedAmount} FCFA` });
  }

  await pool.query(
    `UPDATE orders SET payment_status = 'cod_received', cod_amount = $1, cod_received_at = NOW(), cod_confirmed_by = $2, updated_at = NOW() WHERE id = $3`,
    [receivedAmount, req.user.id, orderId]
  );

  const commissionResult = await pool.query(
    `UPDATE commissions SET status = 'collected', collected_at = NOW(), updated_at = NOW() WHERE order_id = $1 AND status = 'pending' RETURNING id, commission_amount`,
    [orderId]
  );

  await notificationService.createNotification({
    business_id: order.business_id,
    type: 'payment_received',
    title: '✅ Paiement COD confirmé',
    message: `Paiement de ${receivedAmount.toLocaleString('fr-FR')} FCFA reçu pour la commande #${orderId}`,
    priority: 'normal',
    metadata: { order_id: orderId, amount: receivedAmount }
  });

  res.json({
    success: true,
    message: 'Paiement COD confirmé avec succès',
    data: { order_id: orderId, amount: receivedAmount, commission_collected: commissionResult.rows[0]?.commission_amount || 0 }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Stats COD d'un établissement
// ─────────────────────────────────────────────────────────────────────────────
const getCodStats = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const result = await pool.query(
    `SELECT
      COUNT(o.id)::int AS total_cod_orders,
      COUNT(CASE WHEN o.payment_status = 'cod_pending' THEN 1 END)::int AS pending_count,
      COUNT(CASE WHEN o.payment_status = 'cod_received' THEN 1 END)::int AS received_count,
      COALESCE(SUM(CASE WHEN o.payment_status = 'cod_pending' THEN o.total_amount END), 0)::numeric AS pending_amount,
      COALESCE(SUM(CASE WHEN o.payment_status = 'cod_received' THEN o.total_amount END), 0)::numeric AS received_amount
    FROM orders o
    WHERE o.business_id = $1 AND o.payment_type = 'cod'`,
    [businessId]
  );
  res.json({ success: true, data: result.rows[0] });
});

// ─────────────────────────────────────────────────────────────────────────────
// Traiteur envoie devis
// ─────────────────────────────────────────────────────────────────────────────
const sendSpecialOrderQuote = asyncHandler(async (req, res) => {
  const id = req.params.specialOrderId || req.params.id;

  const quoted_amount      = Number(req.body.quoted_amount);
  const deposit_percentage = Number(req.body.deposit_percentage);
  const transport_fee      = Number(req.body.transport_fee || 0);
  const quote_notes        = String(req.body.quote_notes || '');

  if (!quoted_amount || isNaN(quoted_amount) || quoted_amount < 1000) {
    return res.status(400).json({ success: false, error: `Montant invalide: minimum 1 000 FCFA` });
  }

  if (!deposit_percentage || isNaN(deposit_percentage) || deposit_percentage < 10 || deposit_percentage > 100) {
    return res.status(400).json({ success: false, error: `Pourcentage invalide (10-100%)` });
  }

  const specialOrder = await SpecialOrder.findById(id);
  if (!specialOrder) return res.status(404).json({ success: false, error: `Commande introuvable (id: ${id})` });
  if (specialOrder.status === 'cancelled') return res.status(400).json({ success: false, error: 'Impossible d\'envoyer un devis pour une commande annulée' });
  if (req.business && specialOrder.business_id !== req.business.id) return res.status(403).json({ success: false, error: 'Non autorisé' });

  const depositAmount = Math.round((quoted_amount * deposit_percentage) / 100);
  const finalAmount   = quoted_amount + transport_fee;
  const newStatus     = specialOrder.status === 'pending' ? 'quoted' : specialOrder.status;

  await SpecialOrder.update(id, {
    quoted_amount, deposit_percentage, deposit_amount: depositAmount,
    transport_fee, final_amount: finalAmount, quote_notes,
    status: newStatus, deposit_status: 'pending'
  });

  const business    = await Business.findById(specialOrder.business_id);
  const paymentLink = `${process.env.FRONTEND_URL}/pay-deposit/${id}`;

  try {
    await emailService.sendQuoteEmail({
      clientName: specialOrder.client_name, clientEmail: specialOrder.client_email,
      businessName: business.name, businessPhone: business.phone,
      businessAddress: business.address, businessEmail: business.email,
      eventType: specialOrder.event_type, eventDate: specialOrder.event_date,
      eventTime: specialOrder.event_time, numberOfGuests: specialOrder.number_of_guests,
      quotedAmount: quoted_amount, depositPercentage: deposit_percentage,
      depositAmount, transportFee: transport_fee, finalAmount, quoteNotes: quote_notes, paymentLink
    });
  } catch (emailError) {
    logger.error('Erreur envoi email devis:', emailError.message);
  }

  if (specialOrder.client_id) {
    try {
      await clientNotificationService.sendClientNotification({
        user_id: specialOrder.client_id, type: 'quote_received',
        title: '📄 Devis reçu',
        message: `Votre devis pour ${getEventTypeLabel(specialOrder.event_type)} est disponible : ${finalAmount.toLocaleString('fr-FR')} FCFA`,
        reference_id: parseInt(id), reference_type: 'special_order',
        priority: 'high', metadata: { quoted_amount, deposit_amount: depositAmount, final_amount: finalAmount }
      }, { user_id: specialOrder.client_id });
    } catch (notifError) {
      logger.error('Erreur notification client:', notifError.message);
    }
  }

  return res.json({
    success: true, message: 'Devis envoyé au client',
    data: { order_id: id, quoted_amount, deposit_amount: depositAmount, final_amount: finalAmount, payment_link: paymentLink }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Client accepte devis et paie acompte
// ─────────────────────────────────────────────────────────────────────────────
const acceptSpecialOrderQuote = asyncHandler(async (req, res) => {
  const id = req.params.specialOrderId || req.params.id;
  const { deposit_payment_method } = req.body;

  const specialOrder = await SpecialOrder.findById(id);
  if (!specialOrder || specialOrder.status !== 'quoted') {
    return res.status(400).json({ success: false, error: 'Aucun devis disponible pour cette commande' });
  }

  if (!deposit_payment_method) {
    return res.status(400).json({ success: false, error: 'Mode de paiement requis' });
  }

  const depositFees = calculateDepositFees(specialOrder.deposit_amount, deposit_payment_method);

  if (deposit_payment_method === 'cod' || deposit_payment_method === 'cash') {
    await SpecialOrder.update(id, {
      deposit_payment_method, deposit_payment_fee: depositFees.deposit_payment_fee,
      deposit_status: 'cod_pending', status: 'confirmed'
    });

    const business = await Business.findById(specialOrder.business_id);
    if (business) {
      await notificationService.createNotification({
        business_id: business.id, type: 'new_order',
        title: '💵 Acompte COD en attente',
        message: `${specialOrder.client_name} a confirmé sa commande avec paiement acompte en espèces : ${depositFees.total_deposit.toLocaleString('fr-FR')} FCFA`,
        reference_id: parseInt(id), reference_type: 'special_order', priority: 'high'
      });
    }

    return res.json({
      success: true, message: 'Commande confirmée. Acompte à payer chez le traiteur.',
      payment_info: { type: 'cod', deposit_amount: specialOrder.deposit_amount, deposit_fee: depositFees.deposit_payment_fee, total_deposit: depositFees.total_deposit }
    });
  }

  const isSandbox = process.env.PAYMENT_MODE === 'sandbox';

  if (isSandbox) {
    await SpecialOrder.update(id, {
      deposit_payment_method, deposit_payment_fee: depositFees.deposit_payment_fee,
      deposit_payment_id: `SANDBOX-${Date.now()}`, deposit_status: 'pending', status: 'confirmed'
    });
    return res.json({
      success: true, message: 'Paiement accepté (mode sandbox). Commande confirmée.', sandbox: true,
      payment_info: { type: 'online', deposit_amount: specialOrder.deposit_amount, deposit_fee: depositFees.deposit_payment_fee, total_deposit: depositFees.total_deposit }
    });
  }

  try {
    const amountInt = Math.round(Number(depositFees.total_deposit));
    const payment = await cinetpayService.initiatePayment({
      amount: amountInt, currency: 'XOF',
      transaction_id: `SPECIAL-DEPOSIT-${id}-${Date.now()}`,
      description: `Acompte commande spéciale #${id}`,
      customer_name: specialOrder.client_name,
      customer_phone_number: specialOrder.client_phone,
      customer_email: specialOrder.client_email,
      payment_method: deposit_payment_method
    });

    if (!payment.success) throw new Error('Erreur initiation paiement CinetPay');

    await SpecialOrder.update(id, {
      deposit_payment_method, deposit_payment_fee: depositFees.deposit_payment_fee,
      deposit_payment_id: payment.data.payment_id, deposit_status: 'pending'
    });

    res.json({
      success: true, message: 'Redirection vers paiement',
      payment_url: payment.data.payment_url, sandbox: false,
      payment_info: { type: 'online', deposit_amount: specialOrder.deposit_amount, deposit_fee: depositFees.deposit_payment_fee, total_deposit: amountInt }
    });

  } catch (error) {
    logger.error('Erreur paiement acompte:', error);
    return res.status(500).json({ success: false, error: 'Impossible d\'initier le paiement' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Confirmer acompte COD commande spéciale
// ─────────────────────────────────────────────────────────────────────────────
const confirmSpecialOrderDepositCOD = asyncHandler(async (req, res) => {
  const { specialOrderId } = req.params;
  const { deposit_amount } = req.body;

  const specialOrder = await SpecialOrder.findById(specialOrderId);
  if (!specialOrder) return res.status(404).json({ success: false, error: 'Commande introuvable' });

  if (specialOrder.deposit_status !== 'cod_pending') {
    return res.status(400).json({ success: false, error: 'Cette commande n\'a pas d\'acompte COD en attente' });
  }

  const expectedAmount = specialOrder.deposit_amount + (specialOrder.deposit_payment_fee || 0);
  const receivedAmount = Number(deposit_amount || expectedAmount);

  await SpecialOrder.updateDepositStatus(specialOrderId, 'cod_received', { confirmed_by: req.user.id });
  await SpecialOrder.update(specialOrderId, { status: 'confirmed' });

  res.json({ success: true, message: 'Acompte COD confirmé avec succès' });
});

// ─────────────────────────────────────────────────────────────────────────────
// Utilitaire
// ─────────────────────────────────────────────────────────────────────────────
function getEventTypeLabel(type) {
  const labels = {
    mariage: '💍 Mariage', anniversaire: '🎂 Anniversaire', bapteme: '👶 Baptême',
    entreprise: '🏢 Événement d\'entreprise', reception: '🎉 Réception', autre: '🎪 Autre'
  };
  return labels[type] || type;
}

module.exports = {
  createOrder, getOrderById, getBusinessOrders, updateOrderStatus,
  getOrderStatistics, getAllOrders, createSpecialOrder, getSpecialOrderById,
  getBusinessSpecialOrders, updateSpecialOrderStatus, getSpecialOrderStatistics,
  updatePaymentStatus, confirmCodPayment, getCodStats,
  sendSpecialOrderQuote, acceptSpecialOrderQuote, confirmSpecialOrderDepositCOD
};