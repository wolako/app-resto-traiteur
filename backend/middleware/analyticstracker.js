const { pool } = require('../config/db');
const crypto = require('crypto');

function hashIp(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + process.env.JWT_SECRET).digest('hex').substring(0, 16);
}

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
    || req.headers['x-real-ip']
    || req.connection?.remoteAddress
    || null;
}

async function trackEvent(businessId, eventType, options = {}) {
  if (!businessId || !eventType) return;
  try {
    await pool.query(
      `INSERT INTO analytics_events
         (business_id, event_type, menu_id, menu_item_id, order_id, reservation_id,
          session_id, user_id, is_authenticated, metadata, ip_hash, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        businessId,
        eventType,
        options.menuId        || null,
        options.menuItemId    || null,
        options.orderId       || null,
        options.reservationId || null,
        options.sessionId     || null,
        options.userId        || null,
        options.isAuthenticated || false,
        JSON.stringify(options.metadata || {}),
        options.ipHash        || null,
        options.userAgent     || null,
      ]
    );
  } catch (err) {
    console.error('[Analytics] Erreur tracking silencieuse:', err.message);
  }
}

const trackMenuPageView = (req, res, next) => {
  const businessId = parseInt(req.params.id || req.params.businessId);
  if (businessId) {
    setImmediate(() => trackEvent(businessId, 'page_view', {
      sessionId:       req.headers['x-session-id'] || null,
      userId:          req.user?.id || null,
      isAuthenticated: !!req.user,
      ipHash:          hashIp(getClientIp(req)),
      userAgent:       req.headers['user-agent']?.substring(0, 200) || null,
    }));
  }
  next();
};

const trackMenuClick = (req, res, next) => {
  const businessId = parseInt(req.params.businessId || req.params.id);
  if (businessId) {
    setImmediate(() => trackEvent(businessId, 'menu_click', {
      sessionId:       req.headers['x-session-id'] || null,
      userId:          req.user?.id || null,
      isAuthenticated: !!req.user,
      ipHash:          hashIp(getClientIp(req)),
    }));
  }
  next();
};

// ✅ Commandes normales (restaurants)
const trackOrderCompleted = async (businessId, orderId, userId, sessionId) => {
  await trackEvent(businessId, 'order_completed', {
    orderId,
    userId,
    sessionId,
    isAuthenticated: !!userId,
  });
};

// ✅ NOUVEAU : Commandes spéciales (traiteurs)
// Les special_orders ne passent pas par order_completed
// mais on peut tracker l'événement pour alimenter les charts
const trackSpecialOrderCompleted = async (businessId, specialOrderId, userId, sessionId) => {
  // On utilise order_completed pour unifier les charts
  // Le champ metadata identifie le type
  await trackEvent(businessId, 'order_completed', {
    orderId:        null,
    userId,
    sessionId,
    isAuthenticated: !!userId,
    metadata: { type: 'special_order', special_order_id: specialOrderId },
  });
};

// ✅ NOUVEAU : Commande spéciale démarrée (soumission formulaire)
const trackSpecialOrderStarted = async (businessId, userId, sessionId) => {
  await trackEvent(businessId, 'order_started', {
    userId,
    sessionId,
    isAuthenticated: !!userId,
    metadata: { type: 'special_order' },
  });
};

const trackReservationCompleted = async (businessId, reservationId, userId, sessionId) => {
  await trackEvent(businessId, 'reservation_completed', {
    reservationId,
    userId,
    sessionId,
    isAuthenticated: !!userId,
  });
};

const trackItemClick = async (businessId, menuItemId, sessionId, userId) => {
  await trackEvent(businessId, 'item_click', {
    menuItemId,
    sessionId,
    userId,
    isAuthenticated: !!userId,
  });
};

module.exports = {
  trackEvent,
  trackMenuPageView,
  trackMenuClick,
  trackOrderCompleted,
  trackSpecialOrderCompleted,
  trackSpecialOrderStarted,
  trackReservationCompleted,
  trackItemClick,
  hashIp,
  getClientIp,
};