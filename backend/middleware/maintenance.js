const AppSetting = require('../models/AppSetting');
const { USER_ROLES, HTTP_STATUS } = require('../config/constants');

/**
 * Middleware pour vérifier le mode maintenance.
 *
 * ✅ CORRECTION PERFORMANCE : une seule requête SQL via getMultipleValues()
 *    au lieu de 3 appels séquentiels à getValue().
 *    Ce middleware étant appelé sur toutes les requêtes, chaque appel
 *    inutile draîne la pool PostgreSQL.
 */
const checkMaintenanceMode = async (req, res, next) => {
  try {
    // ✅ 1 seule requête SQL pour les 3 clés
    const settings = await AppSetting.getMultipleValues([
      'maintenance_mode',
      'maintenance_message',
      'maintenance_end_time',
    ]);

    // Maintenance désactivée → continuer
    if (!settings['maintenance_mode']) {
      return next();
    }

    // Super-admin → toujours autorisé
    if (req.user && req.user.role === USER_ROLES.SUPER_ADMIN) {
      return next();
    }

    return res.status(HTTP_STATUS.SERVICE_UNAVAILABLE || 503).json({
      success:    false,
      maintenance: true,
      message:    settings['maintenance_message'] ||
                  "L'application est actuellement en maintenance. Veuillez réessayer dans quelques instants.",
      end_time:   settings['maintenance_end_time'] || null,
      code:       'MAINTENANCE_MODE',
    });

  } catch (error) {
    console.error('Erreur middleware maintenance:', error);
    // En cas d'erreur DB, on laisse passer pour ne pas bloquer l'app
    next();
  }
};

/**
 * Middleware optionnel : injecte les infos maintenance dans req sans bloquer.
 * ✅ Même correction : 1 requête SQL au lieu de 3.
 */
const addMaintenanceInfo = async (req, res, next) => {
  try {
    const settings = await AppSetting.getMultipleValues([
      'maintenance_mode',
      'maintenance_message',
      'maintenance_end_time',
    ]);

    if (settings['maintenance_mode']) {
      req.maintenanceMode    = true;
      req.maintenanceMessage = settings['maintenance_message'];
      req.maintenanceEndTime = settings['maintenance_end_time'];
    }

    next();
  } catch (error) {
    console.error('Erreur addMaintenanceInfo:', error);
    next();
  }
};

module.exports = { checkMaintenanceMode, addMaintenanceInfo };