const Reservation = require('../models/Reservation');
const Business = require('../models/Business');
const User = require('../models/User');
const { pool } = require('../config/db');
const { HTTP_STATUS, ERROR_CODES, RESERVATION_STATUS, BUSINESS_TYPES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const clientNotificationService = require('../services/clientNotificationService');
const { emailService } = require('../services/emailService');
const { smsService } = require('../services/smsService');
const { calculateDepositFees } = require('../utils/feeCalculator');
const { cinetpayService } = require('../services/cinetpayService');
const { getSettings } = require('../utils/settingsHelper');

/**
 * Créer une réservation avec support paiement acompte
 */
const createReservation = asyncHandler(async (req, res) => {
  const { 
    restaurant_id, 
    reservation_date, 
    time_slot,
    deposit_payment_method,
    ...reservationData 
  } = req.body;

  const business = await Business.findById(restaurant_id);

  if (!business || !business.is_active || business.type !== BUSINESS_TYPES.RESTAURANT) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Restaurant introuvable ou inactif',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  // ✅ Lire les limites configurées par l'admin en une seule requête
  const { max_reservation_people, reservation_advance_days } = await getSettings([
    'max_reservation_people',
    'reservation_advance_days'
  ]);

  const maxPeople   = max_reservation_people   ?? 50;  // défaut 50 personnes
  const advanceDays = reservation_advance_days  ?? 90;  // défaut 90 jours à l'avance

  // ✅ Valider le nombre de personnes
  const numberOfPeople = Number(reservationData.number_of_people || 1);
  if (numberOfPeople > maxPeople) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: `Maximum ${maxPeople} personne(s) par réservation`,
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  // ✅ Valider que la date n'est pas trop loin
  if (reservation_date) {
    const resDate = new Date(reservation_date);
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + advanceDays);

    if (resDate > maxDate) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Réservation possible jusqu'à ${advanceDays} jours à l'avance`,
        code: ERROR_CODES.VALIDATION_ERROR,
      });
    }
  }

  // Vérifier la disponibilité du créneau
  const isAvailable = await Reservation.checkAvailability(restaurant_id, reservation_date, time_slot);
  if (!isAvailable) {
    return res.status(HTTP_STATUS.CONFLICT).json({
      success: false,
      message: 'Ce créneau horaire n\'est pas disponible',
      code: ERROR_CODES.CONFLICT,
    });
  }

  let reservationDataWithClient = {
    restaurant_id, reservation_date, time_slot, ...reservationData
  };
  
  if (req.user && req.user.role === 'client') {
    reservationDataWithClient.client_id = req.user.id;
  }

  const depositRequired = business.requires_reservation_deposit || false;
  const depositAmount   = business.default_deposit_amount || 0;

  reservationDataWithClient.deposit_required = depositRequired;
  reservationDataWithClient.deposit_amount   = depositAmount;

  // Pas d'acompte requis → créer directement
  if (!depositRequired) {
    reservationDataWithClient.deposit_status = 'none';
    const reservation = await Reservation.create(reservationDataWithClient);
    await notificationService.notifyNewReservation(reservation, business);

    logger.info('Réservation créée sans acompte', { reservationId: reservation.id, restaurantId: restaurant_id });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Réservation créée avec succès',
      data: reservation,
    });
  }

  // Acompte requis mais méthode non fournie
  if (!deposit_payment_method) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Mode de paiement requis pour l\'acompte',
      code: ERROR_CODES.VALIDATION_ERROR,
      deposit_required: true,
      deposit_amount: depositAmount
    });
  }

  const depositFees = calculateDepositFees(depositAmount, deposit_payment_method);
  reservationDataWithClient.deposit_payment_method = deposit_payment_method;
  reservationDataWithClient.deposit_payment_fee    = depositFees.deposit_payment_fee;

  // COD
  if (deposit_payment_method === 'cod' || deposit_payment_method === 'cash') {
    reservationDataWithClient.deposit_status = 'cod_pending';
    const reservation = await Reservation.create(reservationDataWithClient);
    await notificationService.notifyNewReservation(reservation, business);

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      message: 'Réservation créée. Acompte à payer au restaurant.',
      data: reservation,
      payment_info: {
        type: 'cod',
        deposit_amount: depositAmount,
        deposit_fee: depositFees.deposit_payment_fee,
        total_deposit: depositFees.total_deposit
      }
    });
  }

  // Paiement en ligne
  reservationDataWithClient.deposit_status = 'pending';
  const reservation = await Reservation.create(reservationDataWithClient);
  const amountInt   = Math.round(Number(depositFees.total_deposit));
  const isSandbox   = process.env.PAYMENT_MODE === 'sandbox';

  if (isSandbox) {
    await Reservation.updateDepositStatus(reservation.id, 'pending', {
      deposit_payment_id: `SANDBOX-RESERVATION-${reservation.id}-${Date.now()}`
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true, message: 'Réservation créée (mode sandbox).', data: reservation,
      payment_url: null, sandbox: true,
      payment_info: { type: 'online', deposit_amount: depositAmount, deposit_fee: depositFees.deposit_payment_fee, total_deposit: amountInt, payment_method: deposit_payment_method }
    });
  }

  try {
    const payment = await cinetpayService.initiatePayment({
      amount: amountInt, currency: 'XOF',
      transaction_id: `RESERVATION-${reservation.id}-${Date.now()}`,
      description: `Acompte réservation ${reservation.id}`,
      customer_name: reservationData.client_name,
      customer_phone_number: reservationData.client_phone || '',
      customer_email: reservationData.client_email || '',
      payment_method: deposit_payment_method
    });

    if (!payment.success) throw new Error('Erreur initiation paiement CinetPay');

    await Reservation.updateDepositStatus(reservation.id, 'pending', {
      deposit_payment_id: payment.data.payment_id
    });

    return res.status(HTTP_STATUS.CREATED).json({
      success: true, message: 'Réservation créée. Redirection vers paiement.',
      data: reservation, payment_url: payment.data.payment_url, sandbox: false,
      payment_info: { type: 'online', deposit_amount: depositAmount, deposit_fee: depositFees.deposit_payment_fee, total_deposit: amountInt, payment_method: deposit_payment_method }
    });

  } catch (error) {
    logger.error('Erreur initiation paiement acompte', { reservationId: reservation.id, error: error.message });
    try { await Reservation.updateDepositStatus(reservation.id, 'failed', {}); } catch (_) {}
    return res.status(500).json({ success: false, message: 'Impossible d\'initier le paiement', error: error.message });
  }
});

/**
 * Confirmer paiement acompte COD
 */
const confirmDepositCOD = asyncHandler(async (req, res) => {
  const { reservationId } = req.params;
  const { deposit_amount } = req.body;

  const reservation = await Reservation.findById(reservationId);
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Réservation introuvable' });
  }

  if (reservation.deposit_status !== 'cod_pending') {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Cette réservation n\'a pas d\'acompte COD en attente' });
  }

  const expectedAmount = reservation.deposit_amount + (reservation.deposit_payment_fee || 0);
  const receivedAmount = Number(deposit_amount || expectedAmount);

  if (Math.abs(receivedAmount - expectedAmount) > 0.01) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: `Montant incorrect. Attendu: ${expectedAmount} FCFA` });
  }

  await Reservation.updateDepositStatus(reservationId, 'cod_received', { confirmed_by: req.user.id });

  res.json({ success: true, message: 'Acompte COD confirmé avec succès' });
});

// Obtenir une réservation par ID
const getReservationById = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const reservation = await Reservation.findById(id);
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Réservation introuvable', code: ERROR_CODES.NOT_FOUND });
  }
  res.json({ success: true, data: reservation });
});

// Obtenir les réservations d'un restaurant
const getRestaurantReservations = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { status, date } = req.query;
  const reservations = await Reservation.getByRestaurantId(restaurantId, { status, date });
  res.json({ success: true, data: reservations });
});

// Mettre à jour le statut d'une réservation
const updateReservationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!Object.values(RESERVATION_STATUS).includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Statut invalide', code: ERROR_CODES.VALIDATION_ERROR });
  }

  const reservation = await Reservation.updateStatus(id, status);
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Réservation introuvable', code: ERROR_CODES.NOT_FOUND });
  }

  const business = await Business.findById(reservation.restaurant_id);

  if (status === 'confirmed' && reservation.client_id && business) {
    try {
      const clientUser = await User.findById(reservation.client_id);
      if (clientUser) {
        const clientInfo = { user_id: clientUser.id, email: clientUser.email, phone: clientUser.phone, first_name: clientUser.first_name };
        await clientNotificationService.notifyReservationConfirmed(reservation, business, clientInfo);
      }
    } catch (error) {
      logger.error('Erreur notification client', { error: error.message, reservationId: reservation.id });
    }
  }

  if (status === 'confirmed') {
 
    // 1. Notification restaurant
    try {
      await notificationService.createNotification({
        business_id:    business.id,
        type:           'reservation_confirmed',
        title:          'Réservation confirmée',
        message:        `Vous avez confirmé la réservation de ${reservation.client_name} pour le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot}`,
        reference_id:   reservation.id,
        reference_type: 'reservation',
        priority:       'normal',
      });
    } catch (error) {
      logger.error('Erreur notification restaurant', { error: error.message });
    }
 
    // 2. Notification client
    if (reservation.client_id) {
      // Client connecté → via le service centralisé (respecte les préférences)
      try {
        const clientUser = await User.findById(reservation.client_id);
        if (clientUser) {
          const clientInfo = {
            user_id:    clientUser.id,
            email:      clientUser.email,
            phone:      clientUser.phone,
            first_name: clientUser.first_name
          };
          await clientNotificationService.notifyReservationConfirmed(reservation, business, clientInfo);
        }
      } catch (error) {
        logger.error('Erreur notification client réservation confirmée (non bloquant)', {
          error: error.message, reservationId: reservation.id
        });
      }
    } else {
      // Client invité → envoi direct (pas de compte = pas de préférences)
      if (reservation.client_email?.trim()) {
        try {
          await emailService.sendReservationConfirmation(reservation, business);
        } catch (error) {
          logger.error('Erreur email confirmation réservation (invité)', {
            reservationId: reservation.id, error: error.message
          });
        }
      }
      if (reservation.client_phone?.trim()) {
        try {
          const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR');
          await smsService.sendSMS(
            reservation.client_phone,
            `Réservation confirmée au ${business.name} ! ${reservationDate} à ${reservation.time_slot} pour ${reservation.number_of_people} personne${reservation.number_of_people > 1 ? 's' : ''}. À bientôt !`
          );
        } catch (error) {
          logger.error('Erreur SMS confirmation réservation (invité)', {
            reservationId: reservation.id, error: error.message
          });
        }
      }
    }
  }

  if (status === 'cancelled') {
 
    // 1. Notification restaurant (inchangée)
    await notificationService.createNotification({
      business_id:    business.id,
      type:           'reservation_cancelled',
      title:          'Réservation annulée',
      message:        `La réservation de ${reservation.client_name} pour le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot} a été annulée`,
      reference_id:   reservation.id,
      reference_type: 'reservation',
      priority:       'normal',
    });
 
    // 2. ✅ FIX — notification client via le service centralisé
    // → respecte les préférences email/sms/push du client
    // → avant : emailService + smsService appelés directement = bypass des préférences
    if (reservation.client_id) {
      try {
        const clientUser = await User.findById(reservation.client_id);
        if (clientUser) {
          const clientInfo = {
            user_id:    clientUser.id,
            email:      clientUser.email,
            phone:      clientUser.phone,
            first_name: clientUser.first_name
          };
          await clientNotificationService.notifyReservationCancelled(reservation, business, clientInfo);
        }
      } catch (notifError) {
        logger.error('Erreur notification client annulation réservation (non bloquant)', {
          error: notifError.message, reservationId: reservation.id
        });
      }
    } else {
      // Client invité (pas de compte) : envoi direct car pas de préférences stockées
      if (reservation.client_email) {
        try {
          await emailService.sendReservationCancellation(reservation, business);
        } catch (err) {
          logger.error('Erreur email annulation (invité)', { error: err.message });
        }
      }
      if (reservation.client_phone) {
        try {
          const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR');
          await smsService.sendSMS(
            reservation.client_phone,
            `Réservation annulée au ${business.name}. ${reservationDate} à ${reservation.time_slot}. Pour toute question, contactez-nous.`
          );
        } catch (err) {
          logger.error('Erreur SMS annulation (invité)', { error: err.message });
        }
      }
    }
  }

  logger.info('Statut de réservation mis à jour', { reservationId: id, newStatus: status, userId: req.user?.id });

  res.json({
    success: true,
    message: `Réservation ${status === 'confirmed' ? 'confirmée' : status === 'cancelled' ? 'annulée' : 'mise à jour'}`,
    data: reservation,
  });
});

// Obtenir les créneaux disponibles
const getAvailableTimeSlots = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { date } = req.query;

  if (!date) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'Date requise', code: ERROR_CODES.VALIDATION_ERROR });
  }

  const availableSlots = await Reservation.getAvailableTimeSlots(restaurantId, date);
  res.json({ success: true, data: availableSlots });
});

// Statistiques
const getReservationStatistics = asyncHandler(async (req, res) => {
  const { restaurant_id } = req.query;
  let restaurantId = restaurant_id;
  if (!restaurantId && req.business && req.business.type === BUSINESS_TYPES.RESTAURANT) {
    restaurantId = req.business.id;
  }
  const statistics = await Reservation.getStatistics(restaurantId);
  res.json({ success: true, data: statistics });
});

// Toutes les réservations (admin)
const getAllReservations = asyncHandler(async (req, res) => {
  const { status } = req.query;
  const reservations = await Reservation.getAll({ status });
  res.json({ success: true, data: reservations });
});

module.exports = {
  createReservation, confirmDepositCOD, getReservationById,
  getRestaurantReservations, updateReservationStatus,
  getAvailableTimeSlots, getReservationStatistics, getAllReservations,
};