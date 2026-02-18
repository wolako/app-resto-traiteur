// middleware/socketAuth.js
const jwt = require('jsonwebtoken');

/**
 * Middleware d'authentification pour Socket.IO
 * Gère à la fois les utilisateurs authentifiés et les invités
 */
module.exports = function socketAuth(io) {
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      const guestName = socket.handshake.auth.guestName;
      const guestPhone = socket.handshake.auth.guestPhone;

      console.log('🔐 [SOCKET AUTH] Nouvelle connexion socket');
      console.log('   - Token présent:', !!token);
      console.log('   - Guest info:', { guestName, guestPhone });

      if (token) {
        // ✅ UTILISATEUR AUTHENTIFIÉ
        try {
          const decoded = jwt.verify(token, process.env.JWT_SECRET);
          
          socket.user = {
            userId: decoded.userId || decoded.id,  // Support des deux formats
            role: decoded.role,
            first_name: decoded.first_name,
            last_name: decoded.last_name,
            email: decoded.email
          };
          
          console.log('✅ [SOCKET AUTH] Utilisateur authentifié:');
          console.log('   - userId:', socket.user.userId);
          console.log('   - role:', socket.user.role);
          console.log('   - name:', socket.user.first_name);
          
        } catch (jwtError) {
          console.error('❌ [SOCKET AUTH] Token invalide:', jwtError.message);
          return next(new Error('Invalid token'));
        }
        
      } else if (guestName && guestPhone) {
        // ✅ INVITÉ
        socket.user = {
          role: 'guest',
          guestName,
          guestPhone,
          userId: null  // Pas d'ID pour les invités
        };
        
        console.log('✅ [SOCKET AUTH] Invité connecté:');
        console.log('   - role: guest');
        console.log('   - name:', guestName);
        console.log('   - phone:', guestPhone);
        
      } else {
        // ❌ Pas d'authentification
        console.log('❌ [SOCKET AUTH] Aucune authentification fournie');
        return next(new Error('Authentication required'));
      }

      // ✅ Authentification réussie
      next();
      
    } catch (error) {
      console.error('❌ [SOCKET AUTH] Erreur:', error);
      next(new Error('Authentication failed'));
    }
  });
};