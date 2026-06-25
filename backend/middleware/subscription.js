// middleware/subscription.middleware.js
const Subscription = require('../models/Subscription');
const { pool }     = require('../config/db');

/**
 * Auto-assigner le plan gratuit si aucun abonnement actif trouvé.
 */
async function autoAssignFreePlanIfNeeded(businessId) {
  const freePlan = await pool.query(
    `SELECT id FROM subscription_plans WHERE name = 'free' AND is_active = true LIMIT 1`
  );
  if (!freePlan.rows[0]) return;

  await pool.query(
    `INSERT INTO business_subscriptions
       (business_id, plan_id, status, start_date, end_date, auto_renew)
     VALUES ($1, $2, 'active', NOW(), NULL, false)`,
    [businessId, freePlan.rows[0].id]
  );

  // Réactiver le business au passage
  await pool.query(
    `UPDATE businesses SET is_active = true, updated_at = NOW() WHERE id = $1`,
    [businessId]
  );
}

const checkSubscriptionLimits = (feature) => {
  return async (req, res, next) => {
    try {
      const businessId = req.business?.id || req.user?.business_id;

      if (!businessId) {
        return res.status(400).json({ error: 'Business ID manquant' });
      }

      let subscription = await Subscription.getByBusinessId(businessId);

      // ✅ Pas d'abonnement actif → auto-assigner le plan gratuit
      if (!subscription) {
        await autoAssignFreePlanIfNeeded(businessId);
        subscription = await Subscription.getByBusinessId(businessId);
      }

      // ✅ Si toujours rien (cas exceptionnel), laisser passer avec les droits minimum
      if (!subscription) {
        req.subscription = null;
        return next();
      }

      switch (feature) {
        case 'online_orders':
          if (!subscription.can_accept_online_orders) {
            return res.status(403).json({
              error: 'Fonctionnalité non disponible',
              message: 'Votre plan ne permet pas les commandes en ligne',
              upgrade_required: true
            });
          }
          break;

        case 'reservations':
          if (!subscription.can_accept_reservations) {
            return res.status(403).json({
              error: 'Fonctionnalité non disponible',
              message: 'Votre plan ne permet pas les réservations',
              upgrade_required: true
            });
          }
          break;

        case 'special_orders':
          if (!subscription.can_accept_special_orders) {
            return res.status(403).json({
              error: 'Fonctionnalité non disponible',
              message: 'Votre plan ne permet pas les commandes spéciales',
              upgrade_required: true
            });
          }
          break;
      }

      req.subscription = subscription;
      next();
    } catch (error) {
      console.error('Erreur vérification abonnement:', error);
      // ✅ En cas d'erreur du middleware, laisser passer plutôt que bloquer
      next();
    }
  };
};

module.exports = { checkSubscriptionLimits };