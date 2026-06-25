import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, FormsModule } from '@angular/forms';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/services/auth/auth.service';
import { ClientNotification, ClientNotificationPreferences, ClientService, ClientStatistics } from '../../core/services/client/client.service';
import { CurrencyFormatPipe } from '../../shared/pipes/currency-format.pipe';
import { ToastService } from '../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../core/services/confirmation-modal/confirmation-modal.service';
import { SubmitTestimonialComponent } from '../../shared/components/submit-testimonial/submit-testimonial.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ChatService } from '../../core/services/chat/chat.service';
import { Subscription } from 'rxjs';


@Component({
  selector: 'app-client-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    FormsModule,
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

  // ✅ Formulaire d'édition du profil
  profileForm!: FormGroup;
  editingProfile = false;
  savingProfile = false;

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

  showMoreMenu = false;

  // État modal notation livreur
  showRatingModal = false;
  ratingOrderId: number | null = null;
  ratingValue = 0;
  ratingComment = '';
  ratingLoading = false;
  driverReviews: { [orderId: number]: any } = {};
  
  private socketSub?: Subscription;

  constructor(
    private clientService: ClientService,
    private authService: AuthService,
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService,
    private http: HttpClient,
    private chatService: ChatService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.initializePreferencesForm();
    this.initializeProfileForm();

    this.route.queryParams.subscribe(params => {
      if (params['tab']) {
        const requestedTab = params['tab'];
        if (['overview', 'orders', 'reservations', 'notifications', 'settings', 'testimonial'].includes(requestedTab)) {
          this.activeTab = requestedTab as any;
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

    this.socketSub = this.chatService.orderUpdated$.subscribe((data) => {
      const idx = this.recentOrders.findIndex(o => o.id === data.orderId);
      if (idx !== -1) this.recentOrders[idx] = { ...this.recentOrders[idx], ...data };
    });
    
  }

  ngOnDestroy(): void { this.socketSub?.unsubscribe();}

  // ─── Initialisation des formulaires ──────────────────────────

  initializeProfileForm(): void {
    this.profileForm = this.fb.group({
      first_name: [this.currentUser?.first_name || '', [Validators.required, Validators.minLength(2)]],
      last_name:  [this.currentUser?.last_name  || '', [Validators.required, Validators.minLength(2)]],
      phone:      [this.currentUser?.phone      || '']
    });
  }

  initializePreferencesForm(): void {
    this.preferencesForm = this.fb.group({
      email_notifications:          [true],
      sms_notifications:            [true],
      push_notifications:           [true],
      notify_order_confirmed:       [true],
      notify_order_ready:           [true],
      notify_order_delivered:       [true],
      notify_reservation_confirmed: [true],
      notify_reservation_reminder:  [true]
    });
  }

  // ─── Édition profil ───────────────────────────────────────────

  openEditProfile(): void {
    // Pré-remplir le formulaire avec les valeurs actuelles
    this.profileForm.patchValue({
      first_name: this.currentUser?.first_name || '',
      last_name:  this.currentUser?.last_name  || '',
      phone:      this.currentUser?.phone      || ''
    });
    this.editingProfile = true;
  }

  cancelEditProfile(): void {
    this.editingProfile = false;
    this.profileForm.reset({
      first_name: this.currentUser?.first_name || '',
      last_name:  this.currentUser?.last_name  || '',
      phone:      this.currentUser?.phone      || ''
    });
  }

  saveProfile(): void {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    this.savingProfile = true;
    const payload = {
      first_name: this.profileForm.value.first_name.trim(),
      last_name:  this.profileForm.value.last_name.trim(),
      phone:      this.profileForm.value.phone?.trim() || null
    };

    this.clientService.updateProfile(payload).subscribe({
      next: (data) => {
        const updatedUser = data.user;
        // ✅ Mettre à jour l'utilisateur dans le localStorage et le composant
        localStorage.setItem('user', JSON.stringify(updatedUser));
        this.currentUser = updatedUser;

        this.savingProfile = false;
        this.editingProfile = false;
        this.toastService.showSuccess('Profil mis à jour', 'Vos informations ont été enregistrées avec succès');
      },
      error: (error) => {
        this.savingProfile = false;
        this.toastService.showError(
          'Erreur de mise à jour',
          error.error?.message || 'Impossible de mettre à jour votre profil'
        );
      }
    });
  }

  // ─── Chargement des données ───────────────────────────────────

  loadProfile(): void {
    this.loading.profile = true;
    this.clientService.getProfile().subscribe({
      next: (data) => {
        this.statistics  = data.statistics;
        this.preferences = data.preferences;
        this.preferencesForm.patchValue(this.preferences);
        this.loading.profile = false;
      },
      error: (error) => {
        console.error('Error loading profile:', error);
        this.loading.profile = false;
        this.toastService.showError('Erreur de chargement', 'Impossible de charger votre profil. Veuillez réessayer.');
      }
    });
  }

  loadRecentOrders(): void {
    this.loading.orders = true;
    this.clientService.getOrders({ limit: 5 }).subscribe({
      next: (orders) => { 
        this.recentOrders = orders; 
        this.loading.orders = false; 
        this.checkDriverReviews(this.recentOrders);
      },
      error: () => { this.loading.orders = false; this.toastService.showError('Erreur', 'Impossible de charger vos commandes'); }
    });
  }

  loadUpcomingReservations(): void {
    this.loading.reservations = true;
    this.clientService.getReservations({ upcoming: true, limit: 5 }).subscribe({
      next: (reservations) => { this.upcomingReservations = reservations; this.loading.reservations = false; },
      error: () => { this.loading.reservations = false; this.toastService.showError('Erreur', 'Impossible de charger vos réservations'); }
    });
  }

  loadNotifications(): void {
    this.loading.notifications = true;
    this.clientService.getNotifications({ limit: 10 }).subscribe({
      next: (data) => { this.notifications = data.notifications; this.unreadCount = data.unreadCount; this.loading.notifications = false; },
      error: (error) => {
        this.loading.notifications = false;
        if (error.status !== 403) {
          this.toastService.showError('Erreur', 'Impossible de charger vos notifications');
        }
      }
    });
  }

  // ─── Préférences ──────────────────────────────────────────────

  async updatePreferences(): Promise<void> {
    if (this.preferencesForm.valid) {
      this.loading.preferences = true;
      this.clientService.updateNotificationPreferences(this.preferencesForm.value).subscribe({
        next: (preferences) => {
          this.preferences = preferences;
          this.loading.preferences = false;
          this.toastService.showSuccess('Préférences mises à jour', 'Vos préférences ont été enregistrées');
        },
        error: (error) => {
          this.loading.preferences = false;
          this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour vos préférences');
        }
      });
    }
  }

  // ─── Commandes ────────────────────────────────────────────────

  async confirmDelivery(orderId: number): Promise<void> {
    const order = this.recentOrders.find(o => o.id === orderId);
    const confirmed = await this.confirmationService.confirm(
      'Confirmer la réception',
      `Confirmez-vous avoir bien reçu votre commande de ${order?.business_name || 'ce restaurant'} ?`,
      { confirmText: 'Oui, j\'ai reçu ma commande', cancelText: 'Non, pas encore', type: 'success' }
    );
    if (!confirmed) return;
    this.clientService.confirmDelivery(orderId).subscribe({
      next: () => { this.toastService.showSuccess('Livraison confirmée', 'Merci d\'avoir confirmé !'); this.loadRecentOrders(); },
      error: (error) => { this.toastService.showError('Erreur', error.error?.message || 'Impossible de confirmer'); }
    });
  }

  // ─── Notifications ────────────────────────────────────────────

  markNotificationAsRead(notification: ClientNotification): void {
    if (!notification.is_read) {
      this.clientService.markNotificationAsRead(notification.id).subscribe({
        next: () => { notification.is_read = true; notification.read_at = new Date(); this.clientService.refreshUnreadCount(); },
        error: () => { this.toastService.showError('Erreur', 'Impossible de marquer la notification'); }
      });
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Marquer tout comme lu',
      `Voulez-vous marquer toutes vos ${this.unreadCount} notification(s) comme lues ?`,
      { confirmText: 'Oui, tout marquer', cancelText: 'Annuler', type: 'info' }
    );
    if (!confirmed) return;
    this.clientService.markAllNotificationsAsRead().subscribe({
      next: () => {
        this.notifications.forEach(n => { n.is_read = true; n.read_at = new Date(); });
        this.unreadCount = 0;
        this.toastService.showSuccess('Notifications mises à jour', 'Toutes vos notifications ont été marquées comme lues');
      },
      error: () => { this.toastService.showError('Erreur', 'Impossible de marquer toutes les notifications'); }
    });
  }

  async deleteNotification(notificationId: number): Promise<void> {
    const notification = this.notifications.find(n => n.id === notificationId);
    const confirmed = await this.confirmationService.confirm(
      'Supprimer la notification',
      `Supprimer "${notification?.title}" ?`,
      { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;
    this.clientService.deleteNotification(notificationId).subscribe({
      next: () => { this.notifications = this.notifications.filter(n => n.id !== notificationId); this.toastService.showSuccess('Supprimée', 'Notification supprimée'); this.clientService.refreshUnreadCount(); },
      error: () => { this.toastService.showError('Erreur', 'Impossible de supprimer'); }
    });
  }

  // ─── Reçus ────────────────────────────────────────────────────

  downloadReceipt(orderId: number): void {
    this.http.get(`${environment.apiUrl}/client/orders/${orderId}/receipt`, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `recu-${orderId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.toastService.showSuccess('Reçu téléchargé', `Reçu ${orderId} téléchargé`);
      },
      error: () => { this.toastService.showError('Erreur', 'Impossible de télécharger le reçu'); }
    });
  }

  downloadSpecialReceipt(specialOrderId: number): void {
    this.http.get(`${environment.apiUrl}/client/special-orders/${specialOrderId}/receipt`, { responseType: 'blob' }).subscribe({
      next: (blob: Blob) => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `recu-SP-${specialOrderId}.pdf`;
        link.click();
        URL.revokeObjectURL(link.href);
        this.toastService.showSuccess('Reçu téléchargé', `Reçu SP-${specialOrderId} téléchargé`);
      },
      error: () => { this.toastService.showError('Erreur', 'Impossible de télécharger le reçu'); }
    });
  }

  // ─── Utilitaires ──────────────────────────────────────────────

  switchTab(tab: 'overview' | 'orders' | 'reservations' | 'notifications' | 'settings' | 'testimonial'): void {
    this.activeTab = tab;
  }

  getNotificationIcon(type: string):  string { return this.clientService.getNotificationIcon(type); }
  getNotificationClass(type: string): string { return this.clientService.getNotificationClass(type); }
  getOrderStatusLabel(status: string): string { return this.clientService.getOrderStatusLabel(status); }
  getReservationStatusLabel(status: string): string { return this.clientService.getReservationStatusLabel(status); }

  // ─── MENU MOBILE "PLUS" ───────────────────────────────────────

  toggleMoreMenu(): void {
    this.showMoreMenu = !this.showMoreMenu;
  }

  closeMoreMenu(): void {
    this.showMoreMenu = false;
  }

  selectMoreTab(tab: 'testimonial' | 'settings'): void {
    this.activeTab = tab;
    this.closeMoreMenu();
  }

  // ─── NOTATION LIVREUR ───────────────────────────────────────

  openRatingModal(orderId: number): void {
    this.ratingOrderId = orderId;
    this.ratingValue = 0;
    this.ratingComment = '';
    this.showRatingModal = true;
  }

  closeRatingModal(): void {
    this.showRatingModal = false;
    this.ratingOrderId = null;
  }

  submitDriverRating(): void {
  if (!this.ratingOrderId || this.ratingValue < 1) {
    this.toastService.showError('Erreur', 'Veuillez sélectionner une note');
    return;
  }

  this.ratingLoading = true;
  this.clientService.rateDriver(this.ratingOrderId, this.ratingValue, this.ratingComment).subscribe({
      next: () => {
        this.ratingLoading = false;
        this.driverReviews[this.ratingOrderId!] = { rating: this.ratingValue, comment: this.ratingComment };
        this.toastService.showSuccess('Merci !', 'Votre avis sur le livreur a été enregistré');
        this.closeRatingModal();
      },
      error: (err) => {
        this.ratingLoading = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'enregistrer votre avis');
      }
    });
  }

  // Charger si une note existe déjà — appeler dans loadRecentOrders après réception
  checkDriverReviews(orders: any[]): void {
    orders.filter(o => o.delivery_confirmed).forEach(o => {
      this.clientService.getDriverReview(o.id).subscribe({
        next: (res) => { if (res.data) this.driverReviews[o.id] = res.data; }
      });
    });
  }

}