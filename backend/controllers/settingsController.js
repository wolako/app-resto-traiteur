const AppSetting = require('../models/AppSetting');
const { pool } = require('../config/db');

// ─── helpers ─────────────────────────────────────────────────────────────────

/**
 * Applique les headers Cache-Control cohérents.
 * - Les données publiques changent peu → cache court côté client.
 * - Les données admin ne doivent jamais être mises en cache.
 */
function setNoCacheHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

function setShortCacheHeaders(res, seconds = 15) {
  res.setHeader('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=5`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
}

// ─── controllers ─────────────────────────────────────────────────────────────

// Obtenir tous les paramètres (admin seulement)
exports.getAllSettings = async (req, res) => {
  try {
    const settings = await AppSetting.getAll();
    setNoCacheHeaders(res);
    res.json(settings);
  } catch (error) {
    console.error('Erreur récupération paramètres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir les paramètres publics
exports.getPublicSettings = async (req, res) => {
  try {
    const settings = await AppSetting.getAll(true);
    setShortCacheHeaders(res, 30);
    res.json(settings);
  } catch (error) {
    console.error('Erreur récupération paramètres publics:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir un paramètre par clé
exports.getSettingByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const setting = await AppSetting.getByKey(key);

    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }

    if (!setting.is_public && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }

    setNoCacheHeaders(res);
    res.json(setting);
  } catch (error) {
    console.error('Erreur récupération paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir les paramètres par catégorie
exports.getSettingsByCategory = async (req, res) => {
  try {
    const { category } = req.params;
    const settings = await AppSetting.getByCategory(category);

    const filteredSettings = req.user?.role === 'superadmin'
      ? settings
      : settings.filter(s => s.is_public);

    setNoCacheHeaders(res);
    res.json(filteredSettings);
  } catch (error) {
    console.error('Erreur récupération paramètres par catégorie:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Mettre à jour un paramètre (admin seulement)
exports.updateSetting = async (req, res) => {
  try {
    const { key } = req.params;
    const { value, value_type, description, is_public } = req.body;

    const updateData = {};

    if (value !== undefined) {
      let stringValue = value;
      if (value_type === 'json' && typeof value !== 'string') {
        stringValue = JSON.stringify(value);
      } else if (value_type === 'boolean') {
        stringValue = value ? 'true' : 'false';
      } else if (value_type === 'number') {
        stringValue = String(value);
      }
      updateData.value = stringValue;
    }

    if (value_type)          updateData.value_type  = value_type;
    if (description)         updateData.description = description;
    if (is_public !== undefined) updateData.is_public = is_public;

    const setting = await AppSetting.update(key, updateData);

    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }

    if (key === 'maintenance_mode') {
      console.log(`🔧 Mode maintenance ${setting.value === 'true' ? 'ACTIVÉ' : 'DÉSACTIVÉ'} par ${req.user.email}`);
    }

    setNoCacheHeaders(res);
    res.json(setting);
  } catch (error) {
    console.error('Erreur mise à jour paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Créer un nouveau paramètre (admin seulement)
exports.createSetting = async (req, res) => {
  try {
    const { key, value, value_type, category, description, is_public } = req.body;

    if (!key || !value || !value_type || !category) {
      return res.status(400).json({
        error: 'Données manquantes (key, value, value_type, category requis)',
      });
    }

    let stringValue = value;
    if (value_type === 'json' && typeof value !== 'string') {
      stringValue = JSON.stringify(value);
    } else if (value_type === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else if (value_type === 'number') {
      stringValue = String(value);
    }

    const setting = await AppSetting.setValue(key, stringValue, value_type);

    if (description || category || is_public !== undefined) {
      const updateData = {};
      if (description)         updateData.description = description;
      if (category)            updateData.category    = category;
      if (is_public !== undefined) updateData.is_public = is_public;
      await AppSetting.update(key, updateData);
    }

    setNoCacheHeaders(res);
    res.status(201).json(setting);
  } catch (error) {
    console.error('Erreur création paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Supprimer un paramètre (admin seulement)
exports.deleteSetting = async (req, res) => {
  try {
    const { key } = req.params;

    const criticalSettings = [
      'maintenance_mode',
      'app_name',
      'default_commission_rate',
      'currency',
    ];

    if (criticalSettings.includes(key)) {
      return res.status(400).json({
        error: 'Impossible de supprimer ce paramètre critique. Vous pouvez le modifier à la place.',
      });
    }

    const setting = await AppSetting.delete(key);

    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }

    setNoCacheHeaders(res);
    res.json({ message: 'Paramètre supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir les catégories disponibles
exports.getCategories = async (req, res) => {
  try {
    const result = await AppSetting.getAll();
    const categories = [...new Set(result.map(s => s.category))];
    setShortCacheHeaders(res, 60);
    res.json(categories);
  } catch (error) {
    console.error('Erreur récupération catégories:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Activer/Désactiver le mode maintenance (raccourci admin)
exports.toggleMaintenance = async (req, res) => {
  try {
    const { enabled, message, end_time } = req.body;

    // ✅ Toutes les mises à jour en parallèle — pas de requêtes séquentielles
    const updates = [
      AppSetting.setValue('maintenance_mode', enabled ? 'true' : 'false', 'boolean'),
    ];
    if (message    !== undefined) updates.push(AppSetting.setValue('maintenance_message',  message,   'string'));
    if (end_time   !== undefined) updates.push(AppSetting.setValue('maintenance_end_time', end_time,  'string'));

    await Promise.all(updates);

    console.log(`🔧 Mode maintenance ${enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'} par ${req.user.email}`);

    setNoCacheHeaders(res);
    res.json({
      success:          true,
      maintenance_mode: enabled,
      message:          'Mode maintenance mis à jour',
    });
  } catch (error) {
    console.error('Erreur toggle maintenance:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir le statut de maintenance (public — appelé toutes les 30s par le frontend)
exports.getMaintenanceStatus = async (req, res) => {
  try {
    const settings = await AppSetting.getMultipleValues([
      'maintenance_mode',
      'maintenance_message',
      'maintenance_end_time',
    ]);

    const enabled = settings['maintenance_mode'] || false;

    setShortCacheHeaders(res, 15);
    res.json({
      enabled,
      // ✅ message et end_time seulement si maintenance active
      message:  enabled ? (settings['maintenance_message'] || "L'application est en maintenance") : null,
      end_time: enabled ? (settings['maintenance_end_time'] || null) : null,
    });
  } catch (error) {
    console.error('Erreur récupération statut maintenance:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};