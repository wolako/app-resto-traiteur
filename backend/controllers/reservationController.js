const Reservation = require('../models/Reservation');
const Business = require('../models/Business');
const User = require('../models/User');
const { pool } = require('../config/db'); // AJOUT: Import de pool
const { HTTP_STATUS, ERROR_CODES, RESERVATION_STATUS, BUSINESS_TYPES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const notificationService = require('../services/notificationService');
const clientNotificationService = require('../services/clientNotificationService');
const { emailService } = require('../services/emailService');
const { smsService } = require('../services/smsService');

// Créer une réservation (public)
const createReservation = asyncHandler(async (req, res) => {
  const { restaurant_id, reservation_date, time_slot, ...reservationData } = req.body;

  // Vérifier que le restaurant existe et est actif
  const business = await Business.findById(restaurant_id);

  if (!business || !business.is_active || business.type !== BUSINESS_TYPES.RESTAURANT) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Restaurant introuvable ou inactif',
      code: ERROR_CODES.NOT_FOUND,
    });
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

  // AJOUT: Attacher le client_id si l'utilisateur est connecté
  let reservationDataWithClient = {
    restaurant_id,
    reservation_date,
    time_slot,
    ...reservationData
  };
  
  if (req.user && req.user.role === 'client') {
    reservationDataWithClient.client_id = req.user.id;
  }

  // Créer la réservation
  const reservation = await Reservation.create(reservationDataWithClient);

  // Envoyer une notification au restaurant
  if (business) {
    await notificationService.notifyNewReservation(reservation, business);
  }

  logger.info('Nouvelle réservation créée', {
    reservationId: reservation.id,
    restaurantId: restaurant_id,
    clientId: client_id,
    clientName: reservation.client_name,
    date: reservation_date,
    timeSlot: time_slot,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Réservation créée avec succès',
    data: reservation,
  });
});

// Obtenir une réservation par ID
const getReservationById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const reservation = await Reservation.findById(id);
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Réservation introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({
    success: true,
    data: reservation,
  });
});

// Obtenir les réservations d'un restaurant
const getRestaurantReservations = asyncHandler(async (req, res) => {
  const { restaurantId } = req.params;
  const { status, date } = req.query;

  const reservations = await Reservation.getByRestaurantId(restaurantId, {
    status,
    date,
  });

  res.json({
    success: true,
    data: reservations,
  });
});

// Mettre à jour le statut d'une réservation
const updateReservationStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  // Vérifier que le statut est valide
  if (!Object.values(RESERVATION_STATUS).includes(status)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Statut invalide',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const reservation = await Reservation.updateStatus(id, status);
  if (!reservation) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Réservation introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  const business = await Business.findById(reservation.restaurant_id);

  // ✅ NOTIFICATION AU CLIENT SI client_id EXISTE
  if (status === 'confirmed' && reservation.client_id && business) {
    try {
      const clientUser = await User.findById(reservation.client_id);
      
      if (clientUser) {
        const clientInfo = {
          user_id: clientUser.id,
          email: clientUser.email,
          phone: clientUser.phone,
          first_name: clientUser.first_name
        };

        await clientNotificationService.notifyReservationConfirmed(reservation, business, clientInfo);
        
        logger.info('Notification réservation confirmée envoyée au client', {
          reservationId: reservation.id,
          clientId: reservation.client_id
        });
      }
    } catch (error) {
      logger.error('Erreur notification client', {
        error: error.message,
        reservationId: reservation.id,
        clientId: reservation.client_id
      });
    }
  }

  // ✅ ENVOI DES NOTIFICATIONS AU CLIENT (même sans compte)
  if (status === 'confirmed') {
    // Notification au restaurant
    try {
      await notificationService.createNotification({
        business_id: business.id,
        type: 'reservation_confirmed',
        title: 'Réservation confirmée',
        message: `Vous avez confirmé la réservation de ${reservation.client_name} pour le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot}`,
        reference_id: reservation.id,
        reference_type: 'reservation',
        priority: 'normal',
      });
    } catch (error) {
      logger.error('Erreur création notification restaurant', { error: error.message });
    }

    // ✅ Email au client
    if (reservation.client_email && reservation.client_email.trim() !== '') {
      try {
        const emailResult = await emailService.sendReservationConfirmation(reservation, business);
        if (emailResult.success) {
          logger.info('Email de confirmation envoyé au client', {
            reservationId: reservation.id,
            clientEmail: reservation.client_email,
          });
        } else {
          logger.warn('Échec envoi email de confirmation', {
            reservationId: reservation.id,
            clientEmail: reservation.client_email,
            error: emailResult.error || emailResult.message,
          });
        }
      } catch (error) {
        logger.error('Erreur envoi email de confirmation', {
          reservationId: reservation.id,
          error: error.message,
        });
      }
    }

    // ✅ SMS au client
    if (reservation.client_phone && reservation.client_phone.trim() !== '') {
      try {
        const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR');
        const smsMessage = `Réservation confirmée au ${business.name} ! ` +
          `${reservationDate} à ${reservation.time_slot} pour ${reservation.number_of_people} personne${reservation.number_of_people > 1 ? 's' : ''}. ` +
          `À bientôt !`;
        
        const smsResult = await smsService.sendSMS(reservation.client_phone, smsMessage);
        if (smsResult.success) {
          logger.info('SMS de confirmation envoyé au client', {
            reservationId: reservation.id,
            clientPhone: reservation.client_phone,
          });
        } else {
          logger.warn('Échec envoi SMS de confirmation', {
            reservationId: reservation.id,
            clientPhone: reservation.client_phone,
            error: smsResult.error || smsResult.message,
          });
        }
      } catch (error) {
        logger.error('Erreur envoi SMS de confirmation', {
          reservationId: reservation.id,
          error: error.message,
        });
      }
    }
  }

  // ✅ ENVOI DES NOTIFICATIONS D'ANNULATION
  if (status === 'cancelled') {
    // Notification au restaurant
    await notificationService.createNotification({
      business_id: business.id,
      type: 'reservation_cancelled',
      title: 'Réservation annulée',
      message: `La réservation de ${reservation.client_name} pour le ${new Date(reservation.reservation_date).toLocaleDateString('fr-FR')} à ${reservation.time_slot} a été annulée`,
      reference_id: reservation.id,
      reference_type: 'reservation',
      priority: 'normal',
    });

    // ✅ Email au client
    if (reservation.client_email) {
      await emailService.sendReservationCancellation(reservation, business);
      logger.info('Email d\'annulation envoyé au client', {
        reservationId: reservation.id,
        clientEmail: reservation.client_email,
      });
    }

    // ✅ SMS au client
    if (reservation.client_phone) {
      const reservationDate = new Date(reservation.reservation_date).toLocaleDateString('fr-FR');
      const smsMessage = `Réservation annulée au ${business.name}. ` +
        `${reservationDate} à ${reservation.time_slot}. ` +
        `Pour toute question, contactez-nous.`;
      
      await smsService.sendSMS(reservation.client_phone, smsMessage);
      logger.info('SMS d\'annulation envoyé au client', {
        reservationId: reservation.id,
        clientPhone: reservation.client_phone,
      });
    }
  }

  logger.info('Statut de réservation mis à jour', {
    reservationId: id,
    newStatus: status,
    userId: req.user?.id,
  });

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
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Date requise',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const availableSlots = await Reservation.getAvailableTimeSlots(restaurantId, date);

  res.json({
    success: true,
    data: availableSlots,
  });
});

// Obtenir les statistiques des réservations
const getReservationStatistics = asyncHandler(async (req, res) => {
  const { restaurant_id } = req.query;

  let restaurantId = restaurant_id;
  if (!restaurantId && req.business && req.business.type === BUSINESS_TYPES.RESTAURANT) {
    restaurantId = req.business.id;
  }

  const statistics = await Reservation.getStatistics(restaurantId);

  res.json({
    success: true,
    data: statistics,
  });
});

// Obtenir toutes les réservations (admin)
const getAllReservations = asyncHandler(async (req, res) => {
  const { status } = req.query;

  const reservations = await Reservation.getAll({
    status,
  });

  res.json({
    success: true,
    data: reservations,
  });
});

module.exports = {
  createReservation,
  getReservationById,
  getRestaurantReservations,
  updateReservationStatus,
  getAvailableTimeSlots,
  getReservationStatistics,
  getAllReservations,
};