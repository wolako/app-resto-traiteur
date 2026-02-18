// src/app/shared/components/chat-widget/chat-widget.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router'; // ✅ AJOUT
import { filter } from 'rxjs/operators'; // ✅ AJOUT
import { trigger, transition, style, animate } from '@angular/animations';
import { ChatService } from '../../../core/services/chat/chat.service';
import { AuthService } from '../../../core/services/auth/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-chat-widget',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-widget.component.html',
  styleUrls: ['./chat-widget.component.scss'],
  animations: [
    trigger('slideInUp', [
      transition(':enter', [
        style({ transform: 'translateY(100%)', opacity: 0 }),
        animate('300ms ease-out', style({ transform: 'translateY(0)', opacity: 1 }))
      ]),
      transition(':leave', [
        animate('200ms ease-in', style({ transform: 'translateY(100%)', opacity: 0 }))
      ])
    ])
  ]
})
export class ChatWidgetComponent implements OnInit, OnDestroy {
  isOpen = false;
  showConversationList = true;
  currentUser: any;
  isHomePage: boolean = false; // ✅ NOUVELLE PROPRIÉTÉ
  
  conversations: any[] = [];
  selectedConversation: any = null;
  messages: any[] = [];
  
  messageText = '';
  isTyping = false;
  
  loading = {
    conversations: false,
    messages: false,
    sending: false
  };
  
  showDeleteConversationModal = false;
  showDeleteMessageModal = false;
  messageToDelete: any = null;

  unreadCount = 0;
  
  private subscriptions: Subscription[] = [];
  private typingTimeout: any;
  private isLoadingConversations = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router // ✅ INJECTION DU ROUTER
  ) {}

  ngOnInit(): void {
    // ✅ DÉTECTION DE LA ROUTE INITIALE
    this.checkIfHomePage();

    // ✅ ÉCOUTER LES CHANGEMENTS DE ROUTE
    const routerSub = this.router.events.pipe(
      filter(event => event instanceof NavigationEnd)
    ).subscribe(() => {
      this.checkIfHomePage();
      this.cdr.detectChanges();
    });
    this.subscriptions.push(routerSub);

    this.currentUser = this.authService.getCurrentUser();
    
    if (this.currentUser?.role === 'superadmin') {
      return;
    }
    
    if (!this.currentUser) {
      this.currentUser = {
        id: 0,
        email: 'guest@temp.com',
        role: 'guest',
        first_name: 'Invité',
        last_name: '',
        phone: '',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }
    
    setTimeout(() => {
      this.cdr.detectChanges();
    }, 100);
    
    // Écouter l'événement pour ouvrir le widget
    window.addEventListener('openChatWidget', (event: any) => {
      console.log('📢 Événement openChatWidget reçu:', event.detail);
      const conversation = event.detail?.conversation;
      const isGuest = event.detail?.isGuest;
      
      if (conversation) {
        if (isGuest) {
          this.currentUser = {
            id: 0,
            email: 'guest@temp.com',
            role: 'guest',
            first_name: event.detail.guestName || 'Invité',
            last_name: '',
            phone: event.detail.guestPhone || '',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }
        
        // ✅ FORCER l'ouverture du chat (même sur la page home)
        this.isOpen = true;
        this.selectedConversation = conversation;
        this.showConversationList = false;
        
        // ✅ Forcer la re-vérification pour afficher le widget
        this.checkIfHomePage();
        
        this.cdr.detectChanges();
        setTimeout(() => this.scrollToBottom(), 200);
      }
    });

    // ✅ Écouter l'événement d'ouverture depuis la navbar
    window.addEventListener('toggleChatWidget', ((event: CustomEvent) => {
      console.log('📨 Événement toggleChatWidget reçu', event.detail);
      if (event.detail?.open) {
        // ✅ FORCER l'ouverture du chat
        this.isOpen = true;
        this.showConversationList = true;
        this.selectedConversation = null;
        
        // ✅ Forcer la re-vérification pour afficher le widget
        this.checkIfHomePage();
        
        this.loadConversations();
      }
    }) as EventListener);
    
    // S'abonner aux changements d'utilisateur
    const userSub = this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.cdr.detectChanges();
        
        const token = this.authService.getToken();
        if (token) {
          console.log('👤 Utilisateur changé, connexion socket...');
          this.chatService.connectSocket(token);
          
          this.chatService.waitForSocketReady().then(() => {
            console.log('✅ Socket prêt après changement utilisateur');
            this.loadConversations();
            this.chatService.updateUnreadCount();
          }).catch(err => {
            console.error('❌ Erreur waitForSocketReady:', err);
          });
        }
      }
    });
    this.subscriptions.push(userSub);
    
    // S'abonner à la conversation active
    const activeConvSub = this.chatService.activeConversation$.subscribe((conversation: any) => {
      if (conversation) {
        this.selectedConversation = conversation;
        this.showConversationList = false;
        this.isOpen = true;
        this.cdr.detectChanges();
        setTimeout(() => this.scrollToBottom(), 200);
      }
    });
    this.subscriptions.push(activeConvSub);
    
    // S'abonner aux messages non lus
    const unreadSub = this.chatService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
      this.cdr.detectChanges();
    });
    this.subscriptions.push(unreadSub);
    
    // S'abonner aux nouveaux messages
    const messagesSub = this.chatService.messages$.subscribe(messages => {
      this.messages = messages;
      this.cdr.detectChanges();
      setTimeout(() => this.scrollToBottom(), 100);
    });
    this.subscriptions.push(messagesSub);
    
    // S'abonner à l'indicateur de frappe
    const typingSub = this.chatService.typing$.subscribe(typing => {
      this.isTyping = typing.isTyping;
      this.cdr.detectChanges();
    });
    this.subscriptions.push(typingSub);

    // S'abonner à la suppression de conversation
    const convDeletedSub = this.chatService.conversationDeleted$.subscribe(conversationId => {
      if (conversationId !== null) {
        this.conversations = this.conversations.filter(c => c.id !== conversationId);
        
        if (this.selectedConversation?.id === conversationId) {
          this.selectedConversation = null;
          this.showConversationList = true;
          this.messages = [];
        }
        this.cdr.detectChanges();
      }
    });
    this.subscriptions.push(convDeletedSub);
    
    // ✅ AJOUT: S'abonner aux événements de lecture
    const messagesReadSub = this.chatService.messagesRead$.subscribe(() => {
      // Mettre à jour les messages pour les marquer comme lus
      this.messages = this.messages.map(msg => ({
        ...msg,
        is_read: true
      }));
      this.cdr.detectChanges();
    });
    this.subscriptions.push(messagesReadSub);
    
    // Se connecter au socket si authentifié
    if (this.currentUser && this.currentUser.role !== 'guest') {
      const token = this.authService.getToken();
      if (token) {
        console.log('👤 Utilisateur déjà connecté au démarrage, connexion socket...');
        this.chatService.connectSocket(token);
        
        this.chatService.waitForSocketReady().then(() => {
          console.log('✅ Socket prêt au démarrage');
          this.loadConversations();
          this.chatService.updateUnreadCount();
        }).catch(err => {
          console.error('❌ Erreur waitForSocketReady au démarrage:', err);
        });
      }
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.selectedConversation) {
      this.chatService.leaveConversation(this.selectedConversation.id);
    }
    this.chatService.disconnectSocket();
  }

  // ✅ NOUVELLE MÉTHODE: Vérifier si on est sur la page home
  private checkIfHomePage(): void {
    const currentUrl = this.router.url;
    
    // Masquer le bouton flottant sur la page home SEULEMENT si le chat n'est PAS ouvert
    const hideChatPages = ['/'];
    
    const isOnHiddenPage = hideChatPages.some(page => 
      currentUrl === page || currentUrl.startsWith(page + '?') || currentUrl.startsWith(page + '#')
    );
    
    // Si on est sur une page cachée ET que le chat n'est pas ouvert, masquer le bouton
    // Si le chat est ouvert, toujours afficher le widget (même sur home)
    this.isHomePage = isOnHiddenPage && !this.isOpen;
    
    console.log('🏠 checkIfHomePage:', { 
      currentUrl, 
      isOnHiddenPage, 
      isOpen: this.isOpen, 
      isHomePage: this.isHomePage 
    });
  }

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    
    // ✅ Re-vérifier la page après le toggle pour mettre à jour l'affichage
    this.checkIfHomePage();
    
    if (this.isOpen && this.currentUser && this.currentUser.role !== 'guest') {
      this.loadConversations();
    }
  }

  loadConversations(): void {
    if (this.isLoadingConversations) {
      console.log('⚠️ loadConversations déjà en cours, skip');
      return;
    }

    console.log('📂 loadConversations appelé');
    this.loading.conversations = true;
    this.isLoadingConversations = true;
    
    const role = this.currentUser.role;
    console.log('📂 Role:', role);
    
    if (role === 'client') {
      this.chatService.getClientConversations().subscribe({
        next: (response) => {
          this.conversations = response.conversations || [];
          this.loading.conversations = false;
          this.isLoadingConversations = false;
          
          console.log('🔔 [CLIENT] Rejoindre', this.conversations.length, 'conversations');
          this.conversations.forEach(conv => {
            console.log('👥 [CLIENT] Auto-join conversation:', conv.id);
            this.chatService.joinConversation(conv.id);
          });
          
          this.cdr.detectChanges();
        },
        error: (err) => {
          console.error('❌ Erreur chargement conversations client:', err);
          this.loading.conversations = false;
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        }
      });
    } else if (role === 'restaurant' || role === 'traiteur') {
      const businessId = this.authService.getBusiness()?.id;
      console.log('📂 Business ID:', businessId);
      
      if (businessId) {
        this.chatService.getBusinessConversations(businessId).subscribe({
          next: (response) => {
            console.log('📂 [RESPONSE] Conversations reçues:', response);
            this.conversations = response.conversations || [];
            this.loading.conversations = false;
            this.isLoadingConversations = false;
            
            console.log('🔔 [BUSINESS] Rejoindre', this.conversations.length, 'conversations');
            this.conversations.forEach(conv => {
              console.log('👥 [BUSINESS] Auto-join conversation:', conv.id);
              this.chatService.joinConversation(conv.id);
            });
            
            this.cdr.detectChanges();
          },
          error: (err) => {
            console.error('❌ Erreur chargement conversations business:', err);
            this.loading.conversations = false;
            this.isLoadingConversations = false;
            this.cdr.detectChanges();
          }
        });
      } else {
        console.error('❌ Pas de business ID trouvé');
        this.loading.conversations = false;
        this.isLoadingConversations = false;
      }
    }
  }

  selectConversation(conversation: any): void {
    if (this.selectedConversation) {
      this.chatService.leaveConversation(this.selectedConversation.id);
    }
    
    this.selectedConversation = conversation;
    this.showConversationList = false;
    this.loading.messages = true;
    
    this.chatService.getMessages(conversation.id).subscribe({
      next: (response) => {
        this.messages = response.messages || [];
        this.chatService.setMessages(this.messages);
        this.loading.messages = false;
        
        this.chatService.joinConversation(conversation.id);
        
        // ✅ CORRECTION: Marquer comme lu APRÈS avoir joint la conversation
        setTimeout(() => {
          this.chatService.markAsRead(conversation.id);
          
          // ✅ Réinitialiser le compteur local de cette conversation
          conversation.unread_count = 0;
          
          // ✅ Mettre à jour le compteur global
          this.chatService.updateUnreadCount();
        }, 500);

        setTimeout(() => this.scrollToBottom(), 100);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('❌ Erreur chargement messages:', err);
        this.loading.messages = false;
        this.cdr.detectChanges();
      }
    });
  }

  backToList(): void {
    if (this.selectedConversation) {
      this.chatService.leaveConversation(this.selectedConversation.id);
    }
    this.selectedConversation = null;
    this.showConversationList = true;
    this.chatService.clearMessages();
    this.cdr.detectChanges();
  }

  sendMessage(): void {
    if (!this.messageText.trim() || !this.selectedConversation) {
      return;
    }
    
    const message = this.messageText.trim();
    this.messageText = '';
    
    this.chatService.stopTyping(this.selectedConversation.id);
    this.chatService.sendMessage(this.selectedConversation.id, message);
  }

  onTyping(): void {
    if (!this.selectedConversation) return;
    
    this.chatService.startTyping(this.selectedConversation.id);
    
    clearTimeout(this.typingTimeout);
    this.typingTimeout = setTimeout(() => {
      this.chatService.stopTyping(this.selectedConversation.id);
    }, 2000);
  }

  // ✅ CORRECTION MAJEURE: Fonction pour déterminer si le message est le mien
  isMyMessage(message: any): boolean {
    if (!this.currentUser || !message) return false;

    const role = this.currentUser.role;
    const senderType = message.sender_type;

    console.log('🔍 isMyMessage check:', {
      myRole: role,
      senderType: senderType,
      myId: this.currentUser.id,
      senderId: message.sender_id
    });

    // ✅ LOGIQUE CORRIGÉE
    if (role === 'guest') {
      // Pour un invité: vérifier si le sender_type est 'guest'
      return senderType === 'guest';
    } else if (role === 'client') {
      // Pour un client: vérifier si le sender_type est 'client' ET que l'ID correspond
      return senderType === 'client' && message.sender_id === this.currentUser.id;
    } else if (role === 'restaurant' || role === 'traiteur') {
      // Pour un business: vérifier si le sender_type est 'business'
      return senderType === 'business';
    }

    return false;
  }

  confirmDeleteConversation(): void {
    this.showDeleteConversationModal = true;
    this.cdr.detectChanges();
  }

  cancelDeleteConversation(): void {
    this.showDeleteConversationModal = false;
    this.cdr.detectChanges();
  }

  executeDeleteConversation(): void {
    if (!this.selectedConversation) return;

    this.showDeleteConversationModal = false;

    const conversationId = this.selectedConversation.id;
    this.chatService.deleteConversationViaSocket(conversationId);

    this.conversations = this.conversations.filter(c => c.id !== conversationId);
    this.selectedConversation = null;
    this.showConversationList = true;
    this.messages = [];
    this.chatService.clearMessages();

    console.log('✅ Conversation supprimée localement:', conversationId);
    this.cdr.detectChanges();
  }

  confirmDeleteMessage(message: any): void {
    this.messageToDelete = message;
    this.showDeleteMessageModal = true;
    this.cdr.detectChanges();
  }

  cancelDeleteMessage(): void {
    this.messageToDelete = null;
    this.showDeleteMessageModal = false;
    this.cdr.detectChanges();
  }

  executeDeleteMessage(): void {
    if (!this.messageToDelete || !this.selectedConversation) return;

    this.showDeleteMessageModal = false;
    const messageId = this.messageToDelete.id;
    const conversationId = this.selectedConversation.id;
    this.messageToDelete = null;

    this.chatService.deleteMessageViaSocket(messageId, conversationId);

    this.messages = this.messages.filter(m => m.id !== messageId);
    this.chatService.setMessages(this.messages);

    console.log('✅ Message supprimé localement:', messageId);
    this.cdr.detectChanges();
  }

  getConversationName(conversation: any): string {
    if (!this.currentUser) return 'Conversation';
    
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      return conversation.business_name || 'Établissement';
    } else {
      return conversation.client_name || 'Client';
    }
  }

  getConversationStatus(conversation: any): string {
    if (!this.currentUser) return '';
    
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      const businessType = conversation.business_type;
      
      if (businessType === 'restaurant') {
        return this.isRestaurantOpen(conversation) ? 'En ligne' : 'Hors ligne';
      } else if (businessType === 'traiteur') {
        return conversation.is_available ? 'Disponible' : 'Indisponible';
      }
    }
    
    return '';
  }

  getConversationStatusClass(conversation: any): string {
    if (!this.currentUser) return '';
    
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      const businessType = conversation.business_type;
      
      if (businessType === 'restaurant') {
        return this.isRestaurantOpen(conversation) ? 'status-online' : 'status-offline';
      } else if (businessType === 'traiteur') {
        return conversation.is_available ? 'status-online' : 'status-offline';
      }
    }
    
    return '';
  }

  private isRestaurantOpen(conversation: any): boolean {
    if (!conversation.opening_hour || !conversation.closing_hour) {
      return false;
    }
    
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    
    const openingMinutes = this.timeToMinutes(conversation.opening_hour);
    const closingMinutes = this.timeToMinutes(conversation.closing_hour);
    
    if (closingMinutes < openingMinutes) {
      return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
    } else {
      return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
    }
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  getConversationAvatar(conversation: any): string {
    if (!this.currentUser) return '💬';
    
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      return conversation.business_type === 'restaurant' ? '🍽️' : '🍰';
    } else {
      return '👤';
    }
  }

  formatTime(date: string): string {
    const d = new Date(date);
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  formatDate(date: string): string {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (d.toDateString() === today.toDateString()) {
      return 'Aujourd\'hui';
    } else if (d.toDateString() === yesterday.toDateString()) {
      return 'Hier';
    } else {
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    }
  }

  private scrollToBottom(): void {
    const messagesContainer = document.querySelector('.chat-messages');
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }
}