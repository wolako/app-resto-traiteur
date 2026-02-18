const Subscription = require('../models/Subscription');
const AppSetting = require('../models/AppSetting');

// Vérifier les limites de l'abonnement
const checkSubscriptionLimits = (feature) => {
  return async (req, res, next) => {
    try {
      const businessId = req.business?.id || req.user?.business_id;
      
      if (!businessId) {
        return res.status(400).json({ error: 'Business ID manquant' });
      }

      const subscription = await Subscription.getByBusinessId(businessId);
      
      if (!subscription) {
        return res.status(403).json({ 
          error: 'Aucun abonnement actif',
          message: 'Veuillez souscrire à un plan pour continuer'
        });
      }

      // Vérifier selon la fonctionnalité
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
      res.status(500).json({ error: 'Erreur serveur' });
    }
  };
};

module.exports = { checkSubscriptionLimits };