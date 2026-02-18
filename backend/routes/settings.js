const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { USER_ROLES } = require('../config/constants');

// ========================================
// ROUTES PUBLIQUES
// ========================================

// Paramètres publics (accessible sans authentification)
router.get('/public', settingsController.getPublicSettings);

// Statut de maintenance (public)
router.get('/maintenance/status', settingsController.getMaintenanceStatus);

// Catégories (public)
router.get('/categories', settingsController.getCategories);

// ========================================
// ROUTES ADMIN
// ========================================

// Obtenir tous les paramètres (admin seulement)
router.get('/', 
  authenticateToken, 
  requireRole(USER_ROLES.SUPER_ADMIN), 
  settingsController.getAllSettings
);

// Obtenir un paramètre par clé
router.get('/:key', 
  authenticateToken, 
  settingsController.getSettingByKey
);

// Obtenir les paramètres par catégorie
router.get('/category/:category', 
  authenticateToken, 
  settingsController.getSettingsByCategory
);

// Mettre à jour un paramètre
router.put('/:key', 
  authenticateToken, 
  requireRole(USER_ROLES.SUPER_ADMIN), 
  settingsController.updateSetting
);

// Créer un nouveau paramètre
router.post('/', 
  authenticateToken, 
  requireRole(USER_ROLES.SUPER_ADMIN), 
  settingsController.createSetting
);

// Supprimer un paramètre
router.delete('/:key', 
  authenticateToken, 
  requireRole(USER_ROLES.SUPER_ADMIN), 
  settingsController.deleteSetting
);

// 🆕 Toggle maintenance mode (raccourci pratique)
router.post('/maintenance/toggle', 
  authenticateToken, 
  requireRole(USER_ROLES.SUPER_ADMIN), 
  settingsController.toggleMaintenance
);

module.exports = router;