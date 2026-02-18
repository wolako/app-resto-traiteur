// routes/chat.js
const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { authenticateToken } = require('../middleware/auth');
const { optionalAuth } = require('../middleware/optionalAuth');

// ========================================
// CONVERSATIONS
// ========================================

/**
 * POST /api/chat/conversations
 * Créer ou récupérer une conversation
 * Authentification optionnelle (permet aux invités de créer des conversations)
 */
router.post('/conversations', optionalAuth, chatController.getOrCreateConversation);

/**
 * GET /api/chat/conversations/business/:businessId
 * Récupérer toutes les conversations d'un établissement
 * Authentification requise
 */
router.get('/conversations/business/:businessId', authenticateToken, chatController.getBusinessConversations);

/**
 * GET /api/chat/conversations/client
 * Récupérer toutes les conversations d'un client
 * Authentification requise
 */
router.get('/conversations/client', authenticateToken, chatController.getClientConversations);

/**
 * DELETE /api/chat/conversations/:conversationId
 * Supprimer une conversation
 * Authentification optionnelle (permet aux invités de supprimer leurs conversations)
 */
router.delete('/conversations/:conversationId', optionalAuth, chatController.deleteConversation);

/**
 * PUT /api/chat/conversations/:conversationId/close
 * Fermer une conversation
 * Authentification requise
 */
router.put('/conversations/:conversationId/close', authenticateToken, chatController.closeConversation);

// ========================================
// MESSAGES
// ========================================

/**
 * GET /api/chat/conversations/:conversationId/messages
 * Récupérer tous les messages d'une conversation
 * Authentification optionnelle (permet aux invités de lire les messages)
 */
router.get('/conversations/:conversationId/messages', optionalAuth, chatController.getMessages);

/**
 * POST /api/chat/conversations/:conversationId/messages
 * Envoyer un message dans une conversation
 * Authentification optionnelle (permet aux invités d'envoyer des messages)
 */
router.post('/conversations/:conversationId/messages', optionalAuth, chatController.sendMessage);

/**
 * DELETE /api/chat/messages/:messageId
 * Supprimer un message
 * Authentification optionnelle (permet aux invités de supprimer leurs messages)
 */
router.delete('/messages/:messageId', optionalAuth, chatController.deleteMessage);

/**
 * PUT /api/chat/conversations/:conversationId/read
 * Marquer les messages d'une conversation comme lus
 * Authentification requise
 */
router.put('/conversations/:conversationId/read', authenticateToken, chatController.markAsRead);

// ========================================
// COMPTEURS
// ========================================

/**
 * GET /api/chat/unread-count
 * Obtenir le nombre de messages non lus
 * Authentification requise
 */
router.get('/unread-count', authenticateToken, chatController.getUnreadCount);

module.exports = router;