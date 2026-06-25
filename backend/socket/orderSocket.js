// socket/orderSocket.js
function orderSocket(io) {
  io.on('connection', (socket) => {
    const user = socket.user;
    if (!user || user.role === 'guest') return; // le chat gère déjà les invités

    // Chaque utilisateur rejoint automatiquement sa room personnelle
    if (user.role === 'driver') {
      socket.join(`driver_${user.userId}`);
    }
    if (user.role === 'client') {
      socket.join(`client_${user.userId}`);
    }

    // Établissement : rejoint sa room business sur demande du frontend
    socket.on('join_business', (businessId) => {
      if (businessId) socket.join(`business_${businessId}`);
    });
  });
}

module.exports = orderSocket;