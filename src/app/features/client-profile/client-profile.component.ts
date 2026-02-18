import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';
import { ClientNotification, ClientNotificationPreferences, ClientService, ClientStatistics } from '../../core/services/client/client.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { ToastService } from '../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../core/services/confirmation-modal/confirmation-modal.service';
import { SubmitTestimonialComponent } from '../../shared/components/submit-testimonial/submit-testimonial.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    RouterModule,
    CurrencyFormatPipe,
    SubmitTestimonialComponent
  ],
  templateUrl: './client-profile.component.html',
  styleUrls: ['./client-profile.component.scss']
})
export class ClientProfileComponent implements OnInit, OnDestroy {
  currentUser: any;
  statistics!: ClientStatistics;
  preferences!: ClientNotificationPreferences;
  preferencesForm!: FormGroup;
  
  recentOrders: any[] = [];
  upcomingReservations: any[] = [];
  notifications: ClientNotification[] = [];
  unreadCount = 0;
  
  loading = {
    profile: true,
    orders: true,
    reservations: true,
    notifications: true,
    preferences: false
  };
  
  activeTab: 'overview' | 'orders' | 'reservations' | 'notifications' | 'settings' | 'testimonial' = 'overview';

  constructor(
    private clientService: ClientService,
    private authService: AuthService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.initializePreferencesForm();
    
    // Détecter le paramètre 'tab' dans l'URL
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const requestedTab = params['tab'];
        if (['overview', 'orders', 'reservations', 'notifications', 'settings'].includes(requestedTab)) {
          this.activeTab = requestedTab as 'overview' | 'orders' | 'reservations' | 'notifications' | 'settings';
          console.log('📍 Onglet activé depuis URL:', this.activeTab);
        }
      }
    });
    
    this.loadProfile();
    this.loadRecentOrders();
    this.loadUpcomingReservations();
    this.loadNotifications();
    
    this.clientService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });
    
    this.clientService.refreshUnreadCount();
  }

  ngOnDestroy(): void {
    // Cleanup si nécessaire
    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const requestedTab = params['tab'];
        if (['overview', 'orders', 'reservations', 'notifications', 'settings', 'testimonial'].includes(requestedTab)) {
          this.activeTab = requestedTab as 'overview' | 'orders' | 'reservations' | 'notifications' | 'settings' | 'testimonial';
          console.log('📍 Onglet activé depuis URL:', this.activeTab);
        }
      }
    });
  }

  initializePreferencesForm(): void {
    this.preferencesForm = this.fb.group({
      email_notifications: [true],
      sms_notifications: [true],
      push_notifications: [true],
      notify_order_confirmed: [true],
      notify_order_ready: [true],
      notify_order_delivered: [true],
      notify_reservation_confirmed: [true],
      notify_reservation_reminder: [true]
    });
  }

  loadProfile(): void {
    this.loading.profile = true;
    this.clientService.getProfile().subscribe({
      next: (data) => {
        console.log('📊 Données reçues du backend:', data);
        console.log('📊 Statistiques:', data.statistics);
        
        this.statistics = data.statistics;
        this.preferences = data.preferences;
        this.preferencesForm.patchValue(this.preferences);
        this.loading.profile = false;
        
        console.log('✅ Statistiques chargées dans le component:', this.statistics);
      },
      error: (error) => {
        console.error('❌ Error loading profile:', error);
        this.loading.profile = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger votre profil. Veuillez réessayer.'
        );
      }
    });
  }

  loadRecentOrders(): void {
    this.loading.orders = true;
    this.clientService.getOrders({ limit: 5 }).subscribe({
      next: (orders) => {
        this.recentOrders = orders;
        this.loading.orders = false;
      },
      error: (error) => {
        console.error('Error loading orders:', error);
        this.loading.orders = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger vos commandes'
        );
      }
    });
  }

  loadUpcomingReservations(): void {
    this.loading.reservations = true;
    this.clientService.getReservations({ upcoming: true, limit: 5 }).subscribe({
      next: (reservations) => {
        this.upcomingReservations = reservations;
        this.loading.reservations = false;
      },
      error: (error) => {
        console.error('Error loading reservations:', error);
        this.loading.reservations = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger vos réservations'
        );
      }
    });
  }

  loadNotifications(): void {
    this.loading.notifications = true;
    this.clientService.getNotifications({ limit: 10 }).subscribe({
      next: (data) => {
        this.notifications = data.notifications;
        this.unreadCount = data.unreadCount;
        this.loading.notifications = false;
      },
      error: (error) => {
        console.error('Error loading notifications:', error);
        this.loading.notifications = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger vos notifications'
        );
      }
    });
  }

  async updatePreferences(): Promise<void> {
    if (this.preferencesForm.valid) {
      this.loading.preferences = true;
      
      this.clientService.updateNotificationPreferences(this.preferencesForm.value).subscribe({
        next: (preferences) => {
          this.preferences = preferences;
          this.loading.preferences = false;
          this.toastService.showSuccess(
            'Préférences mises à jour',
            'Vos préférences de notification ont été enregistrées avec succès'
          );
        },
        error: (error) => {
          console.error('Error updating preferences:', error);
          this.loading.preferences = false;
          this.toastService.showError(
            'Erreur de mise à jour',
            error.error?.message || 'Impossible de mettre à jour vos préférences'
          );
        }
      });
    }
  }

  async confirmDelivery(orderId: number): Promise<void> {
    const order = this.recentOrders.find(o => o.id === orderId);
    const restaurantName = order?.business_name || 'ce restaurant';

    const confirmed = await this.confirmationService.confirm(
      'Confirmer la réception',
      `Confirmez-vous avoir bien reçu votre commande de ${restaurantName} ?\n\nCette action est irréversible.`,
      {
        confirmText: 'Oui, j\'ai reçu ma commande',
        cancelText: 'Non, pas encore',
        type: 'success'
      }
    );

    if (!confirmed) return;

    this.clientService.confirmDelivery(orderId).subscribe({
      next: () => {
        this.toastService.showSuccess(
          'Livraison confirmée',
          'Merci d\'avoir confirmé la réception de votre commande !'
        );
        this.loadRecentOrders();
      },
      error: (error) => {
        console.error('Error confirming delivery:', error);
        this.toastService.showError(
          'Erreur de confirmation',
          error.error?.message || 'Impossible de confirmer la livraison'
        );
      }
    });
  }

  markNotificationAsRead(notification: ClientNotification): void {
    if (!notification.is_read) {
      this.clientService.markNotificationAsRead(notification.id).subscribe({
        next: () => {
          notification.is_read = true;
          notification.read_at = new Date();
          this.clientService.refreshUnreadCount();
        },
        error: (error) => {
          console.error('Error marking notification as read:', error);
          this.toastService.showError(
            'Erreur',
            'Impossible de marquer la notification comme lue'
          );
        }
      });
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Marquer tout comme lu',
      `Voulez-vous marquer toutes vos ${this.unreadCount} notification${this.unreadCount > 1 ? 's' : ''} non lue${this.unreadCount > 1 ? 's' : ''} comme lue${this.unreadCount > 1 ? 's' : ''} ?`,
      {
        confirmText: 'Oui, tout marquer',
        cancelText: 'Annuler',
        type: 'info'
      }
    );

    if (!confirmed) return;

    this.clientService.markAllNotificationsAsRead().subscribe({
      next: () => {
        this.notifications.forEach(n => {
          n.is_read = true;
          n.read_at = new Date();
        });
        this.unreadCount = 0;
        this.toastService.showSuccess(
          'Notifications mises à jour',
          'Toutes vos notifications ont été marquées comme lues'
        );
      },
      error: (error) => {
        console.error('Error marking all notifications as read:', error);
        this.toastService.showError(
          'Erreur',
          'Impossible de marquer toutes les notifications comme lues'
        );
      }
    });
  }

  async deleteNotification(notificationId: number): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    
    const confirmed = await this.confirmationService.confirm(
      'Supprimer la notification',
      `Voulez-vous vraiment supprimer cette notification ?\n\n"${notification?.title}"\n\nCette action est irréversible.`,
      {
        confirmText: 'Oui, supprimer',
        cancelText: 'Annuler',
        type: 'danger'
      }
    );

    if (!confirmed) return;

    this.clientService.deleteNotification(notificationId).subscribe({
      next: () => {
        this.notifications = this.notifications.filter(n => n.id !== notificationId);
        this.toastService.showSuccess(
          'Notification supprimée',
          'La notification a été supprimée avec succès'
        );
        this.clientService.refreshUnreadCount();
      },
      error: (error) => {
        console.error('Error deleting notification:', error);
        this.toastService.showError(
          'Erreur de suppression',
          'Impossible de supprimer la notification'
        );
      }
    });
  }

  getNotificationIcon(type: string): string {
    return this.clientService.getNotificationIcon(type);
  }

  getNotificationClass(type: string): string {
    return this.clientService.getNotificationClass(type);
  }

  getOrderStatusLabel(status: string): string {
    return this.clientService.getOrderStatusLabel(status);
  }

  getReservationStatusLabel(status: string): string {
    return this.clientService.getReservationStatusLabel(status);
  }

  getOrderStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'badge bg-warning',
      'confirmed': 'badge bg-info',
      'preparing': 'badge bg-primary',
      'ready': 'badge bg-success',
      'delivered': 'badge bg-secondary',
      'cancelled': 'badge bg-danger'
    };
    return classes[status] || 'badge bg-secondary';
  }

  getReservationStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'badge bg-warning',
      'confirmed': 'badge bg-success',
      'cancelled': 'badge bg-danger'
    };
    return classes[status] || 'badge bg-secondary';
  }

  switchTab(tab: 'overview' | 'orders' | 'reservations' | 'notifications' | 'settings' | 'testimonial'): void {
    this.activeTab = tab;
  }

  /**
   * Télécharger le reçu PDF d'une commande normale
   */
  downloadReceipt(orderId: number): void {
    const url = `${environment.apiUrl}/client/orders/${orderId}/receipt`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `recu-${orderId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.toastService.showSuccess(
          'Reçu téléchargé',
          `Le reçu de la commande #${orderId} a été téléchargé`
        );
      },
      error: (err) => {
        console.error('Erreur téléchargement reçu:', err);
        this.toastService.showError(
          'Erreur',
          'Impossible de télécharger le reçu. Réessayez.'
        );
      }
    });
  }

  /**
   * Télécharger le reçu PDF d'une commande spéciale
   */
  downloadSpecialReceipt(specialOrderId: number): void {
    const url = `${environment.apiUrl}/client/special-orders/${specialOrderId}/receipt`;
    this.http.get(url, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `recu-SP-${specialOrderId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.toastService.showSuccess(
          'Reçu téléchargé',
          `Le reçu SP-${specialOrderId} a été téléchargé`
        );
      },
      error: (err) => {
        console.error('Erreur téléchargement reçu spécial:', err);
        this.toastService.showError('Erreur', 'Impossible de télécharger le reçu.');
      }
    });
  }

}