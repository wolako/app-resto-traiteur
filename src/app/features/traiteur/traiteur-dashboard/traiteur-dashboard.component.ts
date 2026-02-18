import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth/auth.service';
import { BusinessService } from '../../../core/services/business/business.service';
import { OrderService } from '../../../core/services/orders/order.service';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { MenuItemsModalComponent } from '../../../shared/modal/menu-items-modal/menu-items-modal.component';
import { SubscriptionManagementComponent } from '../../../shared/subscription-management/subscription-management.component';
import { CommissionsViewComponent } from '../../../shared/commissions-view/commissions-view.component';
import { Order } from '../../../core/models/order.model';
import { Menu } from '../../../core/models/menu.model';
import { Business } from '../../../core/models/business.model';
import { User } from '../../../core/models/user.model';
import { environment } from '../../../../environments/environment';
import { Notification } from '../../../core/models/notification.model';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { Router } from '@angular/router';
import { SupportTicketComponent } from '../../../shared/components/support-ticket/support-ticket.component';
import { BrandingSettingComponent } from '../../../shared/components/branding-setting/branding-setting.component';
import { BusinessReviewsComponent } from '../../../shared/components/business-reviews/business-reviews.component';
import { SubmitTestimonialComponent } from '../../../shared/components/submit-testimonial/submit-testimonial.component';
import { PaymentService } from '../../../core/services/payments/payment.service';

interface SubscriptionLimits {
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_special_orders_per_month: number | null;
  max_photos: number;
  current_menu_items: number;
  current_orders: number;
  current_special_orders: number;
  current_photos: number;
}

@Component({
  selector: 'app-traiteur-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MenuItemsModalComponent,
    SubscriptionManagementComponent,
    CommissionsViewComponent,
    SupportTicketComponent,
    BrandingSettingComponent,
    BusinessReviewsComponent,
    SubmitTestimonialComponent
  ],
  templateUrl: './traiteur-dashboard.component.html',
  styleUrls: ['./traiteur-dashboard.component.scss']
})
export class TraiteurDashboardComponent implements OnInit {
  activeTab = 'overview';
  business: Business | null = null;
  currentUser: User | null = null;
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  menus: Menu[] = [];
  notifications: Notification[] = [];
  unreadCount = 0;
  showNotifications = false;

  Math = Math;

  orderStats = { total: 0, revenue: 0, commissions: 0 };

  subscriptionLimits: SubscriptionLimits | null = null;

  profileForm!: FormGroup;
  businessForm!: FormGroup;
  hoursForm!: FormGroup;
  menuForm!: FormGroup;
  passwordForm!: FormGroup;

  orderFilter = '';

  profileLoading = false;
  businessLoading = false;
  availabilityLoading = false;
  hoursLoading = false;
  menuLoading = false;
  passwordLoading = false;

  showMenuModal = false;
  editingMenu: Menu | null = null;
  selectedMenuForItems: Menu | null = null;
  showItemsModal = false;
  showPasswordModal = false;

  profileMessage = '';
  profileError = '';
  businessMessage = '';
  businessError = '';
  hoursMessage = '';
  hoursError = '';
  passwordMessage = '';
  passwordError = '';

  specialOrders: any[] = [];
  filteredSpecialOrders: any[] = [];
  specialOrderFilter = '';

  isSandbox = environment.paymentMode === 'sandbox';
  paymentLoading = false;
  showPaymentModal = false;
  selectedOrderForPayment: any = null;
  paymentMethod = 'Mixx By Yas';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private businessService: BusinessService,
    private orderService: OrderService,
    private notificationService: NotificationService,
    private http: HttpClient,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService,
    private paymentService: PaymentService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForms();
    this.currentUser = this.authService.getCurrentUser();
    this.business = this.authService.getBusiness();

    if (this.business) {
      this.populateForms();
      this.loadData();
      this.loadNotifications();
      this.loadSubscriptionLimits();
      this.loadCommissionStats(),

      this.notificationService.unreadCount$.subscribe(count => {
        this.unreadCount = count;
      });

      this.notificationService.refreshUnreadCount();
    } else {
      console.error('No business found for this user');
    }
  }

  loadSubscriptionLimits(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/usage`)
      .subscribe({
        next: (response) => {
          const limits = response.limits || {};
          const usage = response.usage || {};

          this.subscriptionLimits = {
            max_menu_items: limits.menu_items,
            max_orders_per_month: limits.orders_per_month,
            max_special_orders_per_month: limits.special_orders_per_month,
            max_photos: limits.photos,
            current_menu_items: usage.menu_items || 0,
            current_orders: usage.orders_this_month || 0,
            current_special_orders: usage.special_orders_this_month || 0,
            current_photos: usage.photos || 0
          };

          this.checkLimitsAndAlert();
        },
        error: (err) => {
          console.error('Erreur chargement limites:', err);
        }
      });
  }

  checkLimitsAndAlert(): void {
    if (!this.subscriptionLimits) return;

    if (this.subscriptionLimits.max_special_orders_per_month !== null) {
      const pct = (this.subscriptionLimits.current_special_orders / this.subscriptionLimits.max_special_orders_per_month) * 100;
      if (pct >= 100) console.warn(`❌ Limite commandes spéciales atteinte`);
      else if (pct >= 90) console.warn(`⚠️ Approche limite commandes spéciales`);
    }

    if (this.subscriptionLimits.max_menu_items !== null) {
      const pct = (this.subscriptionLimits.current_menu_items / this.subscriptionLimits.max_menu_items) * 100;
      if (pct >= 100) console.warn(`❌ Limite articles menu atteinte`);
      else if (pct >= 90) console.warn(`⚠️ Approche limite articles menu`);
    }
  }

  canAddMenuItem(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_menu_items === null) return true;
    return this.subscriptionLimits.current_menu_items < this.subscriptionLimits.max_menu_items;
  }

  canAcceptSpecialOrder(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_special_orders_per_month === null) return true;
    return this.subscriptionLimits.current_special_orders < this.subscriptionLimits.max_special_orders_per_month;
  }

  getLimitAlertMessage(type: 'menu_items' | 'special_orders'): string | null {
    if (!this.subscriptionLimits) return null;

    if (type === 'menu_items' && this.subscriptionLimits.max_menu_items !== null) {
      const pct = (this.subscriptionLimits.current_menu_items / this.subscriptionLimits.max_menu_items) * 100;
      if (pct >= 100) return `Limite d'articles de menu atteinte (${this.subscriptionLimits.max_menu_items}). Passez à un plan supérieur.`;
      if (pct >= 90) return `Attention : ${this.subscriptionLimits.current_menu_items}/${this.subscriptionLimits.max_menu_items} articles utilisés.`;
    }

    if (type === 'special_orders' && this.subscriptionLimits.max_special_orders_per_month !== null) {
      const pct = (this.subscriptionLimits.current_special_orders / this.subscriptionLimits.max_special_orders_per_month) * 100;
      if (pct >= 100) return `Limite mensuelle atteinte (${this.subscriptionLimits.max_special_orders_per_month}). Passez à un plan supérieur.`;
      if (pct >= 90) return `Attention : ${this.subscriptionLimits.current_special_orders}/${this.subscriptionLimits.max_special_orders_per_month} commandes ce mois.`;
    }

    return null;
  }

  navigateToSubscription(): void {
    this.activeTab = 'subscription';
  }

  private initializeForms(): void {
    this.profileForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      phone: [''],
      email: [{ value: '', disabled: true }]
    });

    this.businessForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      address: [''],
      phone: ['']
    });

    this.hoursForm = this.fb.group({
      availability_start: ['', Validators.required],
      availability_end: ['', Validators.required]
    });

    this.menuForm = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      is_active: [true]
    });

    this.passwordForm = this.fb.group({
      currentPassword: ['', Validators.required],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', Validators.required]
    }, { validators: this.passwordMatchValidator });
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value
      ? null : { 'mismatch': true };
  }

  private populateForms(): void {
    if (this.currentUser) {
      this.profileForm.patchValue({
        first_name: this.currentUser.first_name,
        last_name: this.currentUser.last_name,
        phone: this.currentUser.phone,
        email: this.currentUser.email
      });
    }

    if (this.business) {
      this.businessForm.patchValue({
        name: this.business.name,
        description: this.business.description,
        address: this.business.address,
        phone: this.business.phone
      });

      this.hoursForm.patchValue({
        availability_start: this.business.availability_start,
        availability_end: this.business.availability_end
      });
    }
  }

  loadData(): void {
    this.loadOrders();
    this.loadMenus();
    this.loadSpecialOrders();
  }

  // =============================================
  // PROFIL
  // =============================================

  updateProfile(): void {
    if (this.profileForm.valid && this.currentUser?.id) {
      this.profileLoading = true;
      this.http.put(`${environment.apiUrl}/auth/profile`, {
        first_name: this.profileForm.value.first_name,
        last_name: this.profileForm.value.last_name,
        phone: this.profileForm.value.phone
      }).subscribe({
        next: (response: any) => {
          const updatedUser = response.data?.user || response.user;
          localStorage.setItem('user', JSON.stringify(updatedUser));
          this.currentUser = updatedUser;
          this.profileLoading = false;
          this.toastService.showSuccess('Profil mis à jour', 'Vos informations ont été mises à jour avec succès');
        },
        error: (error) => {
          this.profileLoading = false;
          this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour le profil');
        }
      });
    }
  }

  // =============================================
  // ÉTABLISSEMENT
  // =============================================

  updateBusiness(): void {
    if (this.businessForm.valid && this.business?.id) {
      this.businessLoading = true;
      this.businessService.updateBusiness(this.business.id, {
        name: this.businessForm.value.name,
        description: this.businessForm.value.description,
        address: this.businessForm.value.address,
        phone: this.businessForm.value.phone
      }).subscribe({
        next: (response: any) => {
          const updatedBusiness = response.data || response;
          localStorage.setItem('business', JSON.stringify(updatedBusiness));
          this.business = updatedBusiness;
          this.businessLoading = false;
          this.toastService.showSuccess('Informations mises à jour', `Les informations de ${updatedBusiness.name} ont été mises à jour`);
        },
        error: (error) => {
          this.businessLoading = false;
          this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour');
        }
      });
    }
  }

  // =============================================
  // MOT DE PASSE
  // =============================================

  openPasswordModal(): void {
    this.passwordForm.reset();
    this.passwordMessage = '';
    this.passwordError = '';
    this.showPasswordModal = true;
  }

  closePasswordModal(): void {
    this.showPasswordModal = false;
    this.passwordForm.reset();
  }

  changePassword(): void {
    if (this.passwordForm.valid) {
      this.passwordLoading = true;
      this.http.put(`${environment.apiUrl}/auth/change-password`, {
        currentPassword: this.passwordForm.value.currentPassword,
        newPassword: this.passwordForm.value.newPassword
      }).subscribe({
        next: () => {
          this.passwordLoading = false;
          this.toastService.showSuccess('Mot de passe modifié', 'Votre mot de passe a été changé avec succès');
          setTimeout(() => this.closePasswordModal(), 1500);
        },
        error: (error) => {
          this.passwordLoading = false;
          this.toastService.showError('Erreur', error.error?.message || 'Impossible de changer le mot de passe');
        }
      });
    }
  }

  hasMinLength(): boolean { return (this.passwordForm.get('newPassword')?.value?.length ?? 0) >= 8; }
  hasUpperCase(): boolean { return /[A-Z]/.test(this.passwordForm.get('newPassword')?.value || ''); }
  hasLowerCase(): boolean { return /[a-z]/.test(this.passwordForm.get('newPassword')?.value || ''); }
  hasNumber(): boolean { return /[0-9]/.test(this.passwordForm.get('newPassword')?.value || ''); }
  hasSpecialChar(): boolean { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.passwordForm.get('newPassword')?.value || ''); }

  // =============================================
  // NOTIFICATIONS
  // =============================================

  loadNotifications(): void {
    this.notificationService.getNotifications({ limit: 10, unreadOnly: false }).subscribe({
      next: (response: any) => {
        this.notifications = response.data?.notifications || [];
        this.unreadCount = response.data?.unreadCount || 0;
      },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les notifications')
    });
  }

  toggleNotifications(): void { this.showNotifications = !this.showNotifications; }

  markNotificationAsRead(notification: Notification): void {
    if (!notification.is_read) {
      this.notificationService.markAsRead(notification.id).subscribe({
        next: () => {
          notification.is_read = true;
          this.notificationService.refreshUnreadCount();
          this.loadNotifications();
        }
      });
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    if (this.unreadCount === 0) return;
    const confirmed = await this.confirmationService.confirm(
      'Marquer tout comme lu ?',
      `Voulez-vous marquer toutes les ${this.unreadCount} notifications comme lues ?`,
      { confirmText: 'Oui', cancelText: 'Annuler' }
    );
    if (!confirmed) return;
    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.notifications.forEach(n => n.is_read = true);
        this.notificationService.refreshUnreadCount();
        this.loadNotifications();
        this.toastService.showSuccess('Notifications lues', 'Toutes vos notifications ont été marquées comme lues');
      }
    });
  }

  getNotificationIcon(type: string): string { return this.notificationService.getNotificationIcon(type); }
  getNotificationClass(type: string): string { return this.notificationService.getNotificationClass(type); }

  // =============================================
  // COMMANDES
  // =============================================

  loadOrders(): void {
    if (this.business?.id) {
      this.orderService.getBusinessOrders(this.business.id).subscribe({
        next: (response: any) => {
          let ordersArray: any[] = [];
          if (Array.isArray(response)) ordersArray = response;
          else if (response && Array.isArray(response.data)) ordersArray = response.data;
          else if (response?.success !== undefined) ordersArray = response.data || [];

          this.orders = ordersArray;
          this.filterOrders();
          this.calculateOrderStats();
        },
        error: () => { this.orders = []; }
      });
    }
  }

  loadMenus(): void {
    if (this.business?.id) {
      this.businessService.getBusinessMenus(this.business.id).subscribe({
        next: (response: any) => { this.menus = response.data || response || []; },
        error: () => {
          this.menus = [];
          this.toastService.showError('Erreur', 'Impossible de charger les menus');
        }
      });
    }
  }

  // ✅ CORRIGÉ : Number() accepte string ET number (évite l'erreur TS2345)
  calculateOrderStats(): void {
    const today = new Date().toDateString();
    const todayOrders = this.orders.filter(o =>
      o.created_at && new Date(o.created_at).toDateString() === today
    );
    
    // ✅ Filtrer sur payment_status = 'paid'
    const paidTodayOrders = todayOrders.filter(o => o.payment_status === 'paid');
    
    this.orderStats = {
      total: todayOrders.length,
      revenue: paidTodayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0),
      commissions: this.orderStats.commissions
    };
  }

  private loadCommissionStats(): void {
    if (!this.business?.id) return;

    this.http.get<any>(`${environment.apiUrl}/commissions/business/${this.business.id}`)
      .subscribe({
        next: (res) => {
          if (res.stats) {
            this.orderStats.commissions = 
              (res.stats.total_collected || 0) + (res.stats.total_paid || 0);
          }
        },
        error: (err) => {
          console.error('Erreur chargement stats commissions:', err);
        }
      });
  }

  async toggleAvailability(): Promise<void> {
    if (!this.business?.id) return;
    const newStatus = !this.business.is_available;
    const confirmed = await this.confirmationService.confirm(
      'Changer la disponibilité ?',
      `Voulez-vous vous rendre ${newStatus ? 'disponible' : 'indisponible'} ?`,
      { confirmText: newStatus ? 'Devenir disponible' : 'Devenir indisponible', cancelText: 'Annuler', type: newStatus ? 'success' : 'warning' }
    );
    if (!confirmed) return;
    this.availabilityLoading = true;
    this.businessService.updateAvailability(this.business.id, newStatus).subscribe({
      next: (response: any) => {
        const updatedBusiness = response.data || response;
        localStorage.setItem('business', JSON.stringify(updatedBusiness));
        this.business = updatedBusiness;
        this.availabilityLoading = false;
        this.toastService.showSuccess('Disponibilité mise à jour', `Vous êtes maintenant ${newStatus ? 'disponible' : 'indisponible'}`);
      },
      error: (error) => {
        this.availabilityLoading = false;
        this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour la disponibilité');
      }
    });
  }

  updateHours(): void {
    if (this.hoursForm.valid && this.business?.id) {
      this.hoursLoading = true;
      const hoursData = {
        availability_start: this.formatTimeToHHMM(this.hoursForm.value.availability_start),
        availability_end: this.formatTimeToHHMM(this.hoursForm.value.availability_end)
      };
      this.businessService.updateHours(this.business.id, hoursData).subscribe({
        next: (response: any) => {
          const updatedBusiness = response.data || response;
          localStorage.setItem('business', JSON.stringify(updatedBusiness));
          this.business = updatedBusiness;
          this.hoursForm.patchValue({
            availability_start: updatedBusiness.availability_start,
            availability_end: updatedBusiness.availability_end
          });
          this.hoursLoading = false;
          this.toastService.showSuccess('Horaires mis à jour', `${updatedBusiness.availability_start} - ${updatedBusiness.availability_end}`);
        },
        error: (error) => {
          this.hoursLoading = false;
          this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour les horaires');
        }
      });
    }
  }

  private formatTimeToHHMM(time: string): string {
    if (!time) return '';
    if (time.length === 5) return time;
    if (time.length === 8) return time.substring(0, 5);
    return time;
  }

  // =============================================
  // MENUS
  // =============================================

  async showCreateMenuModal(): Promise<void> {
    if (!this.canAddMenuItem()) {
      const confirmed = await this.confirmationService.confirm(
        'Limite d\'articles atteinte',
        `Vous avez atteint la limite de ${this.subscriptionLimits?.max_menu_items} articles. Pour en ajouter plus, passez à un plan supérieur.`,
        { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' }
      );
      if (confirmed) this.navigateToSubscription();
      return;
    }
    this.editingMenu = null;
    this.menuForm.reset({ name: '', description: '', is_active: true });
    this.showMenuModal = true;
  }

  closeMenuModal(): void {
    this.showMenuModal = false;
    this.editingMenu = null;
    this.menuForm.reset();
  }

  saveMenu(): void {
    if (this.menuForm.valid && this.business?.id) {
      this.menuLoading = true;
      const menuData = { ...this.menuForm.value, business_id: this.business.id };

      const obs = this.editingMenu?.id
        ? this.businessService.updateMenu(this.editingMenu.id, menuData)
        : this.businessService.createMenu(this.business.id, menuData);

      obs.subscribe({
        next: () => {
          this.menuLoading = false;
          this.closeMenuModal();
          this.loadMenus();
          this.toastService.showSuccess(
            this.editingMenu ? 'Menu mis à jour' : 'Menu créé',
            `Le menu "${menuData.name}" a été ${this.editingMenu ? 'mis à jour' : 'créé'} avec succès`
          );
        },
        error: (error) => {
          this.menuLoading = false;
          this.toastService.showError('Erreur', error.error?.message || 'Impossible de sauvegarder le menu');
        }
      });
    }
  }

  editMenu(menu: Menu): void {
    this.editingMenu = menu;
    this.menuForm.patchValue({ name: menu.name, description: menu.description, is_active: menu.is_active });
    this.showMenuModal = true;
  }

  async deleteMenu(menuId: number): Promise<void> {
    const menu = this.menus.find(m => m.id === menuId);
    const confirmed = await this.confirmationService.confirm(
      'Supprimer le menu ?',
      `Êtes-vous sûr de vouloir supprimer le menu "${menu?.name}" ?`,
      { confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;
    this.businessService.deleteMenu(menuId).subscribe({
      next: () => {
        this.loadMenus();
        this.toastService.showSuccess('Menu supprimé', 'Le menu a été supprimé avec succès');
      },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de supprimer le menu')
    });
  }

  manageMenuItems(menu: Menu): void {
    this.selectedMenuForItems = menu;
    this.showItemsModal = true;
  }

  closeItemsModal(): void {
    this.showItemsModal = false;
    this.selectedMenuForItems = null;
    this.loadMenus();
  }

  filterOrders(): void {
    this.filteredOrders = this.orderFilter
      ? this.orders.filter(o => o.status === this.orderFilter)
      : this.orders;
  }

  async updateOrderStatus(orderId: number, status: string): Promise<void> {
    const statusLabels: { [key: string]: string } = {
      'confirmed': 'confirmer', 'preparing': 'mettre en préparation',
      'ready': 'marquer comme prête', 'delivered': 'marquer comme livrée', 'cancelled': 'annuler'
    };
    const confirmed = await this.confirmationService.confirm(
      'Changer le statut ?',
      `Voulez-vous ${statusLabels[status]} cette commande ?`,
      { confirmText: 'Oui', cancelText: 'Non', type: status === 'cancelled' ? 'danger' : 'info' }
    );
    if (!confirmed) return;
    this.orderService.updateOrderStatus(orderId, status).subscribe({
      next: () => {
        this.loadOrders();
        this.toastService.showSuccess('Statut mis à jour', 'La commande a été mise à jour');
      },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour')
    });
  }

  getOrderStatusClass(status: string): string {
    const c: { [k: string]: string } = { pending: 'bg-warning', confirmed: 'bg-info', preparing: 'bg-primary', ready: 'bg-success', delivered: 'bg-secondary', cancelled: 'bg-danger' };
    return c[status] || 'bg-secondary';
  }

  getOrderStatusLabel(status: string): string {
    const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée' };
    return l[status] || status;
  }

  getPaymentStatusClass(status: string): string {
    const c: { [k: string]: string } = { pending: 'bg-warning', paid: 'bg-success', failed: 'bg-danger' };
    return c[status] || 'bg-secondary';
  }

  getPaymentStatusLabel(status: string): string {
    const l: { [k: string]: string } = { pending: 'En attente', paid: 'Payé', failed: 'Échec' };
    return l[status] || status;
  }

  // =============================================
  // COMMANDES SPÉCIALES
  // =============================================

  loadSpecialOrders(): void {
    if (this.business?.id) {
      this.orderService.getSpecialOrders(this.business.id).subscribe({
        next: (response: any) => {
          let ordersArray: any[] = [];
          if (Array.isArray(response)) ordersArray = response;
          else if (response && Array.isArray(response.data)) ordersArray = response.data;
          else if (response?.success !== undefined) ordersArray = response.data || [];

          this.specialOrders = ordersArray;
          this.filterSpecialOrders();
          this.loadSubscriptionLimits();
        },
        error: () => {
          this.specialOrders = [];
          this.toastService.showError('Erreur', 'Impossible de charger les commandes spéciales');
        }
      });
    }
  }

  filterSpecialOrders(): void {
    this.filteredSpecialOrders = this.specialOrderFilter
      ? this.specialOrders.filter(o => o.status === this.specialOrderFilter)
      : this.specialOrders;
  }

  async updateSpecialOrderStatus(orderId: number, status: string): Promise<void> {
    if (status === 'confirmed' && !this.canAcceptSpecialOrder()) {
      const confirmed = await this.confirmationService.confirm(
        'Limite atteinte',
        `Vous avez atteint la limite de ${this.subscriptionLimits?.max_special_orders_per_month} commandes spéciales mensuelles.`,
        { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' }
      );
      if (confirmed) this.navigateToSubscription();
      return;
    }
    const confirmed = await this.confirmationService.confirm(
      'Changer le statut ?',
      `Voulez-vous ${status === 'confirmed' ? 'confirmer' : 'annuler'} cette commande spéciale ?`,
      { confirmText: 'Oui', cancelText: 'Non', type: status === 'cancelled' ? 'danger' : 'success' }
    );
    if (!confirmed) return;
    this.orderService.updateSpecialOrderStatus(orderId, status).subscribe({
      next: () => {
        this.loadSpecialOrders();
        this.toastService.showSuccess('Statut mis à jour', `Commande spéciale ${status === 'confirmed' ? 'confirmée' : 'annulée'}`);
      },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour')
    });
  }

  getSpecialOrderStatusClass(status: string): string {
    const c: { [k: string]: string } = { pending: 'bg-warning', confirmed: 'bg-success', cancelled: 'bg-danger' };
    return c[status] || 'bg-secondary';
  }

  getSpecialOrderStatusLabel(status: string): string {
    const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' };
    return l[status] || status;
  }

  getEventTypeLabel(eventType: string): string {
    const l: { [k: string]: string } = { mariage: 'Mariage', anniversaire: 'Anniversaire', bapteme: 'Baptême', entreprise: "Événement d'entreprise", reception: 'Réception', autre: 'Autre' };
    return l[eventType] || eventType;
  }

  // =============================================
  // PAIEMENT
  // =============================================

  viewOrder(order: any): void {
    alert(
      `Commande #${order.id}\n` +
      `Client : ${order.client_name}\n` +
      `Téléphone : ${order.client_phone}\n` +
      `Montant : ${this.formatMontant(order.total_amount)} FCFA\n` +
      `Statut : ${this.getOrderStatusLabel(order.status)}\n` +
      `Paiement : ${this.getPaymentStatusLabel(order.payment_status)}\n` +
      `Date : ${new Date(order.created_at).toLocaleString('fr-FR')}`
    );
  }

  openPaymentModal(order: any): void {
    this.selectedOrderForPayment = order;
    this.showPaymentModal = true;
  }

  closePaymentModal(): void {
    this.showPaymentModal = false;
    this.selectedOrderForPayment = null;
    this.paymentLoading = false;
  }

  payOrder(): void {
    if (!this.selectedOrderForPayment) return;
    this.paymentLoading = true;

    this.paymentService.initiatePayment({
      order_id:       this.selectedOrderForPayment.id,
      amount:         this.selectedOrderForPayment.total_amount,
      currency:       'XOF',
      payment_method: this.paymentMethod,
      customer_name:  this.selectedOrderForPayment.client_name,
      customer_phone: this.selectedOrderForPayment.client_phone,
      customer_email: this.selectedOrderForPayment.client_email || ''
    } as any).subscribe({
      next: (response: any) => {
        this.paymentLoading = false;
        if (response?.data?.sandbox) {
          this.closePaymentModal();
          this.toastService.showSuccess(
            '✅ Paiement sandbox accepté',
            `Commande #${this.selectedOrderForPayment?.id} payée (${this.formatMontant(this.selectedOrderForPayment?.total_amount)} FCFA). Reçu envoyé.`
          );
          this.loadOrders();
        }
      },
      error: (err: any) => {
        this.paymentLoading = false;
        this.toastService.showError('Erreur paiement', err.error?.message || 'Impossible de traiter le paiement');
      }
    });
  }

  // ✅ CORRIGÉ : Number() pour éviter TS2345 (same fix as restaurant)
  formatMontant(n: any): string {
    return Math.round(Number(n || 0)).toLocaleString('fr-FR');
  }
}