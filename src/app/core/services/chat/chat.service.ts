// src/app/core/services/chat/chat.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { io, Socket } from 'socket.io-client';
import { environment } from '../../../../environments/environment';

export interface ChatConversation {
  id: number;
  business_id: number;
  client_id?: number;
  client_name: string;
  client_phone: string;
  business_name?: string;
  business_type?: string;
  opening_hour?: string;
  closing_hour?: string;
  is_available?: boolean;
  initiated_by: string;
  status: string;
  last_message_at: string;
  last_message?: string;
  unread_count: number;
  created_at: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number | null;
  sender_type: 'client' | 'business' | 'guest';
  sender_name: string;
  message: string;
  message_type: 'text' | 'image' | 'file';
  is_read: boolean;
  read_at?: string;
  created_at: string;
}

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiUrl = `${environment.apiUrl}/chat`;
  private socketUrl = environment.apiUrl.replace(/\/api$/, '');

  private socket?: Socket;
  private socketReadyPromise?: Promise<void>;
  
  // Observables
  private messagesSubject = new BehaviorSubject<ChatMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();
  
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();
  
  private typingSubject = new BehaviorSubject<{ isTyping: boolean; userName?: string }>({ isTyping: false });
  public typing$ = this.typingSubject.asObservable();

  private activeConversationSubject = new BehaviorSubject<ChatConversation | null>(null);
  public activeConversation$ = this.activeConversationSubject.asObservable();

  private conversationDeletedSubject = new BehaviorSubject<number | null>(null);
  public conversationDeleted$ = this.conversationDeletedSubject.asObservable();

  // ✅ AJOUT: Observable pour les messages lus
  private messagesReadSubject = new BehaviorSubject<void>(undefined);
  public messagesRead$ = this.messagesReadSubject.asObservable();

  constructor(private http: HttpClient) {
    console.log('🔵 ChatService créé');
    console.log('🔵 apiUrl (REST):', this.apiUrl);
    console.log('🔵 socketUrl (Socket.IO):', this.socketUrl);
  }

  // ========================================
  // API REST
  // ========================================

  getOrCreateConversation(businessId: number, guestInfo?: { client_name: string; client_phone: string }): Observable<any> {
    console.log('🟢 getOrCreateConversation appelé', { businessId, guestInfo });
    return this.http.post(`${this.apiUrl}/conversations`, {
      business_id: businessId,
      ...guestInfo
    });
  }

  getBusinessConversations(businessId: number): Observable<any> {
    return this.http.get(`${this.apiUrl}/conversations/business/${businessId}`);
  }

  getClientConversations(): Observable<any> {
    return this.http.get(`${this.apiUrl}/conversations/client`);
  }

  getMessages(conversationId: number): Observable<any> {
    console.log('🟢 getMessages appelé', { conversationId });
    return this.http.get(`${this.apiUrl}/conversations/${conversationId}/messages`);
  }

  getUnreadCount(): Observable<any> {
    return this.http.get(`${this.apiUrl}/unread-count`);
  }

  deleteConversation(conversationId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/conversations/${conversationId}`);
  }

  deleteMessage(messageId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/messages/${messageId}`);
  }

  // ========================================
  // SOCKET.IO
  // ========================================

  connectSocket(token?: string, guestInfo?: { guestName: string; guestPhone: string }) {
    console.log('🔵 connectSocket appelé', { hasToken: !!token, guestInfo });
    
    if (this.socket?.connected) {
      console.log('⚠️ Socket déjà connecté');
      
      if ((token || guestInfo)) {
        console.log('🔄 Déconnexion pour reconnexion avec nouvelles credentials');
        this.socket.disconnect();
        this.socket = undefined;
      } else {
        console.log('⚠️ Réutilisation du socket existant');
        return;
      }
    }

    const auth: any = {};
    
    if (token) {
      auth.token = token;
      console.log('🔑 Connexion avec token');
    } else if (guestInfo) {
      auth.guestName = guestInfo.guestName;
      auth.guestPhone = guestInfo.guestPhone;
      console.log('👤 Connexion en tant qu\'invité', guestInfo);
    }

    console.log('🔵 Connexion Socket.IO vers:', this.socketUrl);
    
    this.socket = io(this.socketUrl, {
      auth,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5
    });

    this.socketReadyPromise = new Promise((resolve) => {
      this.socket!.on('connect', () => {
        console.log('✅ Connecté au chat Socket.IO', this.socket?.id);
        resolve();
      });
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Déconnecté du chat Socket.IO');
    });

    this.socket.on('connect_error', (error: any) => {
      console.error('❌ Erreur de connexion Socket.IO:', error);
    });

    this.socket.on('error', (error: any) => {
      console.error('❌ Socket error:', error);
    });

    console.log('🔵 Configuration du listener new_message');

    // Nouveau message
    this.socket.on('new_message', (message: ChatMessage) => {
      console.log('📨 [SOCKET EVENT] new_message reçu:', message);
      console.log('📨 [CURRENT STATE] Messages actuels:', this.messagesSubject.value.length);
      
      const currentMessages = this.messagesSubject.value;
      const messageExists = currentMessages.some(m => m.id === message.id);
      
      console.log('📨 [CHECK] Message existe déjà?', messageExists);
      
      if (!messageExists) {
        const updatedMessages = [...currentMessages, message];
        console.log('📨 [UPDATE] Nouveaux messages:', updatedMessages.length);
        this.messagesSubject.next(updatedMessages);
      } else {
        console.log('⚠️ Message déjà dans la liste, ignoré');
      }
    });

    // Message supprimé
    this.socket.on('message_deleted', (data: { message_id: number; conversation_id: number }) => {
      console.log('🗑️ Message supprimé via socket:', data);
      const currentMessages = this.messagesSubject.value;
      const updatedMessages = currentMessages.filter(m => m.id !== data.message_id);
      this.messagesSubject.next(updatedMessages);
    });

    // Conversation supprimée
    this.socket.on('conversation_deleted', (data: { conversation_id: number }) => {
      console.log('🗑️ Conversation supprimée via socket:', data);
      this.conversationDeletedSubject.next(data.conversation_id);
      
      const active = this.activeConversationSubject.value;
      if (active && active.id === data.conversation_id) {
        this.activeConversationSubject.next(null);
        this.messagesSubject.next([]);
      }
    });

    // Indicateur de frappe
    this.socket.on('user_typing', (data: any) => {
      this.typingSubject.next({ isTyping: true, userName: data.user_name });
    });

    this.socket.on('user_stopped_typing', () => {
      this.typingSubject.next({ isTyping: false });
    });

    // ✅ CORRECTION: Messages lus - Notifier l'UI
    this.socket.on('messages_read', (data: any) => {
      console.log('👁️ Messages marqués comme lus:', data);
      
      // Mettre à jour les messages dans le state
      const currentMessages = this.messagesSubject.value.map(msg => ({
        ...msg,
        is_read: true
      }));
      this.messagesSubject.next(currentMessages);
      
      // ✅ Émettre un événement pour notifier le composant
      this.messagesReadSubject.next();
      
      // Mettre à jour le compteur
      this.loadUnreadCount();
    });

    // Mise à jour compteur non lus
    this.socket.on('unread_count_updated', () => {
      this.loadUnreadCount();
    });
  }

  disconnectSocket() {
    console.log('🔴 Déconnexion du socket');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = undefined;
      this.socketReadyPromise = undefined;
    }
  }

  isSocketConnected(): boolean {
    return this.socket?.connected || false;
  }

  async waitForSocketReady(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }
    
    if (!this.socketReadyPromise) {
      return Promise.reject('Socket not initialized');
    }
    
    return this.socketReadyPromise;
  }

  async joinConversation(conversationId: number) {
    console.log('👥 [JOIN] Rejoindre conversation:', conversationId);
    
    try {
      await this.waitForSocketReady();
      
      console.log('👥 [JOIN] Socket prêt, émission de join_conversation');
      this.socket!.emit('join_conversation', conversationId);
    } catch (error) {
      console.error('❌ [JOIN] Erreur:', error);
    }
  }

  leaveConversation(conversationId: number) {
    this.socket?.emit('leave_conversation', conversationId);
  }

  sendMessage(conversationId: number, message: string, messageType: string = 'text') {
    console.log('💬 [SEND] Envoi message');
    console.log('💬 [SEND] Conversation:', conversationId);
    console.log('💬 [SEND] Message:', message);
    console.log('💬 [SEND] Socket connecté?', this.socket?.connected);
    console.log('💬 [SEND] Socket ID:', this.socket?.id);
    
    if (!this.socket?.connected) {
      console.error('❌ [SEND] Socket non connecté!');
      return;
    }
    
    const payload = {
      conversation_id: conversationId,
      message,
      message_type: messageType
    };
    
    console.log('💬 [SEND] Payload:', payload);
    
    this.socket.emit('send_message', payload);
    
    console.log('✅ [SEND] Message émis vers le serveur');
  }

  deleteConversationViaSocket(conversationId: number) {
    console.log('🗑️ Suppression conversation via socket:', conversationId);
    this.socket?.emit('delete_conversation', { conversation_id: conversationId });
  }

  deleteMessageViaSocket(messageId: number, conversationId: number) {
    console.log('🗑️ Suppression message via socket:', messageId);
    this.socket?.emit('delete_message', { message_id: messageId, conversation_id: conversationId });
  }

  startTyping(conversationId: number) {
    this.socket?.emit('typing_start', { conversation_id: conversationId });
  }

  stopTyping(conversationId: number) {
    this.socket?.emit('typing_stop', { conversation_id: conversationId });
  }

  markAsRead(conversationId: number) {
    console.log('👁️ Marquer comme lu - conversation:', conversationId);
    this.socket?.emit('mark_as_read', { conversation_id: conversationId });
  }

  // ========================================
  // HELPERS
  // ========================================

  setMessages(messages: ChatMessage[]) {
    console.log('📝 setMessages appelé avec', messages.length, 'messages');
    this.messagesSubject.next(messages);
  }

  clearMessages() {
    this.messagesSubject.next([]);
  }

  private loadUnreadCount() {
    this.getUnreadCount().subscribe({
      next: (response) => {
        this.unreadCountSubject.next(response.unread_count);
      },
      error: (err) => {
        console.error('❌ Erreur chargement compteur non lus:', err);
      }
    });
  }

  updateUnreadCount() {
    this.loadUnreadCount();
  }

  setActiveConversation(conversation: ChatConversation | null) {
    console.log('📌 setActiveConversation:', conversation?.id);
    this.activeConversationSubject.next(conversation);
  }

  getActiveConversation(): ChatConversation | null {
    return this.activeConversationSubject.value;
  }
}