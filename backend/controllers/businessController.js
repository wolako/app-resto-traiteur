// controllers/businessController.js
const Business = require('../models/Business');
const Menu     = require('../models/Menu');
const { HTTP_STATUS, ERROR_CODES, BUSINESS_TYPES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { pool } = require('../config/db');

// ═══════════════════════════════════════════════════════════════════
// Obtenir tous les établissements (public)
//
// ✅ FIX : éviter le conflit de nom avec b.*
// SELECT b.* contient déjà b.cover_image_url (peut être NULL si migration absente)
// COALESCE(b.cover_image_url, br.cover_image_url) AS cover_image_url crée un doublon
// Le driver pg retourne la DERNIÈRE colonne avec ce nom
// Pour être sûr, on liste explicitement les colonnes de b sans cover_image_url
// et on calcule cover_image_url via COALESCE une seule fois
// ═══════════════════════════════════════════════════════════════════
const getAllBusinesses = asyncHandler(async (req, res) => {
  const { type, search, premium_first = 'true' } = req.query;

  let query = `
    SELECT
      b.id, b.user_id, b.name, b.type, b.description, b.address, b.phone,
      b.opening_hour, b.closing_hour, b.availability_start, b.availability_end,
      b.is_available, b.is_active, b.average_rating, b.reviews_count,
      b.cinetpay_merchant_id, b.requires_reservation_deposit,
      b.default_deposit_amount, b.default_special_order_deposit_percentage,
      b.slug, b.tagline, b.created_at, b.updated_at,
      -- ✅ cover_image_url calculé une seule fois, sans doublon avec b.*
      COALESCE(b.cover_image_url, br.cover_image_url) AS cover_image_url,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM business_subscriptions bs2
          JOIN subscription_plans sp2 ON bs2.plan_id = sp2.id
          WHERE bs2.business_id = b.id AND bs2.status = 'active'
          AND sp2.name LIKE 'premium%'
        ) THEN true ELSE false
      END AS is_premium,
      sp.display_name AS plan_name,
      sp.name         AS plan_code,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count,  0) AS reviews_count
    FROM businesses b
    LEFT JOIN business_branding br      ON b.id = br.business_id
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp     ON bs.plan_id = sp.id
    WHERE b.is_active = true
  `;

  const params = [];
  if (type && Object.values(BUSINESS_TYPES).includes(type)) {
    params.push(type);
    query += ` AND b.type = $${params.length}`;
  }
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (b.name ILIKE $${params.length} OR b.description ILIKE $${params.length})`;
  }

  query += premium_first === 'true'
    ? ` ORDER BY CASE WHEN sp.name LIKE 'premium%' THEN 1 ELSE 2 END, b.average_rating DESC NULLS LAST, b.created_at DESC`
    : ` ORDER BY b.average_rating DESC NULLS LAST, b.created_at DESC`;

  const result = await pool.query(query, params);
  console.log('[getAllBusinesses] Exemple cover_image_url:', 
    result.rows.slice(0, 3).map(r => ({ id: r.id, cover: r.cover_image_url }))
  );
  res.json({ success: true, data: result.rows });
});

// ═══════════════════════════════════════════════════════════════════
// Restaurants
// ═══════════════════════════════════════════════════════════════════
const getRestaurants = asyncHandler(async (req, res) => {
  const { premium_first = 'true' } = req.query;
  let query = `
    SELECT
      b.id, b.user_id, b.name, b.type, b.description, b.address, b.phone,
      b.opening_hour, b.closing_hour, b.is_available, b.is_active,
      b.requires_reservation_deposit, b.default_deposit_amount,
      b.slug, b.tagline, b.created_at, b.updated_at,
      COALESCE(b.cover_image_url, br.cover_image_url) AS cover_image_url,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count,  0) AS reviews_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM business_subscriptions bs2
        JOIN subscription_plans sp2 ON bs2.plan_id = sp2.id
        WHERE bs2.business_id = b.id AND bs2.status = 'active' AND sp2.name LIKE 'premium%'
      ) THEN true ELSE false END AS is_premium,
      sp.display_name AS plan_name
    FROM businesses b
    LEFT JOIN business_branding br      ON b.id = br.business_id
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp     ON bs.plan_id = sp.id
    WHERE b.is_active = true AND b.type = $1
  `;
  query += premium_first === 'true'
    ? ` ORDER BY CASE WHEN sp.name LIKE 'premium%' THEN 1 ELSE 2 END, b.average_rating DESC NULLS LAST, b.created_at DESC`
    : ` ORDER BY b.average_rating DESC NULLS LAST, b.created_at DESC`;

  const result = await pool.query(query, [BUSINESS_TYPES.RESTAURANT]);
  res.json({ success: true, data: result.rows });
});

// ═══════════════════════════════════════════════════════════════════
// Traiteurs disponibles
// ═══════════════════════════════════════════════════════════════════
const getAvailableCaterers = asyncHandler(async (req, res) => {
  const { premium_first = 'true' } = req.query;
  let query = `
    SELECT
      b.id, b.user_id, b.name, b.type, b.description, b.address, b.phone,
      b.availability_start, b.availability_end, b.is_available, b.is_active,
      b.default_special_order_deposit_percentage,
      b.slug, b.tagline, b.created_at, b.updated_at,
      COALESCE(b.cover_image_url, br.cover_image_url) AS cover_image_url,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count,  0) AS reviews_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM business_subscriptions bs2
        JOIN subscription_plans sp2 ON bs2.plan_id = sp2.id
        WHERE bs2.business_id = b.id AND bs2.status = 'active' AND sp2.name LIKE 'premium%'
      ) THEN true ELSE false END AS is_premium,
      sp.display_name AS plan_name
    FROM businesses b
    LEFT JOIN business_branding br      ON b.id = br.business_id
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp     ON bs.plan_id = sp.id
    WHERE b.is_active = true AND b.type = $1 AND b.is_available = true
  `;
  query += premium_first === 'true'
    ? ` ORDER BY CASE WHEN sp.name LIKE 'premium%' THEN 1 ELSE 2 END, b.average_rating DESC NULLS LAST, b.created_at DESC`
    : ` ORDER BY b.average_rating DESC NULLS LAST, b.created_at DESC`;

  const result = await pool.query(query, [BUSINESS_TYPES.TRAITEUR]);
  res.json({ success: true, data: result.rows });
});

// ═══════════════════════════════════════════════════════════════════
// Établissement par ID
// ═══════════════════════════════════════════════════════════════════
const getBusinessById = asyncHandler(async (req, res) => {
  const result = await pool.query(
    `SELECT b.*,
       CASE WHEN EXISTS (
         SELECT 1 FROM business_subscriptions bs JOIN subscription_plans sp ON bs.plan_id = sp.id
         WHERE bs.business_id = b.id AND bs.status = 'active' AND sp.name = 'premium'
       ) THEN true ELSE false END AS is_premium,
       sp.display_name AS plan_name,
       COALESCE(b.average_rating, 0) AS average_rating,
       COALESCE(b.reviews_count,  0) AS reviews_count
     FROM businesses b
     LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
     LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
     WHERE b.id = $1`,
    [req.params.id]
  );
  if (!result.rows.length) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND });
  res.json({ success: true, data: result.rows[0] });
});

// ═══════════════════════════════════════════════════════════════════
// PROFIL PUBLIC COMPLET
//
// Règles INCHANGÉES par rapport à la logique initiale :
// - banner_url profil : conditionnel hasBranding (Premium uniquement)
// - cover_image_url   : carte home uniquement, jamais dans le profil
// - Si plan non-Premium : branding.banner_url = null → image par défaut dans profil
// ═══════════════════════════════════════════════════════════════════
const getPublicProfile = async (req, res) => {
  try {
    const { id } = req.params;

    const bizResult = await pool.query(
      `SELECT
         b.id, b.name, b.type, b.description, b.address, b.phone,
         b.opening_hour, b.closing_hour,
         b.availability_start, b.availability_end,
         b.is_available, b.average_rating, b.reviews_count,
         b.slug, b.tagline,
         b.requires_reservation_deposit, b.default_deposit_amount,
         b.default_special_order_deposit_percentage,
         -- Branding depuis business_branding
         br.primary_color, br.secondary_color, br.accent_color,
         br.logo_url, br.logo_square_url,
         br.banner_url, br.banner_mobile_url,
         br.gallery_urls,
         br.tagline        AS branding_tagline,
         br.footer_text,
         br.facebook_url, br.instagram_url, br.whatsapp_number, br.tiktok_url,
         br.opening_hours_text,
         br.highlight_1_icon, br.highlight_1_text,
         br.highlight_2_icon, br.highlight_2_text,
         br.highlight_3_icon, br.highlight_3_text,
         br.highlights, br.payment_methods, br.practical_note,
         -- Plan
         sp.name           AS plan_code,
         sp.custom_branding
       FROM businesses b
       LEFT JOIN business_branding br      ON b.id = br.business_id
       LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
       LEFT JOIN subscription_plans sp     ON bs.plan_id = sp.id
       WHERE b.id = $1 AND b.is_active = true`,
      [id]
    );

    if (!bizResult.rows.length) {
      return res.status(404).json({ success: false, error: 'Établissement introuvable' });
    }

    const b = bizResult.rows[0];

    // Menus
    const menusResult = await pool.query(
      `SELECT m.id, m.name, m.description,
         COALESCE(JSON_AGG(
           JSON_BUILD_OBJECT('id',mi.id,'name',mi.name,'description',mi.description,
             'price',mi.price,'category',mi.category,'image_url',mi.image_url,'is_available',mi.is_available)
           ORDER BY mi.category, mi.name
         ) FILTER (WHERE mi.id IS NOT NULL AND mi.is_available = true), '[]') AS items
       FROM menus m
       LEFT JOIN menu_items mi ON m.id = mi.menu_id
       WHERE m.business_id = $1 AND m.is_active = true
       GROUP BY m.id ORDER BY m.name`,
      [id]
    );

    // Avis récents
    const reviewsResult = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.is_guest,
         r.guest_name, r.response, r.responded_at,
         CASE WHEN r.is_guest THEN r.guest_name
              ELSE u.first_name || ' ' || LEFT(u.last_name, 1) || '.'
         END AS user_name
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       WHERE r.business_id = $1 AND r.status = 'approved'
       ORDER BY r.created_at DESC LIMIT 5`,
      [id]
    );

    // Distribution notes
    const distResult = await pool.query(
      `SELECT rating, COUNT(*) AS count FROM reviews WHERE business_id = $1 AND status = 'approved' GROUP BY rating`,
      [id]
    );
    const ratingDistribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    distResult.rows.forEach(r => { ratingDistribution[r.rating] = parseInt(r.count); });

    // ─── Logique branding INCHANGÉE ──────────────────────────
    // hasBranding = Premium avec custom_branding
    // banner_url profil : conditionnel hasBranding
    // cover_image_url   : jamais dans le profil
    const hasBranding = !!b.custom_branding;

    let highlights = [];
    if (hasBranding) {
      if (Array.isArray(b.highlights) && b.highlights.length > 0) {
        highlights = b.highlights.filter(h => h?.text?.trim());
      } else {
        highlights = [
          b.highlight_1_text ? { icon: b.highlight_1_icon || 'bi-award', text: b.highlight_1_text } : null,
          b.highlight_2_text ? { icon: b.highlight_2_icon || 'bi-clock', text: b.highlight_2_text } : null,
          b.highlight_3_text ? { icon: b.highlight_3_icon || 'bi-geo-alt', text: b.highlight_3_text } : null,
        ].filter(Boolean);
      }
    }

    const branding = {
      primary_color:     (hasBranding && b.primary_color)     || '#1a1a2e',
      secondary_color:   (hasBranding && b.secondary_color)   || '#6c757d',
      accent_color:      (hasBranding && b.accent_color)      || '#e8a87c',
      logo_url:          (hasBranding && b.logo_url)          || null,
      logo_square_url:   (hasBranding && b.logo_square_url)   || null,

      // ✅ GUARD STRICT : banner_url ne peut JAMAIS être une URL de cover
      // Une URL de cover contient 'covers/' ou 'cover-business-' dans son chemin
      banner_url: (() => {
        if (!hasBranding || !b.banner_url) return null;
        const url = b.banner_url.trim();
        // Rejeter toute URL qui ressemble à une cover
        if (url.includes('/covers/') || url.includes('cover-business-')) {
          console.warn(`[getPublicProfile] GUARD: banner_url contient une cover pour business ${b.id}: ${url}`);
          return null;
        }
        return url;
      })(),

      banner_mobile_url: (() => {
        if (!hasBranding || !b.banner_mobile_url) return null;
        const url = b.banner_mobile_url.trim();
        if (url.includes('/covers/') || url.includes('cover-business-')) return null;
        return url;
      })(),

      gallery_urls:      (hasBranding && b.gallery_urls)      || [],
      tagline:           b.branding_tagline || b.tagline      || null,
      footer_text:       (hasBranding && b.footer_text)       || null,
      facebook_url:      (hasBranding && b.facebook_url)      || null,
      instagram_url:     (hasBranding && b.instagram_url)     || null,
      whatsapp_number:   (hasBranding && b.whatsapp_number)   || null,
      tiktok_url:        (hasBranding && b.tiktok_url)        || null,
      opening_hours_text:(hasBranding && b.opening_hours_text)|| null,
      payment_methods:   (hasBranding && b.payment_methods)   || [],
      practical_note:    (hasBranding && b.practical_note)    || null,
      highlights,
    };

    res.json({
      success: true,
      data: {
        id: b.id, name: b.name, type: b.type, description: b.description,
        address: b.address, phone: b.phone,
        opening_hour: b.opening_hour, closing_hour: b.closing_hour,
        availability_start: b.availability_start, availability_end: b.availability_end,
        is_available: b.is_available,
        average_rating: parseFloat(b.average_rating) || 0,
        reviews_count:  parseInt(b.reviews_count)    || 0,
        slug: b.slug, tagline: b.tagline,
        requires_reservation_deposit: b.requires_reservation_deposit,
        default_deposit_amount: b.default_deposit_amount,
        default_special_order_deposit_percentage: b.default_special_order_deposit_percentage,
        is_premium: hasBranding, plan_code: b.plan_code,
        branding,
        menus:               menusResult.rows,
        recent_reviews:      reviewsResult.rows,
        rating_distribution: ratingDistribution,
      }
    });

  } catch (error) {
    console.error('❌ Erreur getPublicProfile:', error);
    res.status(500).json({ success: false, error: 'Erreur serveur' });
  }
};

// ─── Méthodes de gestion (inchangées) ────────────────────────
const updateBusiness = asyncHandler(async (req, res) => {
  const business = await Business.update(req.params.id, req.body);
  if (!business) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND });
  logger.info('Établissement mis à jour', { businessId: req.params.id, userId: req.user.id });
  res.json({ success: true, message: 'Établissement mis à jour', data: business });
   
});

const updateHours = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = {};
  const business = await Business.findById(id);
  if (!business) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND });
  if (business.type === BUSINESS_TYPES.RESTAURANT) {
    if (req.body.opening_hour) updates.opening_hour = req.body.opening_hour;
    if (req.body.closing_hour) updates.closing_hour = req.body.closing_hour;
  } else {
    if (req.body.availability_start) updates.availability_start = req.body.availability_start;
    if (req.body.availability_end)   updates.availability_end   = req.body.availability_end;
  }
  const updated = await Business.update(id, updates);
  res.json({ success: true, message: 'Horaires mis à jour', data: updated });
});

const updateAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const business = await Business.findById(id);
  if (!business) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, message: 'Établissement introuvable', code: ERROR_CODES.NOT_FOUND });
  if (business.type !== BUSINESS_TYPES.TRAITEUR) return res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: 'La disponibilité ne concerne que les traiteurs', code: ERROR_CODES.VALIDATION_ERROR });
  const updated = await Business.updateAvailability(id, req.body.is_available);
  res.json({ success: true, message: `Disponibilité ${req.body.is_available ? 'activée' : 'désactivée'}`, data: updated });
});

const getBusinessMenus = asyncHandler(async (req, res) => {
  const menus = await Menu.getWithItems(req.params.businessId);
  res.json({ success: true, data: menus });
});

const createMenu = asyncHandler(async (req, res) => {
  const menu = await Menu.create({ ...req.body, business_id: req.params.businessId });
  logger.info('Menu créé', { menuId: menu.id, businessId: req.params.businessId, userId: req.user.id });
  res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Menu créé avec succès', data: menu });
});

const getRevenueStats = asyncHandler(async (req, res) => {
  const { id } = req.params;
  if (req.user.role !== 'superadmin') {
    const check = await pool.query('SELECT user_id FROM businesses WHERE id = $1', [id]);
    if (!check.rows.length) return res.status(HTTP_STATUS.NOT_FOUND).json({ success: false, error: 'Établissement introuvable' });
    if (check.rows[0].user_id !== req.user.id) return res.status(HTTP_STATUS.FORBIDDEN).json({ success: false, error: 'Accès refusé' });
  }
  const stats = await pool.query('SELECT * FROM restaurant_revenue_stats WHERE business_id = $1', [id]);
  if (!stats.rows.length) return res.json({ success: true, total_received: 0, total_commissions: 0, total_orders_amount: 0, transaction_count: 0, this_month_received: 0, this_month_commissions: 0 });
  const s = stats.rows[0];
  res.json({ success: true, total_received: Number(s.total_received||0), total_commissions: Number(s.total_commissions||0), total_orders_amount: Number(s.total_orders_amount||0), transaction_count: Number(s.transaction_count||0), this_month_received: Number(s.this_month_received||0), this_month_commissions: Number(s.this_month_commissions||0) });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/businesses/nearby?lat=6.137&lng=1.212&radius=5&type=...
// Retourne les établissements triés par distance (Haversine SQL)
// ═══════════════════════════════════════════════════════════════════
const getBusinessesNearby = asyncHandler(async (req, res) => {
  const { lat, lng, radius = 10, type, premium_first = 'true' } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ success: false, error: 'lat et lng sont requis' });
  }

  const latitude  = parseFloat(lat);
  const longitude = parseFloat(lng);
  const radiusKm  = Math.min(parseFloat(radius), 50); // max 50 km

  if (isNaN(latitude) || isNaN(longitude)) {
    return res.status(400).json({ success: false, error: 'Coordonnées invalides' });
  }

  // Formule Haversine en SQL pour calculer la distance en km
  const params = [latitude, longitude, latitude, radiusKm];
  let typeClause = '';
  if (type && Object.values(BUSINESS_TYPES).includes(type)) {
    params.push(type);
    typeClause = `AND b.type = $${params.length}`;
  }

  const query = `
    SELECT
      b.id, b.user_id, b.name, b.type, b.description, b.address, b.phone,
      b.opening_hour, b.closing_hour, b.availability_start, b.availability_end,
      b.is_available, b.is_active, b.average_rating, b.reviews_count,
      b.requires_reservation_deposit, b.default_deposit_amount,
      b.default_special_order_deposit_percentage,
      b.slug, b.tagline, b.created_at, b.updated_at,
      b.latitude, b.longitude, b.district,
      COALESCE(b.cover_image_url, br.cover_image_url) AS cover_image_url,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count,  0) AS reviews_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM business_subscriptions bs2
        JOIN subscription_plans sp2 ON bs2.plan_id = sp2.id
        WHERE bs2.business_id = b.id AND bs2.status = 'active' AND sp2.name LIKE 'premium%'
      ) THEN true ELSE false END AS is_premium,
      sp.display_name AS plan_name,
      sp.name         AS plan_code,
      -- ✅ Distance Haversine en km
      (
        6371 * acos(
          LEAST(1.0, cos(radians($1)) * cos(radians(b.latitude))
          * cos(radians(b.longitude) - radians($2))
          + sin(radians($1)) * sin(radians(b.latitude)))
        )
      ) AS distance_km
    FROM businesses b
    LEFT JOIN business_branding br      ON b.id = br.business_id
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp     ON bs.plan_id = sp.id
    WHERE b.is_active = true
      AND b.latitude IS NOT NULL
      AND b.longitude IS NOT NULL
      ${typeClause}
      AND (
        6371 * acos(
          LEAST(1.0, cos(radians($3)) * cos(radians(b.latitude))
          * cos(radians(b.longitude) - radians($2))
          + sin(radians($3)) * sin(radians(b.latitude)))
        )
      ) <= $4
    ORDER BY
      ${premium_first === 'true' ? "CASE WHEN sp.name LIKE 'premium%' THEN 1 ELSE 2 END," : ''}
      distance_km ASC
  `;

  const result = await pool.query(query, params);

  res.json({
    success: true,
    data: result.rows,
    meta: {
      center: { lat: latitude, lng: longitude },
      radius_km: radiusKm,
      count: result.rows.length,
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// GET /api/businesses/by-district?district=Adidogomé&type=...
// Filtre par quartier (pour refus géolocalisation)
// ═══════════════════════════════════════════════════════════════════
const getBusinessesByDistrict = asyncHandler(async (req, res) => {
  const { district, type, premium_first = 'true' } = req.query;

  if (!district) {
    return res.status(400).json({ success: false, error: 'district est requis' });
  }

  const params = [district.trim()];
  let typeClause = '';
  if (type && Object.values(BUSINESS_TYPES).includes(type)) {
    params.push(type);
    typeClause = `AND b.type = $${params.length}`;
  }

  const query = `
    SELECT
      b.id, b.user_id, b.name, b.type, b.description, b.address, b.phone,
      b.opening_hour, b.closing_hour, b.availability_start, b.availability_end,
      b.is_available, b.is_active, b.average_rating, b.reviews_count,
      b.requires_reservation_deposit, b.default_deposit_amount,
      b.default_special_order_deposit_percentage,
      b.slug, b.tagline, b.created_at, b.updated_at,
      b.latitude, b.longitude, b.district,
      COALESCE(b.cover_image_url, br.cover_image_url) AS cover_image_url,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count,  0) AS reviews_count,
      CASE WHEN EXISTS (
        SELECT 1 FROM business_subscriptions bs2
        JOIN subscription_plans sp2 ON bs2.plan_id = sp2.id
        WHERE bs2.business_id = b.id AND bs2.status = 'active' AND sp2.name LIKE 'premium%'
      ) THEN true ELSE false END AS is_premium,
      sp.display_name AS plan_name,
      sp.name         AS plan_code
    FROM businesses b
    LEFT JOIN business_branding br      ON b.id = br.business_id
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp     ON bs.plan_id = sp.id
    WHERE b.is_active = true
      AND b.district ILIKE $1
      ${typeClause}
    ORDER BY
      ${premium_first === 'true' ? "CASE WHEN sp.name LIKE 'premium%' THEN 1 ELSE 2 END," : ''}
      b.average_rating DESC NULLS LAST, b.created_at DESC
  `;

  const result = await pool.query(query, params);

  res.json({ success: true, data: result.rows });
});

module.exports = {
  getAllBusinesses, getRestaurants, getAvailableCaterers, getBusinessById,
  updateBusiness, updateHours, updateAvailability,
  getBusinessMenus, createMenu, getRevenueStats, getPublicProfile,
  getBusinessesNearby, getBusinessesByDistrict,
};