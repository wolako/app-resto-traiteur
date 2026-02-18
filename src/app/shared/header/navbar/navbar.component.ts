// src/app/shared/components/navbar/navbar.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from '../../../core/services/auth/auth.service';
import { User } from '../../../core/models/user.model';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ClientService } from '../../../core/services/client/client.service';
import { ChatService } from '../../../core/services/chat/chat.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  clientNotificationCount = 0;
  chatUnreadCount = 0;
  private subscriptions: Subscription[] = [];
  private countRefreshInterval: any;

  constructor(
    private authService: AuthService,
    private clientService: ClientService,
    private chatService: ChatService,
    private router: Router
  ) {
    // S'abonner aux changements d'utilisateur
    const userSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      
      // Gérer le polling selon le rôle
      if (user?.role === 'client') {
        this.clientService.startPolling();
      } else {
        this.clientService.stopPolling();
        this.clientNotificationCount = 0;
      }
      
      // ✅ Charger le compteur de chat si utilisateur connecté
      if (user && (user.role === 'client' || user.role === 'restaurant' || user.role === 'traiteur')) {
        console.log('👤 Utilisateur connecté, chargement compteur chat');
        this.loadChatUnreadCount();
        this.startCountRefresh();
      } else {
        this.chatUnreadCount = 0;
        this.stopCountRefresh();
      }
    });
    this.subscriptions.push(userSub);
  }

  ngOnInit(): void {
    // S'abonner au compteur de notifications
    const countSub = this.clientService.unreadCount$.subscribe(count => {
      this.clientNotificationCount = count;
    });
    this.subscriptions.push(countSub);
    
    // S'abonner au compteur de messages non lus du chat
    const chatCountSub = this.chatService.unreadCount$.subscribe(count => {
      console.log('🔔 Compteur chat mis à jour:', count);
      this.chatUnreadCount = count;
    });
    this.subscriptions.push(chatCountSub);
    
    // ✅ S'abonner aux suppressions de conversations
    const conversationDeletedSub = this.chatService.conversationDeleted$.subscribe(conversationId => {
      if (conversationId !== null) {
        console.log('🗑️ Conversation supprimée, rafraîchissement du compteur');
        // Attendre un peu que le backend mette à jour, puis recharger
        setTimeout(() => {
          this.loadChatUnreadCount();
        }, 500);
      }
    });
    this.subscriptions.push(conversationDeletedSub);
    
    // ✅ Charger le compteur initial si utilisateur déjà connecté
    if (this.currentUser && 
        (this.currentUser.role === 'client' || 
         this.currentUser.role === 'restaurant' || 
         this.currentUser.role === 'traiteur')) {
      this.loadChatUnreadCount();
      this.startCountRefresh();
    }
  }

  ngOnDestroy(): void {
    // Nettoyer les subscriptions
    this.subscriptions.forEach(sub => sub.unsubscribe());
    this.clientService.stopPolling();
    this.stopCountRefresh();
  }

  // ✅ Charger le compteur de messages non lus
  private loadChatUnreadCount(): void {
    console.log('🔔 Chargement compteur messages non lus');
    this.chatService.updateUnreadCount();
  }

  // ✅ Rafraîchir périodiquement le compteur (toutes les 30 secondes)
  private startCountRefresh(): void {
    // Nettoyer l'ancien interval s'il existe
    this.stopCountRefresh();
    
    // Rafraîchir toutes les 30 secondes
    this.countRefreshInterval = setInterval(() => {
      this.loadChatUnreadCount();
    }, 30000); // 30 secondes
  }

  private stopCountRefresh(): void {
    if (this.countRefreshInterval) {
      clearInterval(this.countRefreshInterval);
      this.countRefreshInterval = null;
    }
  }

  // ✅ NOUVEAU: Ouvrir le widget de chat quand on clique sur le badge
  openChatWidget(): void {
    console.log('💬 Ouverture du widget de chat depuis la navbar');
    
    // Émettre un événement personnalisé pour ouvrir le widget
    const event = new CustomEvent('toggleChatWidget', {
      detail: { open: true }
    });
    window.dispatchEvent(event);
  }

  logout(): void {
    this.clientService.stopPolling();
    this.stopCountRefresh();
    this.chatService.disconnectSocket();
    this.authService.logout();
    this.router.navigate(['/']);
  }

  getRoleLabel(role: string): string {
    const labels: { [key: string]: string } = {
      'client': 'Client',
      'restaurant': 'Restaurant',
      'traiteur': 'Traiteur',
      'superadmin': 'Admin'
    };
    return role ? (labels[role] || role) : '';
  }
}