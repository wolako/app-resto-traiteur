const { pool } = require('../config/db');
const Chat = require('../models/Chat');
const { HTTP_STATUS } = require('../config/constants');

/**
 * Obtenir ou créer une conversation
 */
exports.getOrCreateConversation = async (req, res) => {
  try {
    const { business_id, client_name, client_phone } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    if (!business_id) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'business_id requis'
      });
    }

    let clientInfo = {
      initiated_by: userRole || 'guest'
    };

    if (userId && userRole === 'client') {
      clientInfo.client_id = userId;
      clientInfo.client_name = `${req.user.first_name} ${req.user.last_name}`;
      clientInfo.client_phone = req.user.phone;
    } else {
      if (!client_name || !client_phone) {
        return res.status(HTTP_STATUS.BAD_REQUEST).json({
          success: false,
          message: 'client_name et client_phone requis pour les invités'
        });
      }
      clientInfo.client_name = client_name;
      clientInfo.client_phone = client_phone;
    }

    const conversation = await Chat.getOrCreateConversation(business_id, clientInfo);

    // ✅ pool déjà importé en haut — plus de require() dynamique ici
    const businessResult = await pool.query(
      `SELECT id, name, type, opening_hour, closing_hour, is_available 
       FROM businesses 
       WHERE id = $1`,
      [business_id]
    );

    if (businessResult.rows.length > 0) {
      const business = businessResult.rows[0];
      conversation.business_name = business.name;
      conversation.business_type = business.type;
      conversation.opening_hour = business.opening_hour;
      conversation.closing_hour = business.closing_hour;
      conversation.is_available = business.is_available;
    }

    res.json({ success: true, conversation });
  } catch (error) {
    console.error('Erreur création conversation:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la création de la conversation',
      error: error.message
    });
  }
};

/**
 * Récupérer les conversations d'un établissement
 */
exports.getBusinessConversations = async (req, res) => {
  try {
    const businessId = req.params.businessId || req.business?.id;
    const { status, limit, offset } = req.query;

    if (!businessId) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'business_id requis'
      });
    }

    const conversations = await Chat.getBusinessConversations(businessId, {
      status,
      limit: limit ? parseInt(limit) : 50,
      offset: offset ? parseInt(offset) : 0
    });

    res.json({ success: true, conversations, total: conversations.length });
  } catch (error) {
    console.error('Erreur récupération conversations business:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la récupération des conversations',
      error: error.message
    });
  }
};

/**
 * Récupérer les conversations d'un client
 */
exports.getClientConversations = async (req, res) => {
  try {
    const conversations = await Chat.getClientConversations(req.user.id);
    res.json({ success: true, conversations, total: conversations.length });
  } catch (error) {
    console.error('Erreur récupération conversations client:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la récupération des conversations',
      error: error.message
    });
  }
};

/**
 * Récupérer les messages d'une conversation
 */
exports.getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { limit, offset } = req.query;

    const messages = await Chat.getMessages(
      conversationId,
      limit ? parseInt(limit) : 50,
      offset ? parseInt(offset) : 0
    );

    res.json({ success: true, messages, total: messages.length });
  } catch (error) {
    console.error('Erreur récupération messages:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la récupération des messages',
      error: error.message
    });
  }
};

/**
 * Envoyer un message
 */
exports.sendMessage = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { message, message_type = 'text' } = req.body;
    const userId = req.user?.id;
    const userRole = req.user?.role || 'guest';

    if (!message) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'Message requis'
      });
    }

    let senderType = 'guest';
    if (userRole === 'client') {
      senderType = 'client';
    } else if (userRole === 'restaurant' || userRole === 'traiteur') {
      senderType = 'business';
    }

    const newMessage = await Chat.sendMessage({
      conversation_id: conversationId,
      sender_id: userId || null,
      sender_type: senderType,
      message,
      message_type
    });

    res.json({ success: true, message: newMessage });
  } catch (error) {
    console.error('Erreur envoi message:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de l\'envoi du message',
      error: error.message
    });
  }
};

/**
 * Marquer les messages comme lus
 */
exports.markAsRead = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const userRole = req.user?.role;

    let senderType;
    if (userRole === 'client') {
      senderType = 'client';
    } else if (userRole === 'restaurant' || userRole === 'traiteur') {
      senderType = 'business';
    } else {
      return res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    const count = await Chat.markAsRead(conversationId, senderType);
    res.json({ success: true, marked_count: count });
  } catch (error) {
    console.error('Erreur marquage messages lus:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors du marquage des messages',
      error: error.message
    });
  }
};

/**
 * Fermer une conversation
 */
exports.closeConversation = async (req, res) => {
  try {
    const conversation = await Chat.closeConversation(req.params.conversationId);
    res.json({ success: true, conversation });
  } catch (error) {
    console.error('Erreur fermeture conversation:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la fermeture de la conversation',
      error: error.message
    });
  }
};

/**
 * Obtenir le nombre de messages non lus
 */
exports.getUnreadCount = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    let count = 0;

    if (userRole === 'client') {
      count = await Chat.getUnreadCountForClient(userId);
    } else if (userRole === 'restaurant' || userRole === 'traiteur') {
      // ✅ pool importé en haut — plus de require() dynamique ici
      const result = await pool.query(
        'SELECT id FROM businesses WHERE user_id = $1',
        [userId]
      );
      if (result.rows.length > 0) {
        count = await Chat.getUnreadCountForBusiness(result.rows[0].id);
      }
    }

    res.json({ success: true, unread_count: count });
  } catch (error) {
    console.error('Erreur comptage messages non lus:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors du comptage des messages non lus',
      error: error.message
    });
  }
};

/**
 * Supprimer une conversation (soft delete → status = 'deleted')
 */
exports.deleteConversation = async (req, res) => {
  try {
    const conversationId = parseInt(req.params.conversationId);

    if (isNaN(conversationId)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'ID de conversation invalide'
      });
    }

    const conversation = await Chat.getConversation(conversationId);
    if (!conversation) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Conversation introuvable'
      });
    }

    const deleted = await Chat.deleteConversation(conversationId);

    if (deleted) {
      res.json({ success: true, message: 'Conversation supprimée', conversation_id: conversationId });
    } else {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Impossible de supprimer la conversation'
      });
    }
  } catch (error) {
    console.error('❌ Erreur DELETE conversation:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la suppression de la conversation',
      error: error.message
    });
  }
};

/**
 * Supprimer un message (hard delete)
 */
exports.deleteMessage = async (req, res) => {
  try {
    const messageId = parseInt(req.params.messageId);

    if (isNaN(messageId)) {
      return res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: 'ID de message invalide'
      });
    }

    const message = await Chat.getMessage(messageId);
    if (!message) {
      return res.status(HTTP_STATUS.NOT_FOUND).json({
        success: false,
        message: 'Message introuvable'
      });
    }

    const deleted = await Chat.deleteMessage(messageId);

    if (deleted) {
      res.json({
        success: true,
        message: 'Message supprimé',
        message_id: messageId,
        conversation_id: message.conversation_id
      });
    } else {
      res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Impossible de supprimer le message'
      });
    }
  } catch (error) {
    console.error('❌ Erreur DELETE message:', error);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Erreur lors de la suppression du message',
      error: error.message
    });
  }
};