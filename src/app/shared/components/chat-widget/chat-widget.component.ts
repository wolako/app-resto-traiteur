// src/app/shared/components/chat-widget/chat-widget.component.ts
import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
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
  isHomePage: boolean = false;

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

  // ── Swipe-to-dismiss ────────────────────────────────────────
  isSwiping        = false;
  swipeTransform   = 'translateY(0)';
  swipeOpacity     = '1';
  private _swipeStartY    = 0;
  private _swipeStartTime = 0;
  private _currentDeltaY  = 0;
  /** Seuil en px pour déclencher la fermeture */
  private readonly SWIPE_CLOSE_THRESHOLD  = 80;
  /** Vélocité min en px/ms pour fermeture rapide */
  private readonly SWIPE_VELOCITY_THRESHOLD = 0.4;

  private subscriptions: Subscription[] = [];
  private typingTimeout: any;
  private isLoadingConversations = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.checkIfHomePage();

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

    setTimeout(() => { this.cdr.detectChanges(); }, 100);

    window.addEventListener('openChatWidget', (event: any) => {
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
        this.isOpen = true;
        this.selectedConversation = conversation;
        this.showConversationList = false;
        this.checkIfHomePage();
        this.cdr.detectChanges();
        setTimeout(() => this.scrollToBottom(), 200);
      }
    });

    window.addEventListener('toggleChatWidget', ((event: CustomEvent) => {
      if (event.detail?.open) {
        this.isOpen = true;
        this.showConversationList = true;
        this.selectedConversation = null;
        this.checkIfHomePage();
        this.loadConversations();
      }
    }) as EventListener);

    const userSub = this.authService.currentUser$.subscribe(user => {
      if (user) {
        this.currentUser = user;
        this.cdr.detectChanges();
        const token = this.authService.getToken();
        if (token) {
          this.chatService.connectSocket(token);
          this.chatService.waitForSocketReady().then(() => {
            this.loadConversations();
            this.chatService.updateUnreadCount();
          }).catch(err => { console.error('❌ Erreur waitForSocketReady:', err); });
        }
      }
    });
    this.subscriptions.push(userSub);

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

    const unreadSub = this.chatService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
      this.cdr.detectChanges();
    });
    this.subscriptions.push(unreadSub);

    const messagesSub = this.chatService.messages$.subscribe(messages => {
      this.messages = messages;
      this.cdr.detectChanges();
      setTimeout(() => this.scrollToBottom(), 100);
    });
    this.subscriptions.push(messagesSub);

    const typingSub = this.chatService.typing$.subscribe(typing => {
      this.isTyping = typing.isTyping;
      this.cdr.detectChanges();
    });
    this.subscriptions.push(typingSub);

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

    const messagesReadSub = this.chatService.messagesRead$.subscribe(() => {
      this.messages = this.messages.map(msg => ({ ...msg, is_read: true }));
      this.cdr.detectChanges();
    });
    this.subscriptions.push(messagesReadSub);

    if (this.currentUser && this.currentUser.role !== 'guest') {
      const token = this.authService.getToken();
      if (token) {
        this.chatService.connectSocket(token);
        this.chatService.waitForSocketReady().then(() => {
          this.loadConversations();
          this.chatService.updateUnreadCount();
        }).catch(err => { console.error('❌ Erreur waitForSocketReady au démarrage:', err); });
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

  // ════════════════════════════════════════════════════════════
  // SWIPE-TO-DISMISS
  //
  // Logique bottom sheet iOS native :
  //   1. touchstart → mémoriser Y + timestamp
  //   2. touchmove  → appliquer translateY(delta) en temps réel si delta > 0
  //                   + réduire opacity légèrement
  //   3. touchend   → si delta > seuil OU vélocité rapide → fermer
  //                   sinon → snap back animé
  // ════════════════════════════════════════════════════════════
  onSwipeStart(e: TouchEvent): void {
    // Sur desktop (pas de touch) ou si l'event vient du body/messages → ignorer
    if (e.touches.length !== 1) return;

    this.isSwiping       = true;
    this._swipeStartY    = e.touches[0].clientY;
    this._swipeStartTime = Date.now();
    this._currentDeltaY  = 0;

    // Désactiver la transition CSS pendant le swipe actif
    // pour un mouvement parfaitement fluide
    this.swipeTransform = 'translateY(0)';
    this.cdr.detectChanges();
  }

  onSwipeMove(e: TouchEvent): void {
    if (!this.isSwiping || e.touches.length !== 1) return;

    const deltaY = e.touches[0].clientY - this._swipeStartY;

    // Ne gérer que le swipe vers le bas (pas vers le haut)
    if (deltaY <= 0) {
      this.swipeTransform = 'translateY(0)';
      this.swipeOpacity   = '1';
      return;
    }

    // Résistance progressive : plus on tire, moins ça suit
    // Formule élastique : delta * (1 - delta / (2 * maxPull))
    // Simple rubber band : full speed jusqu'à 150px, puis résistance
    const resistance = deltaY > 150
      ? 150 + (deltaY - 150) * 0.35
      : deltaY;

    this._currentDeltaY = deltaY;
    this.swipeTransform = `translateY(${resistance}px)`;

    // Fade out progressif : commence à 60px, transparent à 200px
    const opacity = Math.max(0, 1 - (deltaY - 60) / 140);
    this.swipeOpacity = String(Math.min(1, opacity));

    // Empêcher le scroll de la page pendant le swipe
    e.preventDefault();
    this.cdr.detectChanges();
  }

  onSwipeEnd(e: TouchEvent): void {
    if (!this.isSwiping) return;

    const deltaTime  = Date.now() - this._swipeStartTime;
    const velocity   = deltaTime > 0 ? this._currentDeltaY / deltaTime : 0;
    const shouldClose = this._currentDeltaY > this.SWIPE_CLOSE_THRESHOLD
                     || velocity > this.SWIPE_VELOCITY_THRESHOLD;

    if (shouldClose) {
      // Fermeture : animer vers le bas puis fermer
      this.swipeTransform = 'translateY(100%)';
      this.swipeOpacity   = '0';
      this.isSwiping      = false;
      this.cdr.detectChanges();

      // Laisser l'animation CSS se jouer (200ms), puis fermer
      setTimeout(() => {
        this.swipeTransform = 'translateY(0)';
        this.swipeOpacity   = '1';
        this.toggleChat();
      }, 200);
    } else {
      // Snap back : retour à la position initiale avec transition
      this.isSwiping      = false;
      this.swipeTransform = 'translateY(0)';
      this.swipeOpacity   = '1';
      this.cdr.detectChanges();
    }

    this._currentDeltaY = 0;
  }

  // ════════════════════════════════════════════════════════════

  private checkIfHomePage(): void {
    const currentUrl = this.router.url;
    const hideChatPages = [
      '/', '/login', '/register', '/admin/login',
      '/business/login', '/contact', '/about', '/faq', '/legal'
    ];
    const isOnHiddenPage = hideChatPages.some(page =>
      currentUrl === page ||
      currentUrl.startsWith(page + '/') ||
      currentUrl.startsWith(page + '?') ||
      currentUrl.startsWith(page + '#')
    );
    this.isHomePage = isOnHiddenPage && !this.isOpen;
  }

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    this.checkIfHomePage();
    if (this.isOpen && this.currentUser && this.currentUser.role !== 'guest') {
      this.loadConversations();
    }
  }

  loadConversations(): void {
    if (this.isLoadingConversations) return;

    this.loading.conversations = true;
    this.isLoadingConversations = true;
    const role = this.currentUser.role;

    if (role === 'client') {
      this.chatService.getClientConversations().subscribe({
        next: (response) => {
          this.conversations = response.conversations || [];
          this.loading.conversations = false;
          this.isLoadingConversations = false;
          this.conversations.forEach(conv => { this.chatService.joinConversation(conv.id); });
          this.cdr.detectChanges();
        },
        error: () => {
          this.loading.conversations = false;
          this.isLoadingConversations = false;
          this.cdr.detectChanges();
        }
      });
    } else if (role === 'restaurant' || role === 'traiteur') {
      const businessId = this.authService.getBusiness()?.id;
      if (businessId) {
        this.chatService.getBusinessConversations(businessId).subscribe({
          next: (response) => {
            this.conversations = response.conversations || [];
            this.loading.conversations = false;
            this.isLoadingConversations = false;
            this.conversations.forEach(conv => { this.chatService.joinConversation(conv.id); });
            this.cdr.detectChanges();
          },
          error: () => {
            this.loading.conversations = false;
            this.isLoadingConversations = false;
            this.cdr.detectChanges();
          }
        });
      } else {
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
        setTimeout(() => {
          this.chatService.markAsRead(conversation.id);
          conversation.unread_count = 0;
          this.chatService.updateUnreadCount();
        }, 500);
        setTimeout(() => this.scrollToBottom(), 100);
        this.cdr.detectChanges();
      },
      error: () => {
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
    if (!this.messageText.trim() || !this.selectedConversation) return;
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

  isMyMessage(message: any): boolean {
    if (!this.currentUser || !message) return false;
    const role = this.currentUser.role;
    const senderType = message.sender_type;
    if (role === 'guest')                          return senderType === 'guest';
    if (role === 'client')                         return senderType === 'client' && message.sender_id === this.currentUser.id;
    if (role === 'restaurant' || role === 'traiteur') return senderType === 'business';
    return false;
  }

  confirmDeleteConversation(): void { this.showDeleteConversationModal = true; this.cdr.detectChanges(); }
  cancelDeleteConversation():  void { this.showDeleteConversationModal = false; this.cdr.detectChanges(); }

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
    this.cdr.detectChanges();
  }

  confirmDeleteMessage(message: any): void { this.messageToDelete = message; this.showDeleteMessageModal = true; this.cdr.detectChanges(); }
  cancelDeleteMessage():               void { this.messageToDelete = null;    this.showDeleteMessageModal = false; this.cdr.detectChanges(); }

  executeDeleteMessage(): void {
    if (!this.messageToDelete || !this.selectedConversation) return;
    this.showDeleteMessageModal = false;
    const messageId = this.messageToDelete.id;
    const conversationId = this.selectedConversation.id;
    this.messageToDelete = null;
    this.chatService.deleteMessageViaSocket(messageId, conversationId);
    this.messages = this.messages.filter(m => m.id !== messageId);
    this.chatService.setMessages(this.messages);
    this.cdr.detectChanges();
  }

  getConversationName(conversation: any): string {
    if (!this.currentUser) return 'Conversation';
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      return conversation.business_name || 'Établissement';
    }
    return conversation.client_name || 'Client';
  }

  getConversationStatus(conversation: any): string {
    if (!this.currentUser) return '';
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      const businessType = conversation.business_type;
      if (businessType === 'restaurant') return this.isRestaurantOpen(conversation) ? 'En ligne' : 'Hors ligne';
      if (businessType === 'traiteur')   return conversation.is_available ? 'Disponible' : 'Indisponible';
    }
    return '';
  }

  getConversationStatusClass(conversation: any): string {
    if (!this.currentUser) return '';
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      const businessType = conversation.business_type;
      if (businessType === 'restaurant') return this.isRestaurantOpen(conversation) ? 'status-online' : 'status-offline';
      if (businessType === 'traiteur')   return conversation.is_available ? 'status-online' : 'status-offline';
    }
    return '';
  }

  private isRestaurantOpen(conversation: any): boolean {
    if (!conversation.opening_hour || !conversation.closing_hour) return false;
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openingMinutes = this.timeToMinutes(conversation.opening_hour);
    const closingMinutes = this.timeToMinutes(conversation.closing_hour);
    if (closingMinutes < openingMinutes) {
      return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
    }
    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
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
    }
    return '👤';
  }

  formatTime(date: string): string {
    const d = new Date(date);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  formatDate(date: string): string {
    const d = new Date(date);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Aujourd\'hui';
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  private scrollToBottom(): void {
    const messagesContainer = document.querySelector('.cw-messages');
    if (messagesContainer) messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }
}