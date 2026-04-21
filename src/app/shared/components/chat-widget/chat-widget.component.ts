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

    if (this.currentUser?.role === 'superadmin') return;

    if (!this.currentUser) {
      this.currentUser = {
        id: 0, email: 'guest@temp.com', role: 'guest',
        first_name: 'Invité', last_name: '', phone: '',
        is_active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    setTimeout(() => { this.cdr.detectChanges(); }, 100);

    window.addEventListener('openChatWidget', (event: any) => {
      const conversation = event.detail?.conversation;
      const isGuest      = event.detail?.isGuest;

      if (conversation) {
        if (isGuest) {
          this.currentUser = {
            id: 0, email: 'guest@temp.com', role: 'guest',
            first_name: event.detail.guestName  || 'Invité',
            last_name: '', phone: event.detail.guestPhone || '',
            is_active: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
        }

        this.isOpen = true;
        this.selectedConversation = conversation;
        this.showConversationList = false;
        this.checkIfHomePage();
        // ✅ Bloquer le scroll lors de l'ouverture via événement externe
        this.lockBodyScroll();
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
        // ✅ Bloquer le scroll
        this.lockBodyScroll();
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
          }).catch(() => {});
        }
      }
    });
    this.subscriptions.push(userSub);

    const activeConvSub = this.chatService.activeConversation$.subscribe((conversation: any) => {
      if (conversation) {
        this.selectedConversation = conversation;
        this.showConversationList = false;
        this.isOpen = true;
        // ✅ Bloquer le scroll quand une conv s'ouvre depuis l'extérieur
        this.lockBodyScroll();
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
        }).catch(() => {});
      }
    }
  }

  ngOnDestroy(): void {
    // ✅ Toujours débloquer le scroll à la destruction du composant
    this.unlockBodyScroll();
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.selectedConversation) {
      this.chatService.leaveConversation(this.selectedConversation.id);
    }
    this.chatService.disconnectSocket();
  }

  // ── Gestion du scroll du body ──────────────────────────────────
  // Safari iOS nécessite position:fixed + width:100% en plus de overflow:hidden.
  // On stocke scrollY pour restaurer la position exacte à la fermeture.
  private scrollY = 0;

  private lockBodyScroll(): void {
    if (window.innerWidth > 768) return; // desktop : pas de blocage
    this.scrollY = window.scrollY;
    document.body.style.overflow  = 'hidden';
    document.body.style.position  = 'fixed';
    document.body.style.top       = `-${this.scrollY}px`;
    document.body.style.width     = '100%';
  }

  private unlockBodyScroll(): void {
    if (window.innerWidth > 768) return;
    document.body.style.overflow  = '';
    document.body.style.position  = '';
    document.body.style.top       = '';
    document.body.style.width     = '';
    // Restaurer la position de scroll exacte
    window.scrollTo(0, this.scrollY);
  }

  // ── Vérifier si on est sur une page sans bouton flottant ───────

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

  // ── Toggle ouverture/fermeture ─────────────────────────────────

  toggleChat(): void {
    this.isOpen = !this.isOpen;
    this.checkIfHomePage();

    if (this.isOpen) {
      // ✅ Bloquer le scroll du body sur mobile à l'ouverture
      this.lockBodyScroll();
      if (this.currentUser && this.currentUser.role !== 'guest') {
        this.loadConversations();
      }
    } else {
      // ✅ Débloquer le scroll à la fermeture
      this.unlockBodyScroll();
    }
  }

  // ── Chargement conversations ───────────────────────────────────

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
          this.conversations.forEach(conv => this.chatService.joinConversation(conv.id));
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
            this.conversations.forEach(conv => this.chatService.joinConversation(conv.id));
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

  // ── Sélection conversation ────────────────────────────────────

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
    const role       = this.currentUser.role;
    const senderType = message.sender_type;
    if (role === 'guest')                        return senderType === 'guest';
    if (role === 'client')                       return senderType === 'client' && message.sender_id === this.currentUser.id;
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
  cancelDeleteMessage():           void { this.messageToDelete = null;    this.showDeleteMessageModal = false; this.cdr.detectChanges(); }

  executeDeleteMessage(): void {
    if (!this.messageToDelete || !this.selectedConversation) return;
    this.showDeleteMessageModal = false;
    const messageId      = this.messageToDelete.id;
    const conversationId = this.selectedConversation.id;
    this.messageToDelete = null;
    this.chatService.deleteMessageViaSocket(messageId, conversationId);
    this.messages = this.messages.filter(m => m.id !== messageId);
    this.chatService.setMessages(this.messages);
    this.cdr.detectChanges();
  }

  getConversationName(conversation: any): string {
    if (!this.currentUser) return 'Conversation';
    return (this.currentUser.role === 'client' || this.currentUser.role === 'guest')
      ? conversation.business_name || 'Établissement'
      : conversation.client_name  || 'Client';
  }

  getConversationStatus(conversation: any): string {
    if (!this.currentUser) return '';
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      if (conversation.business_type === 'restaurant') return this.isRestaurantOpen(conversation) ? 'En ligne' : 'Hors ligne';
      if (conversation.business_type === 'traiteur')   return conversation.is_available ? 'Disponible' : 'Indisponible';
    }
    return '';
  }

  getConversationStatusClass(conversation: any): string {
    if (!this.currentUser) return '';
    if (this.currentUser.role === 'client' || this.currentUser.role === 'guest') {
      if (conversation.business_type === 'restaurant') return this.isRestaurantOpen(conversation) ? 'status-online' : 'status-offline';
      if (conversation.business_type === 'traiteur')   return conversation.is_available ? 'status-online' : 'status-offline';
    }
    return '';
  }

  private isRestaurantOpen(conversation: any): boolean {
    if (!conversation.opening_hour || !conversation.closing_hour) return false;
    const now            = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openingMinutes = this.timeToMinutes(conversation.opening_hour);
    const closingMinutes = this.timeToMinutes(conversation.closing_hour);
    if (closingMinutes < openingMinutes) return currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
    return currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

  getConversationAvatar(conversation: any): string {
    if (!this.currentUser) return '💬';
    return (this.currentUser.role === 'client' || this.currentUser.role === 'guest')
      ? (conversation.business_type === 'restaurant' ? '🍽️' : '🍰')
      : '👤';
  }

  formatTime(date: string): string {
    const d = new Date(date);
    return `${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  formatDate(date: string): string {
    const d         = new Date(date);
    const today     = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString())     return 'Aujourd\'hui';
    if (d.toDateString() === yesterday.toDateString()) return 'Hier';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  }

  private scrollToBottom(): void {
    const el = document.querySelector('.cw-messages');
    if (el) el.scrollTop = el.scrollHeight;
  }
}