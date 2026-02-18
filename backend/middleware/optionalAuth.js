// middleware/optionalAuth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification optionnelle
 * Permet l'accès aux invités tout en identifiant les utilisateurs authentifiés
 */
const optionalAuth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Pas de token - continuer en tant qu'invité
      req.user = null;
      return next();
    }

    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Enrichir avec les infos utilisateur depuis la DB si nécessaire
      req.user = {
        id: decoded.userId,
        role: decoded.role || 'client'
      };
      next();
    } catch (error) {
      // Token invalide - continuer en tant qu'invité
      req.user = null;
      next();
    }
  } catch (error) {
    // Erreur générale - continuer en tant qu'invité
    req.user = null;
    next();
  }
};

module.exports = { optionalAuth };