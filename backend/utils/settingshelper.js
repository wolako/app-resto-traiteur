// utils/settingsHelper.js
// ════════════════════════════════════════════════════════════
// Helper centralisé pour lire les paramètres depuis app_settings
// À utiliser dans tous les controllers qui ont besoin d'un paramètre
// configurable par l'admin.
//
// USAGE :
//   const { getSetting, getSettings } = require('../utils/settingsHelper');
//
//   // Dans un controller :
//   const minAmount = await getSetting('min_order_amount', 1000);
//   const { min_order_amount, max_order_amount } = await getSettings([
//     'min_order_amount',
//     'max_order_amount'
//   ]);
// ════════════════════════════════════════════════════════════

const AppSetting = require('../models/AppSetting');

/**
 * Lire un seul paramètre typé.
 * @param {string} key - Clé du paramètre
 * @param {any} defaultValue - Valeur si le paramètre n'existe pas
 */
async function getSetting(key, defaultValue = null) {
  try {
    return await AppSetting.getValue(key, defaultValue);
  } catch {
    return defaultValue;
  }
}

/**
 * Lire plusieurs paramètres en une seule requête.
 * Retourne un objet { key: valeur_typée }.
 * @param {string[]} keys
 */
async function getSettings(keys) {
  try {
    return await AppSetting.getMultipleValues(keys);
  } catch {
    return {};
  }
}

module.exports = { getSetting, getSettings };