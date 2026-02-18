// middleware/subscriptionLimits.js - NOUVELLE LOGIQUE AVEC LIMITES

const pool = require('../config/db');

/**
 * ✅ NOUVELLE LOGIQUE :
 * - Tous les plans ont toutes les fonctionnalités
 * - Mais avec des LIMITES différentes
 * - On vérifie les LIMITES, pas les permissions booléennes
 */

// ✅ Récupérer l'abonnement actif d'un établissement
async function getBusinessSubscription(businessId) {
  const result = await pool.query(
    `SELECT bs.*, 
            sp.max_menu_items,
            sp.max_orders_per_month,
            sp.max_reservations_per_month,      
            sp.max_special_orders_per_month,    
            sp.max_photos,
            sp.can_accept_online_orders,
            sp.can_accept_reservations,
            sp.can_accept_special_orders
     FROM business_subscriptions bs
     JOIN subscription_plans sp ON bs.plan_id = sp.id
     WHERE bs.business_id = $1 AND bs.status = 'active'
     ORDER BY bs.created_at DESC
     LIMIT 1`,
    [businessId]
  );
  
  return result.rows[0];
}

// ✅ Récupérer le business_id depuis le menuId
async function getBusinessIdFromMenu(menuId) {
  const result = await pool.query(
    'SELECT business_id FROM menus WHERE id = $1',
    [menuId]
  );
  return result.rows[0]?.business_id || null;
}

// ✅ Vérifier la limite d'articles de menu
async function checkMenuItemsLimit(req, res, next) {
  try {
    const menuId = req.params.menuId;
    
    if (!menuId) {
      return res.status(400).json({
        success: false,
        error: 'Menu ID manquant'
      });
    }

    const businessId = await getBusinessIdFromMenu(menuId);
    
    if (!businessId) {
      return res.status(404).json({
        success: false,
        error: 'Menu introuvable'
      });
    }

    console.log(`🔍 Vérification limite menu items pour business #${businessId}`);

    const subscription = await getBusinessSubscription(businessId);
    
    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: 'Aucun abonnement actif. Veuillez souscrire à un plan.'
      });
    }

    // Si max_menu_items est null = illimité
    if (subscription.max_menu_items === null) {
      console.log('✅ Articles de menu illimités');
      return next();
    }

    // Compter les articles de menu actuels
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM menu_items mi
       JOIN menus m ON mi.menu_id = m.id
       WHERE m.business_id = $1`,
      [businessId]
    );

    const currentCount = parseInt(countResult.rows[0].count);

    console.log(`📊 Articles de menu: ${currentCount}/${subscription.max_menu_items}`);

    if (currentCount >= subscription.max_menu_items) {
      console.log(`❌ Limite atteinte: ${subscription.max_menu_items}`);
      return res.status(403).json({
        success: false,
        error: `Limite d'articles de menu atteinte (${subscription.max_menu_items}). Passez à un plan supérieur.`,
        limit: subscription.max_menu_items,
        current: currentCount,
        upgrade_required: true
      });
    }

    console.log('✅ Limite OK, ajout autorisé');
    next();
  } catch (error) {
    console.error('❌ Erreur vérification limite menu items:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
}

// ✅ Vérifier la limite de commandes en ligne mensuelles
async function checkMonthlyOrdersLimit(req, res, next) {
  try {
    const businessId = req.body.business_id;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID manquant'
      });
    }

    console.log(`🔍 Vérification limite commandes mensuelles pour business #${businessId}`);

    const subscription = await getBusinessSubscription(businessId);
    
    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: 'Aucun abonnement actif'
      });
    }

    // ✅ NOUVELLE LOGIQUE : Vérifier si la fonctionnalité est activée
    if (!subscription.can_accept_online_orders) {
      console.log('❌ Commandes en ligne désactivées pour ce plan');
      return res.status(403).json({
        success: false,
        error: 'Les commandes en ligne ne sont pas disponibles avec votre plan actuel.',
        upgrade_required: true
      });
    }

    // Si max_orders_per_month est null = illimité
    if (subscription.max_orders_per_month === null) {
      console.log('✅ Commandes illimitées');
      return next();
    }

    // Compter les commandes ce mois
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM orders
       WHERE business_id = $1
         AND created_at >= date_trunc('month', CURRENT_DATE)
         AND status NOT IN ('cancelled')`,
      [businessId]
    );

    const currentCount = parseInt(countResult.rows[0].count);

    console.log(`📊 Commandes ce mois: ${currentCount}/${subscription.max_orders_per_month}`);

    if (currentCount >= subscription.max_orders_per_month) {
      console.log(`❌ Limite mensuelle atteinte: ${subscription.max_orders_per_month}`);
      return res.status(403).json({
        success: false,
        error: `Limite de commandes mensuelle atteinte (${subscription.max_orders_per_month}). Passez à un plan supérieur.`,
        limit: subscription.max_orders_per_month,
        current: currentCount,
        upgrade_required: true
      });
    }

    console.log('✅ Limite OK');
    next();
  } catch (error) {
    console.error('❌ Erreur vérification limite commandes:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
}

// ✅ NOUVEAU : Vérifier la limite de réservations mensuelles
async function checkMonthlyReservationsLimit(req, res, next) {
  try {
    const businessId = req.body.restaurant_id;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Restaurant ID manquant'
      });
    }

    console.log(`🔍 Vérification limite réservations mensuelles pour business #${businessId}`);

    const subscription = await getBusinessSubscription(businessId);
    
    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: 'Aucun abonnement actif. Veuillez souscrire à un plan.'
      });
    }

    // ✅ Vérifier si la fonctionnalité est activée
    if (!subscription.can_accept_reservations) {
      console.log('❌ Réservations désactivées pour ce plan');
      return res.status(403).json({
        success: false,
        error: 'Les réservations ne sont pas disponibles avec votre plan actuel.',
        upgrade_required: true
      });
    }

    // Si max_reservations_per_month est null = illimité
    if (subscription.max_reservations_per_month === null) {
      console.log('✅ Réservations illimitées');
      return next();
    }

    // Compter les réservations ce mois
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM reservations
       WHERE restaurant_id = $1
         AND created_at >= date_trunc('month', CURRENT_DATE)
         AND status != 'cancelled'`,
      [businessId]
    );

    const currentCount = parseInt(countResult.rows[0].count);

    console.log(`📊 Réservations ce mois: ${currentCount}/${subscription.max_reservations_per_month}`);

    if (currentCount >= subscription.max_reservations_per_month) {
      console.log(`❌ Limite mensuelle atteinte: ${subscription.max_reservations_per_month}`);
      return res.status(403).json({
        success: false,
        error: `Limite de réservations mensuelle atteinte (${subscription.max_reservations_per_month}). Passez à un plan supérieur.`,
        limit: subscription.max_reservations_per_month,
        current: currentCount,
        upgrade_required: true
      });
    }

    console.log('✅ Limite OK');
    next();
  } catch (error) {
    console.error('❌ Erreur vérification limite réservations:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
}

// ✅ NOUVEAU : Vérifier la limite de commandes spéciales mensuelles
async function checkMonthlySpecialOrdersLimit(req, res, next) {
  try {
    const businessId = req.body.business_id;
    
    if (!businessId) {
      return res.status(400).json({
        success: false,
        error: 'Business ID manquant'
      });
    }

    console.log(`🔍 Vérification limite commandes spéciales mensuelles pour business #${businessId}`);

    const subscription = await getBusinessSubscription(businessId);
    
    if (!subscription) {
      return res.status(403).json({
        success: false,
        error: 'Aucun abonnement actif. Veuillez souscrire à un plan.'
      });
    }

    // ✅ Vérifier si la fonctionnalité est activée
    if (!subscription.can_accept_special_orders) {
      console.log('❌ Commandes spéciales désactivées pour ce plan');
      return res.status(403).json({
        success: false,
        error: 'Les commandes spéciales ne sont pas disponibles avec votre plan actuel.',
        upgrade_required: true
      });
    }

    // Si max_special_orders_per_month est null = illimité
    if (subscription.max_special_orders_per_month === null) {
      console.log('✅ Commandes spéciales illimitées');
      return next();
    }

    // Compter les commandes spéciales ce mois
    const countResult = await pool.query(
      `SELECT COUNT(*) as count
       FROM special_orders
       WHERE business_id = $1
         AND created_at >= date_trunc('month', CURRENT_DATE)
         AND status != 'cancelled'`,
      [businessId]
    );

    const currentCount = parseInt(countResult.rows[0].count);

    console.log(`📊 Commandes spéciales ce mois: ${currentCount}/${subscription.max_special_orders_per_month}`);

    if (currentCount >= subscription.max_special_orders_per_month) {
      console.log(`❌ Limite mensuelle atteinte: ${subscription.max_special_orders_per_month}`);
      return res.status(403).json({
        success: false,
        error: `Limite de commandes spéciales mensuelle atteinte (${subscription.max_special_orders_per_month}). Passez à un plan supérieur.`,
        limit: subscription.max_special_orders_per_month,
        current: currentCount,
        upgrade_required: true
      });
    }

    console.log('✅ Limite OK');
    next();
  } catch (error) {
    console.error('❌ Erreur vérification limite commandes spéciales:', error);
    res.status(500).json({
      success: false,
      error: 'Erreur serveur'
    });
  }
}

// ✅ Fonctions de compatibilité (gardées pour ne pas casser le code existant)
async function checkOnlineOrdersAllowed(req, res, next) {
  // Maintenant, on vérifie juste la limite mensuelle
  return checkMonthlyOrdersLimit(req, res, next);
}

async function checkReservationsAllowed(req, res, next) {
  // Maintenant, on vérifie juste la limite mensuelle
  return checkMonthlyReservationsLimit(req, res, next);
}

async function checkSpecialOrdersAllowed(req, res, next) {
  // Maintenant, on vérifie juste la limite mensuelle
  return checkMonthlySpecialOrdersLimit(req, res, next);
}

module.exports = {
  checkMenuItemsLimit,
  checkMonthlyOrdersLimit,
  checkMonthlyReservationsLimit,        
  checkMonthlySpecialOrdersLimit,       
  checkOnlineOrdersAllowed,
  checkReservationsAllowed,
  checkSpecialOrdersAllowed,
  getBusinessSubscription
};