// middleware/maintenance.js
const AppSetting = require('../models/AppSetting');
const { USER_ROLES, HTTP_STATUS } = require('../config/constants');

/**
 * Middleware pour vérifier le mode maintenance
 * Les super-admins peuvent toujours accéder
 */
const checkMaintenanceMode = async (req, res, next) => {
  try {
    // Récupérer le paramètre de maintenance
    const maintenanceMode = await AppSetting.getValue('maintenance_mode');
    
    // Si maintenance désactivée, continuer normalement
    if (!maintenanceMode) {
      return next();
    }
    
    // Les super-admins peuvent toujours accéder
    if (req.user && req.user.role === USER_ROLES.SUPER_ADMIN) {
      return next();
    }
    
    // Récupérer les messages de maintenance
    const maintenanceMessage = await AppSetting.getValue('maintenance_message') || 
      'L\'application est actuellement en maintenance. Veuillez réessayer dans quelques instants.';
    
    const maintenanceEndTime = await AppSetting.getValue('maintenance_end_time');
    
    // Retourner l'erreur de maintenance
    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE || 503).json({
      success: false,
      maintenance: true,
      message: maintenanceMessage,
      end_time: maintenanceEndTime || null,
      code: 'MAINTENANCE_MODE'
    });
    
  } catch (error) {
    console.error('Erreur middleware maintenance:', error);
    // En cas d'erreur, laisser passer pour ne pas bloquer l'application
    next();
  }
};

/**
 * Middleware optionnel de maintenance (n'arrête pas la requête)
 * Ajoute juste une info dans la réponse
 */
const addMaintenanceInfo = async (req, res, next) => {
  try {
    const maintenanceMode = await AppSetting.getValue('maintenance_mode');
    
    if (maintenanceMode) {
      req.maintenanceMode = true;
      req.maintenanceMessage = await AppSetting.getValue('maintenance_message');
      req.maintenanceEndTime = await AppSetting.getValue('maintenance_end_time');
    }
    
    next();
  } catch (error) {
    console.error('Erreur addMaintenanceInfo:', error);
    next();
  }
};

module.exports = {
  checkMaintenanceMode,
  addMaintenanceInfo
};