/**
 * Middleware pour attacher automatiquement le client_id aux requêtes
 * si l'utilisateur est connecté en tant que client
 */
const attachClient = (req, res, next) => {
  // Si l'utilisateur est authentifié et est un client
  if (req.user && req.user.role === 'client') {
    // Attacher le client_id au body pour les requêtes POST/PUT/PATCH
    if (req.body && typeof req.body === 'object') {
      req.body.client_id = req.user.id;
    }
    
    // Attacher aussi directement à req pour un accès facile
    req.client_id = req.user.id;
  }
  
  next();
};

module.exports = { attachClient };