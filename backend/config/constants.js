module.exports = {
  USER_ROLES: {
    CLIENT: 'client',
    RESTAURANT: 'restaurant',
    TRAITEUR: 'traiteur',
    SUPER_ADMIN: 'superadmin',
    DRIVER:      'driver',
  },

  BUSINESS_TYPES: {
    RESTAURANT: 'restaurant',
    TRAITEUR: 'traiteur',
  },

  ORDER_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PREPARING: 'preparing',
    READY: 'ready',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
  },

  PAYMENT_STATUS: {
    PENDING: 'pending',
    PAID: 'paid',
    FAILED: 'failed',
  },

  // ✅ CORRIGÉ : casse exacte cohérente avec la DB + ajout carte bancaire
  PAYMENT_METHODS: {
    MIXX:  'Mixx By Yas',
    FLOOZ: 'flooz',
    CARD:  'card',
  },

  // ✅ Liste utilisée pour la validation (remplace Joi si pas de validators)
  VALID_PAYMENT_METHODS: ['Mixx By Yas', 'flooz', 'card'],

  RESERVATION_STATUS: {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    CANCELLED: 'cancelled',
  },

  CINETPAY_STATUS: {
    PENDING: 'pending',
    SUCCESS: 'success',
    FAILED: 'failed',
  },

  ERROR_CODES: {
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    CONFLICT: 'CONFLICT',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    PAYMENT_ERROR: 'PAYMENT_ERROR',
    MAINTENANCE_MODE: 'MAINTENANCE_MODE',
  },

  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  },
};