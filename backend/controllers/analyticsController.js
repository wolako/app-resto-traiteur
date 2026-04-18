const { pool } = require('../config/db');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { trackEvent, hashIp } = require('../middleware/analyticsTracker');

// ════════════════════════════════════════════════════════════
// GET /api/analytics/business/:id/overview
// ✅ CORRIGÉ : fusionne orders + special_orders selon le type
// ════════════════════════════════════════════════════════════
const getBusinessOverview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { period = '30' } = req.query;

  // Récupérer le type du business
  const bizResult = await pool.query(
    'SELECT type FROM businesses WHERE id = $1', [id]
  );
  const businessType = bizResult.rows[0]?.type ?? 'restaurant';

  // ── Événements analytics (vues, clics, sessions) ─────────
  const eventsResult = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'page_view')              AS total_page_views,
      COUNT(*) FILTER (WHERE event_type = 'menu_click')             AS total_menu_clicks,
      COUNT(*) FILTER (WHERE event_type = 'item_click')             AS total_item_clicks,
      COUNT(*) FILTER (WHERE event_type = 'order_started')          AS total_orders_started,
      COUNT(*) FILTER (WHERE event_type = 'order_completed')        AS total_orders_completed,
      COUNT(*) FILTER (WHERE event_type = 'reservation_started')    AS total_reservations_started,
      COUNT(*) FILTER (WHERE event_type = 'reservation_completed')  AS total_reservations_completed,
      COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS total_sessions
    FROM analytics_events
    WHERE business_id = $1
      AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
  `, [id, period]);

  const ev = eventsResult.rows[0];

  // ── Comptages réels depuis les tables métier ──────────────
  // Commandes normales (restaurants et traiteurs)
  const ordersResult = await pool.query(`
    SELECT COUNT(*) AS count
    FROM orders
    WHERE business_id = $1
      AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
      AND status NOT IN ('cancelled')
  `, [id, period]);

  // Commandes spéciales (traiteurs principalement)
  const specialOrdersResult = await pool.query(`
    SELECT COUNT(*) AS count
    FROM special_orders
    WHERE business_id = $1
      AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
      AND status NOT IN ('cancelled')
  `, [id, period]);

  // Réservations (restaurants)
  const reservationsResult = await pool.query(`
    SELECT COUNT(*) AS count
    FROM reservations
    WHERE restaurant_id = $1
      AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
      AND status != 'cancelled'
  `, [id, period]);

  const realOrders      = parseInt(ordersResult.rows[0].count);
  const realSpecial     = parseInt(specialOrdersResult.rows[0].count);
  const realReservations = parseInt(reservationsResult.rows[0].count);

  // ── Taux de conversion ────────────────────────────────────
  // Pour les traiteurs : conversion = special_orders / sessions
  // Pour les restaurants : conversion classique order_started → order_completed
  let orderConversion = 0;
  let reservationConversion = 0;

  if (businessType === 'traiteur') {
    // Taux de conversion traiteur : commandes spéciales / vues de page
    const views = parseInt(ev.total_page_views) || 0;
    orderConversion = views > 0
      ? Math.round((realSpecial / views) * 100)
      : 0;
  } else {
    const started = parseInt(ev.total_orders_started) || 0;
    const completed = parseInt(ev.total_orders_completed) || 0;
    orderConversion = started > 0
      ? Math.round((completed / started) * 100)
      : 0;

    const resStarted   = parseInt(ev.total_reservations_started)   || 0;
    const resCompleted = parseInt(ev.total_reservations_completed) || 0;
    reservationConversion = resStarted > 0
      ? Math.round((resCompleted / resStarted) * 100)
      : 0;
  }

  res.json({
    success: true,
    data: {
      period:            parseInt(period),
      business_type:     businessType,
      // Événements analytics
      total_page_views:              parseInt(ev.total_page_views)           || 0,
      total_menu_clicks:             parseInt(ev.total_menu_clicks)          || 0,
      total_item_clicks:             parseInt(ev.total_item_clicks)          || 0,
      total_orders_started:          parseInt(ev.total_orders_started)       || 0,
      total_orders_completed:        parseInt(ev.total_orders_completed)     || 0,
      total_reservations_started:    parseInt(ev.total_reservations_started) || 0,
      total_reservations_completed:  parseInt(ev.total_reservations_completed) || 0,
      total_sessions:                parseInt(ev.total_sessions)             || 0,
      // Comptages réels depuis tables métier
      real_orders_count:             realOrders,
      real_special_orders_count:     realSpecial,
      real_reservations_count:       realReservations,
      // Taux de conversion
      order_conversion_rate:         orderConversion,
      reservation_conversion_rate:   reservationConversion,
    }
  });
});

// ════════════════════════════════════════════════════════════
// GET /api/analytics/business/:id/popular-items
// ════════════════════════════════════════════════════════════
const getPopularItems = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { limit = 10, period = '30' } = req.query;

  // ✅ Pour les traiteurs, on complète avec les items des commandes réelles
  // car les analytics_events item_click peuvent être vides
  const result = await pool.query(`
    SELECT
      mi.id                   AS menu_item_id,
      mi.name                 AS item_name,
      mi.price,
      m.name                  AS menu_name,
      COALESCE(ae_data.total_clicks, 0)  AS total_clicks,
      COALESCE(oi_data.total_orders, 0)  AS total_orders,
      CASE
        WHEN COALESCE(ae_data.total_clicks, 0) > 0
        THEN ROUND(
          (COALESCE(oi_data.total_orders, 0)::numeric
           / ae_data.total_clicks) * 100, 1)
        ELSE 0
      END AS conversion_rate
    FROM menu_items mi
    JOIN menus m ON m.id = mi.menu_id
    -- Clics analytics
    LEFT JOIN (
      SELECT menu_item_id, COUNT(*) AS total_clicks
      FROM analytics_events
      WHERE business_id = $1
        AND event_type = 'item_click'
        AND menu_item_id IS NOT NULL
        AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
      GROUP BY menu_item_id
    ) ae_data ON ae_data.menu_item_id = mi.id
    -- Commandes réelles (order_items)
    LEFT JOIN (
      SELECT oi.menu_item_id, COUNT(*) AS total_orders
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      WHERE o.business_id = $1
        AND o.status NOT IN ('cancelled')
        AND o.created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
      GROUP BY oi.menu_item_id
    ) oi_data ON oi_data.menu_item_id = mi.id
    WHERE m.business_id = $1
      AND mi.is_available = true
      AND (COALESCE(ae_data.total_clicks, 0) > 0 OR COALESCE(oi_data.total_orders, 0) > 0)
    ORDER BY total_orders DESC, total_clicks DESC
    LIMIT $3
  `, [id, period, limit]);

  res.json({ success: true, data: result.rows });
});

// ════════════════════════════════════════════════════════════
// GET /api/analytics/business/:id/conversion
// ════════════════════════════════════════════════════════════
const getConversionRate = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { period = '30' } = req.query;

  const bizResult = await pool.query(
    'SELECT type FROM businesses WHERE id = $1', [id]
  );
  const businessType = bizResult.rows[0]?.type ?? 'restaurant';

  const result = await pool.query(`
    SELECT
      DATE(created_at) AS date,
      COUNT(*) FILTER (WHERE event_type = 'page_view')              AS page_views,
      COUNT(*) FILTER (WHERE event_type = 'order_started')          AS orders_started,
      COUNT(*) FILTER (WHERE event_type = 'order_completed')        AS orders_completed,
      COUNT(*) FILTER (WHERE event_type = 'reservation_started')    AS reservations_started,
      COUNT(*) FILTER (WHERE event_type = 'reservation_completed')  AS reservations_completed,
      COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL) AS unique_sessions,
      CASE
        WHEN COUNT(*) FILTER (WHERE event_type = 'order_started') > 0
        THEN ROUND(
          (COUNT(*) FILTER (WHERE event_type = 'order_completed')::numeric
           / COUNT(*) FILTER (WHERE event_type = 'order_started')) * 100, 1)
        ELSE 0
      END AS order_conversion_rate,
      CASE
        WHEN COUNT(*) FILTER (WHERE event_type = 'reservation_started') > 0
        THEN ROUND(
          (COUNT(*) FILTER (WHERE event_type = 'reservation_completed')::numeric
           / COUNT(*) FILTER (WHERE event_type = 'reservation_started')) * 100, 1)
        ELSE 0
      END AS reservation_conversion_rate
    FROM analytics_events
    WHERE business_id = $1
      AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `, [id, period]);

  // ✅ Pour les traiteurs : enrichir avec les commandes spéciales réelles par jour
  let rows = result.rows;

  if (businessType === 'traiteur') {
    const specialResult = await pool.query(`
      SELECT
        DATE(created_at) AS date,
        COUNT(*) AS special_orders_count
      FROM special_orders
      WHERE business_id = $1
        AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
        AND status != 'cancelled'
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [id, period]);

    const specialByDate = Object.fromEntries(
      specialResult.rows.map(r => [r.date.toISOString().split('T')[0], parseInt(r.special_orders_count)])
    );

    // Fusionner — si pas d'events analytics, créer la ligne depuis special_orders
    const datesInEvents = new Set(rows.map(r => new Date(r.date).toISOString().split('T')[0]));

    Object.entries(specialByDate).forEach(([date, count]) => {
      if (!datesInEvents.has(date)) {
        rows.push({
          date, page_views: 0, orders_started: 0, orders_completed: count,
          reservations_started: 0, reservations_completed: 0, unique_sessions: 0,
          order_conversion_rate: 0, reservation_conversion_rate: 0,
          special_orders_count: count,
        });
      } else {
        const row = rows.find(r => new Date(r.date).toISOString().split('T')[0] === date);
        if (row) row.special_orders_count = count;
      }
    });

    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }

  res.json({ success: true, data: rows });
});

// ════════════════════════════════════════════════════════════
// GET /api/analytics/business/:id/timeline
// ════════════════════════════════════════════════════════════
const getTimeline = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { period = '30', granularity = 'day' } = req.query;

  const bizResult = await pool.query(
    'SELECT type FROM businesses WHERE id = $1', [id]
  );
  const businessType = bizResult.rows[0]?.type ?? 'restaurant';

  const allowed = ['day', 'week', 'month'];
  const dateTrunc = allowed.includes(granularity) ? granularity : 'day';

  const result = await pool.query(`
    SELECT
      DATE_TRUNC($3, created_at)                                          AS period,
      COUNT(*) FILTER (WHERE event_type = 'page_view')                   AS page_views,
      COUNT(*) FILTER (WHERE event_type = 'menu_click')                  AS menu_clicks,
      COUNT(*) FILTER (WHERE event_type = 'item_click')                  AS item_clicks,
      COUNT(*) FILTER (WHERE event_type = 'order_completed')             AS orders_completed,
      COUNT(*) FILTER (WHERE event_type = 'reservation_completed')       AS reservations_completed,
      COUNT(DISTINCT session_id) FILTER (WHERE session_id IS NOT NULL)   AS unique_sessions
    FROM analytics_events
    WHERE business_id = $1
      AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
    GROUP BY DATE_TRUNC($3, created_at)
    ORDER BY period ASC
  `, [id, period, dateTrunc]);

  // ✅ Pour les traiteurs : enrichir timeline avec les commandes spéciales réelles
  let rows = result.rows;

  if (businessType === 'traiteur') {
    const specialTimeline = await pool.query(`
      SELECT
        DATE_TRUNC($3, created_at) AS period,
        COUNT(*) AS special_orders_count
      FROM special_orders
      WHERE business_id = $1
        AND created_at >= CURRENT_TIMESTAMP - ($2 || ' days')::INTERVAL
        AND status != 'cancelled'
      GROUP BY DATE_TRUNC($3, created_at)
      ORDER BY period ASC
    `, [id, period, dateTrunc]);

    const specialByPeriod = Object.fromEntries(
      specialTimeline.rows.map(r => [r.period.toISOString(), parseInt(r.special_orders_count)])
    );

    const periodsInEvents = new Set(rows.map(r => new Date(r.period).toISOString()));

    Object.entries(specialByPeriod).forEach(([p, count]) => {
      if (!periodsInEvents.has(p)) {
        rows.push({
          period: p, page_views: 0, menu_clicks: 0, item_clicks: 0,
          orders_completed: count, reservations_completed: 0, unique_sessions: 0,
          special_orders_count: count,
        });
      } else {
        const row = rows.find(r => new Date(r.period).toISOString() === p);
        if (row) {
          row.special_orders_count = count;
          // Pour les traiteurs, orders_completed = special_orders si analytics vides
          if (parseInt(row.orders_completed) === 0) {
            row.orders_completed = count;
          }
        }
      }
    });

    rows.sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime());
  }

  res.json({ success: true, data: rows });
});

// ════════════════════════════════════════════════════════════
// GET /api/analytics/admin/global
// ✅ CORRIGÉ : + réservations dans top_businesses
// ════════════════════════════════════════════════════════════
const getGlobalStats = asyncHandler(async (req, res) => {
  const { period = '30' } = req.query;

  const [overview, topBusinesses, eventTypes] = await Promise.all([

    pool.query(`
      SELECT
        (SELECT COUNT(*) FROM businesses WHERE is_active = true) AS active_businesses,

        (
          SELECT COUNT(*) FROM orders
          WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            AND status != 'cancelled'
        ) + (
          SELECT COUNT(*) FROM special_orders
          WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            AND status != 'cancelled'
        ) AS total_orders,

        (
          SELECT COUNT(*) FROM reservations
          WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            AND status != 'cancelled'
        ) AS total_reservations,

        (
          SELECT COUNT(DISTINCT session_id) FROM analytics_events
          WHERE session_id IS NOT NULL
            AND created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ) AS total_sessions,

        (
          SELECT COUNT(*) FROM analytics_events
          WHERE event_type = 'page_view'
            AND created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ) AS total_page_views,

        (
          SELECT COUNT(*) FROM orders
          WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            AND status != 'cancelled'
        ) AS total_normal_orders,

        (
          SELECT COUNT(*) FROM special_orders
          WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
            AND status != 'cancelled'
        ) AS total_special_orders
    `, [period]),

    // ✅ Top businesses avec réservations
    pool.query(`
      SELECT
        b.id           AS business_id,
        b.name         AS business_name,
        b.type         AS business_type,

        COALESCE((
          SELECT COUNT(*) FROM orders o
          WHERE o.business_id = b.id
            AND o.status != 'cancelled'
            AND o.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ), 0) AS normal_orders_count,

        COALESCE((
          SELECT COUNT(*) FROM special_orders so
          WHERE so.business_id = b.id
            AND so.status != 'cancelled'
            AND so.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ), 0) AS special_orders_count,

        -- ✅ NOUVEAU : réservations
        COALESCE((
          SELECT COUNT(*) FROM reservations r
          WHERE r.restaurant_id = b.id
            AND r.status != 'cancelled'
            AND r.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ), 0) AS reservations_count,

        COALESCE((
          SELECT COUNT(*) FROM orders o
          WHERE o.business_id = b.id
            AND o.status != 'cancelled'
            AND o.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ), 0) + COALESCE((
          SELECT COUNT(*) FROM special_orders so
          WHERE so.business_id = b.id
            AND so.status != 'cancelled'
            AND so.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ), 0) AS orders_completed,

        COALESCE((
          SELECT COUNT(*) FROM analytics_events ae
          WHERE ae.business_id = b.id
            AND ae.event_type = 'page_view'
            AND ae.created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
        ), 0) AS page_views

      FROM businesses b
      WHERE b.is_active = true
      ORDER BY orders_completed DESC, page_views DESC
      LIMIT 10
    `, [period]),

    pool.query(`
      SELECT event_type, COUNT(*) AS count
      FROM analytics_events
      WHERE created_at >= CURRENT_TIMESTAMP - ($1 || ' days')::INTERVAL
      GROUP BY event_type
      ORDER BY count DESC
    `, [period]),
  ]);

  logger.info('Analytics global récupéré', { userId: req.user.id, period });

  res.json({
    success: true,
    data: {
      period:          parseInt(period),
      overview:        overview.rows[0],
      top_businesses:  topBusinesses.rows,
      event_breakdown: eventTypes.rows,
    },
  });
});

// ════════════════════════════════════════════════════════════
// POST /api/analytics/track
// ✅ CORRIGÉ : page_view autorisé pour le tracking frontend
// ════════════════════════════════════════════════════════════
const trackClientEvent = asyncHandler(async (req, res) => {
  const { event_type, business_id, menu_id, menu_item_id, metadata } = req.body;

  // ✅ page_view ajouté — indispensable pour compter les visites
  const allowedEvents = [
    'page_view',
    'item_click',
    'menu_click',
    'order_started',
    'reservation_started',
  ];

  if (!allowedEvents.includes(event_type)) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Type d\'événement non autorisé',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  if (!business_id) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'business_id requis',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  await trackEvent(business_id, event_type, {
    menuId:      menu_id      || null,
    menuItemId:  menu_item_id || null,
    sessionId:   req.headers['x-session-id'] || null,
    ipHash:      hashIp(req.ip),
    userAgent:   req.headers['user-agent'] || null,
    userId:      req.user?.id || null,
    metadata:    metadata || {},
  });

  res.json({ success: true, message: 'Événement enregistré' });
});

module.exports = {
  getBusinessOverview,
  getPopularItems,
  getConversionRate,
  getTimeline,
  getGlobalStats,
  trackClientEvent
};