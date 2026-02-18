// socket/chatSocket.js
const Chat = require('../models/Chat');

module.exports = function chatSocket(io) {
  console.log('🔵 [SOCKET] Initialisation du gestionnaire de chat');

  // ✅ Écouter les nouvelles connexions
  io.on('connection', (socket) => {
    const user = socket.user; // ✅ Défini par le middleware d'authentification
    
    console.log('✅ Client connecté au chat:', socket.id);
    console.log('   User:', user);

    // ========================================
    // REJOINDRE / QUITTER UNE CONVERSATION
    // ========================================

    socket.on('join_conversation', async (conversationId) => {
      try {
        const room = `conversation_${conversationId}`;
        await socket.join(room);
        console.log(`👥 Socket ${socket.id} a rejoint conversation ${conversationId}`);
        
        // ✅ Confirmer au client
        socket.emit('joined_room', { conversation_id: conversationId, room });
      } catch (error) {
        console.error('❌ Erreur join_conversation:', error);
      }
    });

    socket.on('leave_conversation', (conversationId) => {
      const room = `conversation_${conversationId}`;
      socket.leave(room);
      console.log(`👋 Socket ${socket.id} a quitté conversation ${conversationId}`);
    });

    // ========================================
    // ENVOYER UN MESSAGE
    // ========================================

    socket.on('send_message', async (data) => {
      try {
        const { conversation_id, message, message_type = 'text' } = data;

        console.log('📝 [SERVER] send_message reçu');
        console.log('📝 [SERVER] Conversation:', conversation_id);
        console.log('📝 [SERVER] Message:', message);
        console.log('📝 [SERVER] User:', user);
        console.log('📝 [SERVER] Socket ID:', socket.id);

        // Déterminer sender_id et sender_type selon le type d'utilisateur
        let sender_id = null;
        let sender_type = 'guest'; // Par défaut

        if (user) {
          if (user.userId) {
            // Utilisateur authentifié
            sender_id = user.userId;
            
            // Déterminer le type
            if (user.role === 'restaurant' || user.role === 'traiteur') {
              sender_type = 'business';
            } else if (user.role === 'client') {
              sender_type = 'client';
            }
          } else if (user.role === 'guest') {
            // Invité
            sender_id = null;
            sender_type = 'guest';
          }
        }

        console.log('📝 [SERVER] Sender déterminé:', { sender_id, sender_type });

        // Sauvegarder le message en base
        const savedMessage = await Chat.sendMessage({
          conversation_id,
          sender_id,
          sender_type,
          message,
          message_type
        });

        console.log('✅ [SERVER] Message sauvegardé en DB:', savedMessage.id);

        // Enrichir le message
        const enrichedMessage = {
          id: savedMessage.id,
          conversation_id: savedMessage.conversation_id,
          sender_id: savedMessage.sender_id,
          sender_type: savedMessage.sender_type,
          sender_name: user?.first_name || user?.guestName || sender_type,
          message: savedMessage.message,
          message_type: savedMessage.message_type,
          is_read: savedMessage.is_read,
          created_at: savedMessage.created_at
        };

        const room = `conversation_${conversation_id}`;
        
        // ✅ Vérifier combien de clients sont dans la room
        const socketsInRoom = await io.in(room).allSockets();
        console.log(`📨 [SERVER] Broadcast vers room: ${room}`);
        console.log(`📨 [SERVER] Nombre de sockets dans la room: ${socketsInRoom.size}`);
        console.log(`📨 [SERVER] Socket IDs dans la room:`, Array.from(socketsInRoom));
        
        // Broadcaster le message à TOUS les participants (y compris l'expéditeur)
        io.to(room).emit('new_message', enrichedMessage);
        
        console.log(`✅ [SERVER] Message broadcasted`);

      } catch (error) {
        console.error('❌ [SERVER] Erreur envoi message:', error);
        socket.emit('error', {
          message: "Erreur lors de l'envoi du message",
          details: error.message
        });
      }
    });

    // ========================================
    // INDICATEUR DE FRAPPE
    // ========================================

    socket.on('typing_start', (data) => {
      const { conversation_id } = data;
      const room = `conversation_${conversation_id}`;
      socket.to(room).emit('user_typing', {
        socket_id: socket.id,
        user_name: user?.name || user?.guestName || user?.first_name || 'Utilisateur'
      });
    });

    socket.on('typing_stop', (data) => {
      const { conversation_id } = data;
      const room = `conversation_${conversation_id}`;
      socket.to(room).emit('user_stopped_typing', { socket_id: socket.id });
    });

    // ========================================
    // MESSAGES LUS
    // ========================================

    socket.on('mark_as_read', async (data) => {
      try {
        const { conversation_id } = data;

        let senderType = 'client';
        if (user?.role === 'restaurant' || user?.role === 'traiteur') {
          senderType = 'business';
        } else if (user?.role === 'guest') {
          senderType = 'guest';
        }

        await Chat.markAsRead(conversation_id, senderType);

        const room = `conversation_${conversation_id}`;
        io.to(room).emit('messages_read', { conversation_id, read_by: senderType });

        console.log(`✓ Messages marqués comme lus dans conversation ${conversation_id} par ${senderType}`);
      } catch (error) {
        console.error('❌ Erreur mark_as_read:', error);
      }
    });

    // ========================================
    // SUPPRESSION DE CONVERSATION
    // ========================================

    socket.on('delete_conversation', async (data) => {
      try {
        const { conversation_id } = data;

        console.log(`🗑️ Suppression conversation ${conversation_id} par socket ${socket.id}`);

        // Vérifier que la conversation existe
        const conversation = await Chat.getConversation(conversation_id);
        if (!conversation) {
          socket.emit('error', { message: 'Conversation introuvable' });
          return;
        }

        // Supprimer la conversation
        const deleted = await Chat.deleteConversation(conversation_id);

        if (deleted) {
          const room = `conversation_${conversation_id}`;

          // Notifier tous les participants
          io.to(room).emit('conversation_deleted', {
            conversation_id: conversation_id
          });

          console.log(`✅ Conversation ${conversation_id} supprimée avec succès`);
        } else {
          socket.emit('error', { message: 'Impossible de supprimer la conversation' });
        }

      } catch (error) {
        console.error('❌ Erreur delete_conversation:', error);
        socket.emit('error', {
          message: "Erreur lors de la suppression de la conversation",
          details: error.message
        });
      }
    });

    // ========================================
    // SUPPRESSION DE MESSAGE
    // ========================================

    socket.on('delete_message', async (data) => {
      try {
        const { message_id, conversation_id } = data;

        console.log(`🗑️ Suppression message ${message_id} dans conversation ${conversation_id}`);

        // Récupérer le message
        const message = await Chat.getMessage(message_id);
        if (!message) {
          socket.emit('error', { message: 'Message introuvable' });
          return;
        }

        // Vérifier que le message appartient à la conversation
        if (message.conversation_id !== conversation_id) {
          socket.emit('error', { message: 'Message non trouvé dans cette conversation' });
          return;
        }

        // Supprimer le message
        const deleted = await Chat.deleteMessage(message_id);

        if (deleted) {
          const room = `conversation_${conversation_id}`;

          // Notifier tous les participants
          io.to(room).emit('message_deleted', {
            message_id: message_id,
            conversation_id: conversation_id
          });

          console.log(`✅ Message ${message_id} supprimé avec succès`);
        } else {
          socket.emit('error', { message: 'Impossible de supprimer le message' });
        }

      } catch (error) {
        console.error('❌ Erreur delete_message:', error);
        socket.emit('error', {
          message: "Erreur lors de la suppression du message",
          details: error.message
        });
      }
    });

    // ========================================
    // DÉCONNEXION
    // ========================================

    socket.on('disconnect', () => {
      console.log(`🔴 Socket ${socket.id} déconnecté`);
    });
  });
};