const Menu = require('../models/Menu');
const { pool } = require('../config/db');
const { HTTP_STATUS, ERROR_CODES } = require('../config/constants');
const { asyncHandler } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// Obtenir un menu par ID
const getMenuById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const menu = await Menu.findById(id);
  if (!menu) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Menu introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  res.json({
    success: true,
    data: menu,
  });
});

// Mettre à jour un menu
const updateMenu = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // Convertir is_active en boolean si présent
  if (updates.is_active !== undefined) {
    updates.is_active = Boolean(updates.is_active);
  }

  console.log('Updating menu:', id, 'with data:', updates); // Debug

  const menu = await Menu.update(id, updates);
  if (!menu) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Menu introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Menu mis à jour', {
    menuId: id,
    userId: req.user.id,
    updates: Object.keys(updates),
  });

  res.json({
    success: true,
    message: 'Menu mis à jour',
    data: menu,
  });
});

// Supprimer un menu
const deleteMenu = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const menu = await Menu.delete(id);
  if (!menu) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Menu introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  logger.info('Menu supprimé', {
    menuId: id,
    userId: req.user.id,
    menuName: menu.name,
  });

  res.json({
    success: true,
    message: 'Menu supprimé',
  });
});

// Obtenir les items d'un menu
const getMenuItems = asyncHandler(async (req, res) => {
  const { menuId } = req.params;

  const result = await pool.query(
    'SELECT * FROM menu_items WHERE menu_id = $1 ORDER BY id',
    [menuId]
  );

  res.json({
    success: true,
    data: result.rows,
  });
});

// Créer un item de menu
const createMenuItem = asyncHandler(async (req, res) => {
  const { menuId } = req.params;
  const itemData = {
    ...req.body,
    menu_id: menuId,
  };

  const result = await pool.query(
    `INSERT INTO menu_items (menu_id, name, description, price, category, is_available, image_url)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      itemData.menu_id,
      itemData.name,
      itemData.description,
      itemData.price,
      itemData.category,
      itemData.is_available !== undefined ? itemData.is_available : true,
      itemData.image_url,
    ]
  );

  const item = result.rows[0];

  logger.info('Nouvel item de menu créé', {
    itemId: item.id,
    menuId,
    userId: req.user.id,
    name: item.name,
  });

  res.status(HTTP_STATUS.CREATED).json({
    success: true,
    message: 'Item de menu créé',
    data: item,
  });
});

// ✅ FIX: Mettre à jour un item de menu
const updateMenuItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;
  const updates = req.body;

  const fields = [];
  const values = [];
  let paramCount = 1;

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      // Conversion explicite pour les boolean
      if (key === 'is_available') {
        fields.push(`${key} = $${paramCount}`);
        values.push(Boolean(updates[key]));
      } else {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
      }
      paramCount++;
    }
  });

  if (fields.length === 0) {
    return res.status(HTTP_STATUS.BAD_REQUEST).json({
      success: false,
      message: 'Aucune donnée à mettre à jour',
      code: ERROR_CODES.VALIDATION_ERROR,
    });
  }

  values.push(itemId);

  const result = await pool.query(
    `UPDATE menu_items SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${paramCount}
     RETURNING *`,
    values
  );

  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Item de menu introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  const item = result.rows[0];

  logger.info('Item de menu mis à jour', {
    itemId,
    userId: req.user.id,
    updates: Object.keys(updates),
  });

  res.json({
    success: true,
    message: 'Item de menu mis à jour',
    data: item,
  });
});

// Supprimer un item de menu
const deleteMenuItem = asyncHandler(async (req, res) => {
  const { itemId } = req.params;

  const result = await pool.query(
    'DELETE FROM menu_items WHERE id = $1 RETURNING *',
    [itemId]
  );

  if (result.rows.length === 0) {
    return res.status(HTTP_STATUS.NOT_FOUND).json({
      success: false,
      message: 'Item de menu introuvable',
      code: ERROR_CODES.NOT_FOUND,
    });
  }

  const item = result.rows[0];

  logger.info('Item de menu supprimé', {
    itemId,
    userId: req.user.id,
    itemName: item.name,
  });

  res.json({
    success: true,
    message: 'Item de menu supprimé',
  });
});

module.exports = {
  getMenuById,
  updateMenu,
  deleteMenu,
  getMenuItems,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
};