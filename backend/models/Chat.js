const { pool } = require('../config/db');

class Chat {
  static async createConversation(businessId, clientInfo) {
    const { client_id, client_name, client_phone, initiated_by } = clientInfo;
    
    const result = await pool.query(
      `INSERT INTO chat_conversations (business_id, client_id, client_name, client_phone, initiated_by, last_message_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       RETURNING *`,
      [businessId, client_id || null, client_name, client_phone, initiated_by]
    );
    
    return result.rows[0];
  }

  static async getOrCreateConversation(businessId, clientInfo) {
    const { client_id, client_name, client_phone } = clientInfo;
    
    let conversation;
    
    if (client_id) {
      const result = await pool.query(
        `SELECT cc.*, b.name as business_name, b.type as business_type,
         b.opening_hour, b.closing_hour, b.is_available
         FROM chat_conversations cc
         JOIN businesses b ON cc.business_id = b.id
         WHERE cc.business_id = $1 AND cc.client_id = $2 AND cc.status = 'open'
         ORDER BY cc.created_at DESC LIMIT 1`,
        [businessId, client_id]
      );
      conversation = result.rows[0];
    } else {
      const result = await pool.query(
        `SELECT cc.*, b.name as business_name, b.type as business_type,
         b.opening_hour, b.closing_hour, b.is_available
         FROM chat_conversations cc
         JOIN businesses b ON cc.business_id = b.id
         WHERE cc.business_id = $1 AND cc.client_phone = $2 AND cc.status = 'open'
         ORDER BY cc.created_at DESC LIMIT 1`,
        [businessId, client_phone]
      );
      conversation = result.rows[0];
    }
    
    if (!conversation) {
      const newConv = await this.createConversation(businessId, clientInfo);
      const result = await pool.query(
        `SELECT cc.*, b.name as business_name, b.type as business_type,
         b.opening_hour, b.closing_hour, b.is_available
         FROM chat_conversations cc
         JOIN businesses b ON cc.business_id = b.id
         WHERE cc.id = $1`,
        [newConv.id]
      );
      conversation = result.rows[0];
    }
    
    return conversation;
  }

  static async getConversation(conversationId) {
    const result = await pool.query(
      `SELECT * FROM chat_conversations WHERE id = $1`,
      [conversationId]
    );
    return result.rows[0];
  }

  static async getBusinessConversations(businessId, filters = {}) {
    const { status = 'open', limit = 50, offset = 0 } = filters;
    
    console.log('📂 [MODEL] getBusinessConversations appelé');
    console.log('📂 [MODEL] businessId:', businessId);
    console.log('📂 [MODEL] status:', status);
    
    const result = await pool.query(
      `SELECT 
        cc.*,
        u.first_name, u.last_name, u.phone,
        COUNT(cm.id) FILTER (WHERE cm.is_read = false AND (cm.sender_type = 'client' OR cm.sender_type = 'guest')) as unread_count,
        (SELECT message FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_conversations cc
      LEFT JOIN users u ON cc.client_id = u.id
      LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
      WHERE cc.business_id = $1 AND cc.status = $2
      GROUP BY cc.id, u.first_name, u.last_name, u.phone
      ORDER BY cc.last_message_at DESC
      LIMIT $3 OFFSET $4`,
      [businessId, status, limit, offset]
    );
    
    console.log('📂 [MODEL] Conversations trouvées:', result.rows.length);
    console.log('📂 [MODEL] Premières conversations:', result.rows.slice(0, 2));
    
    return result.rows;
  }

  static async getClientConversations(clientId) {
    const result = await pool.query(
      `SELECT 
        cc.*,
        b.name as business_name, 
        b.type as business_type,
        b.opening_hour,
        b.closing_hour,
        b.is_available,
        COUNT(cm.id) FILTER (WHERE cm.is_read = false AND cm.sender_type = 'business') as unread_count,
        (SELECT message FROM chat_messages WHERE conversation_id = cc.id ORDER BY created_at DESC LIMIT 1) as last_message
       FROM chat_conversations cc
       JOIN businesses b ON cc.business_id = b.id
       LEFT JOIN chat_messages cm ON cc.id = cm.conversation_id
       WHERE cc.client_id = $1 AND cc.status = 'open'
       GROUP BY cc.id, b.name, b.type, b.opening_hour, b.closing_hour, b.is_available
       ORDER BY cc.last_message_at DESC`,
      [clientId]
    );
    
    return result.rows;
  }

  static async getMessages(conversationId, limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT cm.*, 
      COALESCE(
        CASE 
          WHEN cm.sender_type = 'business' THEN b.name
          WHEN cm.sender_type = 'client' THEN u.first_name || ' ' || u.last_name
          ELSE 'Invité'
        END,
        cm.sender_type
      ) as sender_name
      FROM chat_messages cm
      LEFT JOIN users u ON cm.sender_id = u.id AND cm.sender_type = 'client'
      LEFT JOIN chat_conversations cc ON cm.conversation_id = cc.id
      LEFT JOIN businesses b ON cc.business_id = b.id AND cm.sender_type = 'business'
      WHERE cm.conversation_id = $1
      ORDER BY cm.created_at ASC
      LIMIT $2 OFFSET $3`,
      [conversationId, limit, offset]
    );
    
    return result.rows;
  }

  static async getMessage(messageId) {
    const result = await pool.query(
      `SELECT * FROM chat_messages WHERE id = $1`,
      [messageId]
    );
    return result.rows[0];
  }

  static async sendMessage(messageData) {
    const { conversation_id, sender_id, sender_type, message, message_type = 'text' } = messageData;
    
    console.log('📝 Chat.sendMessage - Données:', messageData);
    
    const result = await pool.query(
      `INSERT INTO chat_messages (conversation_id, sender_id, sender_type, message, message_type)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [conversation_id, sender_id, sender_type, message, message_type]
    );
    
    await pool.query(
      `UPDATE chat_conversations SET last_message_at = NOW() WHERE id = $1`,
      [conversation_id]
    );
    
    console.log('✅ Message sauvegardé:', result.rows[0]);
    return result.rows[0];
  }

  static async markAsRead(conversationId, senderType) {
    const oppositeType = senderType === 'business' ? ['client', 'guest'] : ['business'];
    
    const result = await pool.query(
      `UPDATE chat_messages 
       SET is_read = true, read_at = NOW()
       WHERE conversation_id = $1 
       AND sender_type = ANY($2)
       AND is_read = false
       RETURNING id`,
      [conversationId, oppositeType]
    );
    
    return result.rowCount;
  }

  static async closeConversation(conversationId) {
    const result = await pool.query(
      `UPDATE chat_conversations SET status = 'closed' WHERE id = $1 RETURNING *`,
      [conversationId]
    );
    return result.rows[0];
  }

  static async deleteConversation(conversationId) {
    const result = await pool.query(
      `UPDATE chat_conversations SET status = 'deleted' WHERE id = $1 RETURNING id`,
      [conversationId]
    );
    return result.rowCount > 0;
  }

  static async deleteMessage(messageId) {
    const result = await pool.query(
      `DELETE FROM chat_messages WHERE id = $1 RETURNING id`,
      [messageId]
    );
    return result.rowCount > 0;
  }

  static async getUnreadCountForClient(clientId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM chat_messages cm
       JOIN chat_conversations cc ON cm.conversation_id = cc.id
       WHERE cc.client_id = $1 
       AND cm.sender_type = 'business' 
       AND cm.is_read = false
       AND cc.status = 'open'`,
      [clientId]
    );
    return parseInt(result.rows[0].count);
  }

  static async getUnreadCountForBusiness(businessId) {
    const result = await pool.query(
      `SELECT COUNT(*) as count 
       FROM chat_messages cm
       JOIN chat_conversations cc ON cm.conversation_id = cc.id
       WHERE cc.business_id = $1 
       AND (cm.sender_type = 'client' OR cm.sender_type = 'guest')
       AND cm.is_read = false
       AND cc.status = 'open'`,
      [businessId]
    );
    return parseInt(result.rows[0].count);
  }
}

module.exports = Chat;