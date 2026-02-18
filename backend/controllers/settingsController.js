const AppSetting = require('../models/AppSetting');
const pool = require('../config/db');

// Obtenir tous les paramètres (admin seulement)
exports.getAllSettings = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const settings = await AppSetting.getAll();
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(settings);
  } catch (error) {
    console.error('Erreur récupération paramètres:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir les paramètres publics
exports.getPublicSettings = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const settings = await AppSetting.getAll(true);
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(settings);
  } catch (error) {
    console.error('Erreur récupération paramètres publics:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir un paramètre par clé
exports.getSettingByKey = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const { key } = req.params;
    const setting = await AppSetting.getByKey(key);
    
    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }
    
    // Si le paramètre n'est pas public et l'utilisateur n'est pas admin
    if (!setting.is_public && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Accès refusé' });
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(setting);
  } catch (error) {
    console.error('Erreur récupération paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir les paramètres par catégorie
exports.getSettingsByCategory = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const { category } = req.params;
    const settings = await AppSetting.getByCategory(category);
    
    // Filtrer les paramètres non publics si l'utilisateur n'est pas admin
    const filteredSettings = req.user && req.user.role === 'superadmin' 
      ? settings 
      : settings.filter(s => s.is_public);
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(filteredSettings);
  } catch (error) {
    console.error('Erreur récupération paramètres par catégorie:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Mettre à jour un paramètre (admin seulement)
exports.updateSetting = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const { key } = req.params;
    const { value, value_type, description, is_public } = req.body;
    
    const updateData = {};
    if (value !== undefined) {
      // Convertir la valeur selon le type
      let stringValue = value;
      if (value_type === 'json' && typeof value !== 'string') {
        stringValue = JSON.stringify(value);
      } else if (value_type === 'boolean') {
        stringValue = value ? 'true' : 'false';
      } else if (value_type === 'number') {
        stringValue = value.toString();
      }
      updateData.value = stringValue;
    }
    
    if (value_type) updateData.value_type = value_type;
    if (description) updateData.description = description;
    if (is_public !== undefined) updateData.is_public = is_public;
    
    const setting = await AppSetting.update(key, updateData);
    
    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }
    
    // 🆕 Log spécial pour le mode maintenance
    if (key === 'maintenance_mode') {
      const isEnabled = setting.value === 'true';
      console.log(`🔧 Mode maintenance ${isEnabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'} par ${req.user.email}`);
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(setting);
  } catch (error) {
    console.error('Erreur mise à jour paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Créer un nouveau paramètre (admin seulement)
exports.createSetting = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const { key, value, value_type, category, description, is_public } = req.body;
    
    // Validation
    if (!key || !value || !value_type || !category) {
      return res.status(400).json({ 
        error: 'Données manquantes (key, value, value_type, category requis)' 
      });
    }
    
    // Convertir la valeur
    let stringValue = value;
    if (value_type === 'json' && typeof value !== 'string') {
      stringValue = JSON.stringify(value);
    } else if (value_type === 'boolean') {
      stringValue = value ? 'true' : 'false';
    } else if (value_type === 'number') {
      stringValue = value.toString();
    }
    
    const setting = await AppSetting.setValue(key, stringValue, value_type);
    
    // Mettre à jour les autres champs si fournis
    if (description || category || is_public !== undefined) {
      const updateData = {};
      if (description) updateData.description = description;
      if (category) updateData.category = category;
      if (is_public !== undefined) updateData.is_public = is_public;
      
      await AppSetting.update(key, updateData);
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(201).json(setting);
  } catch (error) {
    console.error('Erreur création paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Supprimer un paramètre (admin seulement)
exports.deleteSetting = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const { key } = req.params;
    
    // 🆕 Protection : ne pas supprimer les paramètres critiques
    const criticalSettings = [
      'maintenance_mode',
      'app_name',
      'default_commission_rate',
      'currency'
    ];
    
    if (criticalSettings.includes(key)) {
      return res.status(400).json({ 
        error: 'Impossible de supprimer ce paramètre critique. Vous pouvez le modifier à la place.' 
      });
    }
    
    const setting = await AppSetting.delete(key);
    
    if (!setting) {
      return res.status(404).json({ error: 'Paramètre non trouvé' });
    }
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({ message: 'Paramètre supprimé avec succès' });
  } catch (error) {
    console.error('Erreur suppression paramètre:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// Obtenir les catégories disponibles
exports.getCategories = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const result = await AppSetting.getAll();
    const categories = [...new Set(result.map(s => s.category))];
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json(categories);
  } catch (error) {
    console.error('Erreur récupération catégories:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// 🆕 Activer/Désactiver le mode maintenance rapidement
exports.toggleMaintenance = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const { enabled, message, end_time } = req.body;
    
    // Mettre à jour le mode maintenance
    await AppSetting.setValue('maintenance_mode', enabled ? 'true' : 'false', 'boolean');
    
    // Mettre à jour le message si fourni
    if (message) {
      await AppSetting.setValue('maintenance_message', message, 'string');
    }
    
    // Mettre à jour l'heure de fin si fournie
    if (end_time !== undefined) {
      await AppSetting.setValue('maintenance_end_time', end_time, 'string');
    }
    
    console.log(`🔧 Mode maintenance ${enabled ? 'ACTIVÉ' : 'DÉSACTIVÉ'} par ${req.user.email}`);
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      success: true,
      maintenance_mode: enabled,
      message: 'Mode maintenance mis à jour'
    });
  } catch (error) {
    console.error('Erreur toggle maintenance:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};

// 🆕 Obtenir le statut de maintenance (public)
exports.getMaintenanceStatus = async (req, res) => {
  try {
    await pool.query('SET CLIENT_ENCODING TO UTF8');
    
    const maintenanceMode = await AppSetting.getValue('maintenance_mode');
    const maintenanceMessage = await AppSetting.getValue('maintenance_message');
    const maintenanceEndTime = await AppSetting.getValue('maintenance_end_time');
    
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.json({
      enabled: maintenanceMode || false,
      message: maintenanceMessage || 'L\'application est en maintenance',
      end_time: maintenanceEndTime || null
    });
  } catch (error) {
    console.error('Erreur récupération statut maintenance:', error);
    res.status(500).json({ error: 'Erreur serveur' });
  }
};