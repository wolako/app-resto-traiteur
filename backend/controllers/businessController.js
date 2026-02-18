// controllers/businessController.js - VERSION MISE À JOUR

const Business = require('../models/Business');
const Menu = require('../models/Menu');
const { HTTP_STATUS, ERROR_CODES, BUSINESS_TYPES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { pool } = require('../config/db');

// ========================================
// Obtenir tous les établissements (public)
// ✅ MODIFIÉ : Tri Premium + Notes dynamiques
// ========================================
const getAllBusinesses = asyncHandler(async (req, res) => {
  const { type, search, premium_first = 'true' } = req.query;

  let query = `
    SELECT 
      b.*,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM business_subscriptions bs 
          JOIN subscription_plans sp ON bs.plan_id = sp.id 
          WHERE bs.business_id = b.id 
          AND bs.status = 'active' 
          AND sp.name = 'premium'
        ) THEN true 
        ELSE false 
      END AS is_premium,
      sp.display_name AS plan_name,
      sp.name AS plan_code,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count, 0) AS reviews_count
    FROM businesses b
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
    WHERE b.is_active = true
  `;

  const params = [];

  // Filtre par type (restaurant/traiteur)
  if (type && Object.values(BUSINESS_TYPES).includes(type)) {
    params.push(type);
    query += ` AND b.type = $${params.length}`;
  }

  // Recherche par nom ou description
  if (search) {
    params.push(`%${search}%`);
    query += ` AND (b.name ILIKE $${params.length} OR b.description ILIKE $${params.length})`;
  }

  // ✅ TRI PREMIUM EN PREMIER
  if (premium_first === 'true') {
    query += `
      ORDER BY
        CASE WHEN sp.name = 'premium' THEN 1 ELSE 2 END,
        b.average_rating DESC NULLS LAST,
        b.created_at DESC
    `;
  } else {
    query += `
      ORDER BY b.average_rating DESC NULLS LAST, b.created_at DESC
    `;
  }

  const result = await pool.query(query, params);

  logger.info('Businesses récupérés', {
    count: result.rows.length,
    type: type || 'all',
    premium_first
  });

  res.json({
    success: true,
    data: result.rows,
  });
});

// ========================================
// Obtenir les restaurants (public)
// ✅ MODIFIÉ : Tri Premium + Notes
// ========================================
const getRestaurants = asyncHandler(async (req, res) => {
  const { premium_first = 'true' } = req.query;

  let query = `
    SELECT 
      b.*,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM business_subscriptions bs 
          JOIN subscription_plans sp ON bs.plan_id = sp.id 
          WHERE bs.business_id = b.id 
          AND bs.status = 'active' 
          AND sp.name = 'premium'
        ) THEN true 
        ELSE false 
      END AS is_premium,
      sp.display_name AS plan_name,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count, 0) AS reviews_count
    FROM businesses b
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
    WHERE b.is_active = true 
    AND b.type = $1
  `;

  if (premium_first === 'true') {
    query += `
      ORDER BY
        CASE WHEN sp.name = 'premium' THEN 1 ELSE 2 END,
        b.average_rating DESC NULLS LAST,
        b.created_at DESC
    `;
  } else {
    query += `
      ORDER BY b.average_rating DESC NULLS LAST, b.created_at DESC
    `;
  }

  const result = await pool.query(query, [BUSINESS_TYPES.RESTAURANT]);

  res.json({
    success: true,
    data: result.rows,
  });
});

// ========================================
// Obtenir les traiteurs disponibles (public)
// ✅ MODIFIÉ : Tri Premium + Notes
// ========================================
const getAvailableCaterers = asyncHandler(async (req, res) => {
  const { premium_first = 'true' } = req.query;

  let query = `
    SELECT 
      b.*,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM business_subscriptions bs 
          JOIN subscription_plans sp ON bs.plan_id = sp.id 
          WHERE bs.business_id = b.id 
          AND bs.status = 'active' 
          AND sp.name = 'premium'
        ) THEN true 
        ELSE false 
      END AS is_premium,
      sp.display_name AS plan_name,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count, 0) AS reviews_count
    FROM businesses b
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
    WHERE b.is_active = true 
    AND b.type = $1 
    AND b.is_available = true
  `;

  if (premium_first === 'true') {
    query += `
      ORDER BY
        CASE WHEN sp.name = 'premium' THEN 1 ELSE 2 END,
        b.average_rating DESC NULLS LAST,
        b.created_at DESC
    `;
  } else {
    query += `
      ORDER BY b.average_rating DESC NULLS LAST, b.created_at DESC
    `;
  }

  const result = await pool.query(query, [BUSINESS_TYPES.TRAITEUR]);

  res.json({
    success: true,
    data: result.rows,
  });
});

// ========================================
// Obtenir un établissement par ID
// ✅ MODIFIÉ : Ajouter is_premium et notes
// ========================================
const getBusinessById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const query = `
    SELECT 
      b.*,
      CASE 
        WHEN EXISTS (
          SELECT 1 FROM business_subscriptions bs 
          JOIN subscription_plans sp ON bs.plan_id = sp.id 
          WHERE bs.business_id = b.id 
          AND bs.status = 'active' 
          AND sp.name = 'premium'
        ) THEN true 
        ELSE false 
      END AS is_premium,
      sp.display_name AS plan_name,
      COALESCE(b.average_rating, 0) AS average_rating,
      COALESCE(b.reviews_count, 0) AS reviews_count
    FROM businesses b
    LEFT JOIN business_subscriptions bs ON b.id = bs.business_id AND bs.status = 'active'
    LEFT JOIN subscription_plans sp ON bs.plan_id = sp.id
    WHERE b.id = $1
  `;

  const result = await pool.query(query, [id]);

  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({
    success: true,
    data: result.rows[0],
  });
});

// ========================================
// MÉTHODES INCHANGÉES
// ========================================

// Mettre à jour un établissement
const updateBusiness = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  const business = await Business.update(id, updates);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Établissement mis à jour', {
    businessId: id,
    userId: req.user.id,
    updates: Object.keys(updates),
  });

  res.json({
    success: true,
    message: 'Établissement mis à jour',
    data: business,
  });
});

// Mettre à jour les horaires
const updateHours = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = {};

  const business = await Business.findById(id);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  if (business.type === BUSINESS_TYPES.RESTAURANT) {
    if (req.body.opening_hour) updates.opening_hour = req.body.opening_hour;
    if (req.body.closing_hour) updates.closing_hour = req.body.closing_hour;
  } else if (business.type === BUSINESS_TYPES.TRAITEUR) {
    if (req.body.availability_start) updates.availability_start = req.body.availability_start;
    if (req.body.availability_end) updates.availability_end = req.body.availability_end;
  }

  const updatedBusiness = await Business.update(id, updates);

  logger.info('Horaires mis à jour', {
    businessId: id,
    userId: req.user.id,
    type: business.type,
    updates,
  });

  res.json({
    success: true,
    message: 'Horaires mis à jour',
    data: updatedBusiness,
  });
});

// Mettre à jour la disponibilité (traiteurs uniquement)
const updateAvailability = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { is_available } = req.body;

  const business = await Business.findById(id);
  if (!business) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Établissement introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  if (business.type !== BUSINESS_TYPES.TRAITEUR) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'La disponibilité ne concerne que les traiteurs',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  const updatedBusiness = await Business.updateAvailability(id, is_available);

  logger.info('Disponibilité mise à jour', {
    businessId: id,
    userId: req.user.id,
    is_available,
  });

  res.json({
    success: true,
    message: `Statut de disponibilité ${is_available ? 'activé' : 'désactivé'}`,
    data: updatedBusiness,
  });
});

// Obtenir les menus d'un établissement
const getBusinessMenus = asyncHandler(async (req, res) => {
  const { businessId } = req.params;

  const menus = await Menu.getWithItems(businessId);

  res.json({
    success: true,
    data: menus,
  });
});

// Créer un menu
const createMenu = asyncHandler(async (req, res) => {
  const { businessId } = req.params;
  const menuData = {
    ...req.body,
    business_id: businessId,
  };

  const menu = await Menu.create(menuData);

  logger.info('Nouveau menu créé', {
    menuId: menu.id,
    businessId,
    userId: req.user.id,
    name: menu.name,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Menu créé avec succès',
    data: menu,
  });
});

module.exports = {
  getAllBusinesses,
  getRestaurants,
  getAvailableCaterers,
  getBusinessById,
  updateBusiness,
  updateHours,
  updateAvailability,
  getBusinessMenus,
  createMenu,
};