const Joi = require('joi');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');

// ✅ Méthodes de paiement valides — synchronisées avec constants.js VALID_PAYMENT_METHODS
const VALID_PAYMENT_METHODS = ['Mixx By Yas', 'flooz', 'card'];

// Schémas de validation
const schemas = {
  // Authentification
  register: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(6).required(),
    role: Joi.string().valid('client', 'restaurant', 'traiteur').required(),
    first_name: Joi.string().min(2).max(50).required(),
    last_name: Joi.string().min(2).max(50).required(),
    phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).optional().allow(''),
    business_name: Joi.string().min(2).max(255).when('role', {
      is: Joi.valid('restaurant', 'traiteur'),
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
    business_type: Joi.string().valid('restaurant', 'traiteur').when('role', {
      is: Joi.valid('restaurant', 'traiteur'),
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  }),

  login: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),

  updateProfile: Joi.object({
    first_name: Joi.string().min(2).max(50).optional(),
    last_name: Joi.string().min(2).max(50).optional(),
    phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).optional().allow(''),
  }),

  changePassword: Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string()
      .min(8)
      .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?])/)
      .required()
      .messages({
        'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule, une minuscule, un chiffre et un caractère spécial',
        'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
      }),
  }),

  // Business
  updateBusiness: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(''),
    address: Joi.string().max(500).optional().allow(''),
    phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).optional().allow(''),
  }),

  updateHours: Joi.object({
    opening_hour: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    closing_hour: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    availability_start: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
    availability_end: Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).optional(),
  }),

  // Menu
  createMenu: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    description: Joi.string().max(1000).optional().allow(''),
    is_active: Joi.boolean().optional(),
  }),

  updateMenu: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(''),
    is_active: Joi.boolean().optional(),
  }),

  // Menu Item
  createMenuItem: Joi.object({
    name: Joi.string().min(2).max(255).required(),
    description: Joi.string().max(1000).optional().allow(''),
    price: Joi.number().min(0).required(),
    category: Joi.string().max(100).optional().allow(''),
    is_available: Joi.boolean().optional(),
    image_url: Joi.string().uri().optional().allow(''),
  }),

  updateMenuItem: Joi.object({
    name: Joi.string().min(2).max(255).optional(),
    description: Joi.string().max(1000).optional().allow(''),
    price: Joi.number().min(0).optional(),
    category: Joi.string().max(100).optional().allow(''),
    is_available: Joi.boolean().optional(),
    image_url: Joi.string().uri().optional().allow(''),
  }),

  // ✅ Order — card ajouté
  createOrder: Joi.object({
    business_id:    Joi.number().integer().positive().required(),
    client_name:    Joi.string().min(2).max(255).required(),
    client_phone:   Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
    client_email:   Joi.string().email().optional().allow(''),
    payment_method: Joi.string().valid(...VALID_PAYMENT_METHODS).required(),
    notes:          Joi.string().max(1000).optional().allow(''),
    items: Joi.array().items(
      Joi.object({
        menu_item_id: Joi.number().integer().positive().required(),
        quantity:     Joi.number().integer().min(1).required(),
        unit_price:   Joi.number().min(0).required(),
      })
    ).min(1).required(),
  }),

  updateOrderStatus: Joi.object({
    status: Joi.string()
      .valid('pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled')
      .required(),
  }),

  // Commandes spéciales
  createSpecialOrder: Joi.object({
    business_id:          Joi.number().integer().positive().required(),
    client_name:          Joi.string().min(2).max(255).required(),
    client_email:         Joi.string().email().required(),
    client_phone:         Joi.string().pattern(/^[0-9]{8,15}$/).required(),
    event_type:           Joi.string().valid('mariage', 'anniversaire', 'bapteme', 'entreprise', 'reception', 'autre').required(),
    event_date:           Joi.date().min('now').required(),
    event_time:           Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    number_of_guests:     Joi.number().integer().min(1).max(10000).required(),
    delivery_address:     Joi.string().min(5).max(500).required(),
    city:                 Joi.string().min(2).max(100).required(),
    menu_preferences:     Joi.string().min(10).max(2000).required(),
    dietary_restrictions: Joi.string().max(1000).optional().allow('', null),
    special_requests:     Joi.string().max(1000).optional().allow('', null),
    estimated_budget:     Joi.number().min(0).optional().allow('', null),
  }),

  updateSpecialOrderStatus: Joi.object({
    status: Joi.string().valid('pending', 'confirmed', 'cancelled').required(),
  }),

  // Reservation
  createReservation: Joi.object({
    restaurant_id:    Joi.number().integer().positive().required(),
    client_name:      Joi.string().min(2).max(255).required(),
    client_phone:     Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
    client_email:     Joi.string().email().optional().allow(''),
    reservation_date: Joi.date().min('now').required(),
    time_slot:        Joi.string().pattern(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/).required(),
    number_of_people: Joi.number().integer().min(1).max(20).required(),
    special_requests: Joi.string().max(1000).optional().allow(''),
  }),

  updateReservationStatus: Joi.object({
    status: Joi.string().valid('pending', 'confirmed', 'cancelled').required(),
  }),

  // ✅ Payment — card ajouté, total_amount optionnel accepté
  initiatePayment: Joi.object({
    order_id:       Joi.number().integer().positive().required(),
    amount:         Joi.number().min(0).required(),
    currency:       Joi.string().length(3).default('XOF'),
    payment_method: Joi.string().valid(...VALID_PAYMENT_METHODS).required(),
    customer_name:  Joi.string().min(2).max(255).required(),
    customer_phone: Joi.string().pattern(/^\+?[0-9]{8,15}$/).required(),
    customer_email: Joi.string().email().optional().allow(''),
  }),
};

// Middleware de validation générique
const validate = (schemaName, source = 'body') => {
  return (req, res, next) => {
    const schema = schemas[schemaName];
    if (!schema) {
      console.error(`❌ Schéma de validation "${schemaName}" introuvable`);
      return res.status(500).json({
        success: false,
        message: 'Schéma de validation introuvable',
        code: ERROR_CODES.INTERNAL_ERROR,
      });
    }

    const data = source === 'params' ? req.params
               : source === 'query'  ? req.query
               : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly:    false,
      stripUnknown:  true,
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field:   detail.path.join('.'),
        message: detail.message,
      }));

      console.log('❌ Erreur de validation:', { schemaName, errors, receivedData: data });

      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Données invalides',
        code:    ERROR_CODES.VALIDATION_ERROR,
        errors,
      });
    }

    if (source === 'params')     req.params = value;
    else if (source === 'query') req.query  = value;
    else                         req.body   = value;

    next();
  };
};

// Validation des paramètres numériques
const validateNumericParam = (paramName) => {
  return (req, res, next) => {
    const value        = req.params[paramName];
    const numericValue = parseInt(value, 10);

    if (isNaN(numericValue) || numericValue <= 0) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: `Paramètre ${paramName} invalide`,
        code:    ERROR_CODES.VALIDATION_ERROR,
      });
    }

    req.params[paramName] = numericValue;
    next();
  };
};

module.exports = { validate, validateNumericParam, schemas };