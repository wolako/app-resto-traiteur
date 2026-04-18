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
import { OrderDetailsModalComponent } from '../../../shared/modal/order-details-modal/order-details-modal.component';
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
import { SpecialOrderDetailsModalComponent } from '../../../shared/modal/special-order-details-modal/special-order-details-modal.component';
import { BusinessAnalyticsComponent } from '../../../shared/components/business-analytics/business-analytics/business-analytics.component';
import { PaymentAccountComponent } from '../../../shared/components/payment-account/payment-account.component';
import { CoverImageSettingComponent } from '../../../shared/components/cover-image-setting/cover-image-setting.component';

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

interface RestaurantRevenueStats {
  total_received: number;
  total_commissions: number;
  total_orders_amount: number;
  transaction_count: number;
  this_month_received: number;
  this_month_commissions: number;
}

interface PaymentAccount {
  id?: number;
  business_id?: number;
  cinetpay_site_id?: string;
  cinetpay_api_key?: string;
  cinetpay_sub_merchant_id?: string;
  preferred_payout_method?: 'mixx' | 'flooz' | 'bank';
  mixx_number?: string;
  flooz_number?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  bank_iban?: string;
  legal_name?: string;
  business_registration_number?: string;
  business_type?: 'individual' | 'company';
  status?: 'not_configured' | 'pending_verification' | 'verified' | 'rejected' | 'suspended';
  rejection_reason?: string;
  verified_at?: string;
}

@Component({
  selector: 'app-traiteur-dashboard',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MenuItemsModalComponent, OrderDetailsModalComponent,
    SubscriptionManagementComponent, CommissionsViewComponent,
    SupportTicketComponent, BrandingSettingComponent,
    BusinessReviewsComponent, SubmitTestimonialComponent,
    SpecialOrderDetailsModalComponent, BusinessAnalyticsComponent,
    PaymentAccountComponent, CoverImageSettingComponent
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
  mobileMoreOpen = false;
  Math = Math;

  orderStats = { total: 0, revenue: 0, netRevenue: 0, commissions: 0 };
  revenueStats: RestaurantRevenueStats | null = null;
  subscriptionLimits: SubscriptionLimits | null = null;

  selectedOrder: any = null;
  showOrderDetailsModal = false;
  loadingOrderUpdate = false;

  selectedSpecialOrder: any = null;
  showSpecialOrderDetailsModal = false;

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

  specialOrders: any[] = [];
  filteredSpecialOrders: any[] = [];
  specialOrderFilter = '';

  isSandbox = environment.paymentMode === 'sandbox';
  paymentLoading = false;
  showPaymentModal = false;
  selectedOrderForPayment: any = null;
  paymentMethod = 'Mixx By Yas';

  depositSettingsForm!: FormGroup;
  depositSettingsLoading = false;
  showDepositSettingsModal = false;

  hasNewOrders = false;
  hasNewSpecialOrders = false;
  hasNewReviews = false;
  currentReviewsCount = 0;
  hasNewSupportResponse = false;

  analyticsAccess = false;

  showQuoteModal = false;
  quoteForm!: FormGroup;
  quoteLoading = false;
  selectedOrderForQuote: any = null;

  paymentAccountStatus = 'not_configured';

  locationForm = { latitude: '', longitude: '', district: '' };
  locationLoading = false;
  geocodingLoading = false;
  gettingPosition = false;

  readonly lomeDistricts = [
    { value: 'Lomé Centre',   label: 'Lomé Centre' },
    { value: 'Adidogomé',     label: 'Adidogomé' },
    { value: 'Agoè',          label: 'Agoè' },
    { value: 'Bè',            label: 'Bè' },
    { value: 'Tokoin',        label: 'Tokoin' },
    { value: 'Hédzranawoé',   label: 'Hédzranawoé' },
    { value: 'Baguida',       label: 'Baguida' },
    { value: 'Kodjoviakopé',  label: 'Kodjoviakopé' },
    { value: 'Nukafu',        label: 'Nukafu' },
    { value: 'Djidjolé',      label: 'Djidjolé' },
    { value: 'Légos Beach',   label: 'Légos Beach' },
    { value: 'Nyékonakpoè',   label: 'Nyékonakpoè' },
  ];

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
      this.loadCommissionStats();
      this.loadRevenueStats();
      this.loadReviewsCount();
      this.loadSupportResponseCount();
      this.checkAnalyticsAccess();
      this.notificationService.unreadCount$.subscribe(count => { this.unreadCount = count; });
      this.notificationService.refreshUnreadCount();
    }
  }

  private checkAnalyticsAccess(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/usage`).subscribe({
      next: (response) => {
        const featureFlag: boolean | undefined = response.features?.analytics_access;
        const planCode: string = (response.plan?.name || '').toLowerCase();
        const premiumPlans = ['premium', 'premium_yearly'];
        if (featureFlag !== undefined && featureFlag !== null) {
          this.analyticsAccess = featureFlag === true;
        } else {
          this.analyticsAccess = premiumPlans.includes(planCode);
        }
      },
      error: () => { this.analyticsAccess = false; }
    });
  }

  loadSubscriptionLimits(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/usage`).subscribe({
      next: (response) => {
        const limits = response.limits || {};
        const usage = response.usage || {};
        this.subscriptionLimits = {
          max_menu_items: limits.menu_items,
          max_orders_per_month: limits.orders_per_month,
          max_special_orders_per_month: limits.special_orders_per_month ?? null,
          max_photos: limits.photos,
          current_menu_items: usage.menu_items || 0,
          current_orders: usage.orders_this_month || 0,
          current_special_orders: usage.special_orders_this_month || 0,
          current_photos: usage.photos || 0
        };
        this.checkLimitsAndAlert();
      },
      error: (err) => console.error('Erreur chargement limites:', err)
    });
  }

  checkLimitsAndAlert(): void {
    if (!this.subscriptionLimits) return;
    if (this.subscriptionLimits.max_special_orders_per_month != null) {
      const pct = (this.subscriptionLimits.current_special_orders / this.subscriptionLimits.max_special_orders_per_month) * 100;
      if (pct >= 100) console.warn(`Limite commandes spéciales atteinte`);
    }
  }

  canAddMenuItem(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_menu_items == null) return true;
    return this.subscriptionLimits.current_menu_items < this.subscriptionLimits.max_menu_items;
  }

  canAcceptSpecialOrder(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_special_orders_per_month == null) return true;
    return this.subscriptionLimits.current_special_orders < this.subscriptionLimits.max_special_orders_per_month;
  }

  navigateToSubscription(): void { this.activeTab = 'subscription'; }

  markOrdersAsSeen(): void { localStorage.setItem('seen_orders_count', String(this.orders.length)); this.hasNewOrders = false; }
  markSpecialOrdersAsSeen(): void { localStorage.setItem('seen_special_orders_count', String(this.specialOrders.length)); this.hasNewSpecialOrders = false; }
  markReviewsAsSeen(): void { localStorage.setItem('seen_reviews_count', String(this.currentReviewsCount)); this.hasNewReviews = false; }

  loadSupportResponseCount(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/support/my-tickets`).subscribe({
      next: (response) => {
        const tickets = response.data || [];
        const resolvedCount = tickets.filter((t: any) => t.status === 'resolved' && t.response).length;
        if (localStorage.getItem('seen_support_resolved_count') === null) localStorage.setItem('seen_support_resolved_count', String(resolvedCount));
        const seen = parseInt(localStorage.getItem('seen_support_resolved_count')!);
        this.hasNewSupportResponse = resolvedCount > seen;
      },
      error: () => {}
    });
  }

  markSupportAsSeen(): void {
    this.http.get<any>(`${environment.apiUrl}/support/my-tickets`).subscribe({
      next: (response) => {
        const tickets = response.data || [];
        const resolvedCount = tickets.filter((t: any) => t.status === 'resolved' && t.response).length;
        localStorage.setItem('seen_support_resolved_count', String(resolvedCount));
        this.hasNewSupportResponse = false;
      },
      error: () => {}
    });
  }

  loadReviewsCount(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/reviews/business/${this.business.id}?limit=1`).subscribe({
      next: (response) => {
        const total = parseInt(response.data?.stats?.total_reviews || 0);
        this.currentReviewsCount = total;
        if (localStorage.getItem('seen_reviews_count') === null) localStorage.setItem('seen_reviews_count', String(total));
        const seen = parseInt(localStorage.getItem('seen_reviews_count')!);
        this.hasNewReviews = total > seen;
      },
      error: () => {}
    });
  }

  private initializeForms(): void {
    this.profileForm = this.fb.group({ first_name: ['', Validators.required], last_name: ['', Validators.required], phone: [''], email: [{ value: '', disabled: true }] });
    this.businessForm = this.fb.group({ name: ['', Validators.required], description: [''], address: [''], phone: [''] });
    this.hoursForm = this.fb.group({ availability_start: ['', Validators.required], availability_end: ['', Validators.required] });
    this.menuForm = this.fb.group({ name: ['', Validators.required], description: [''], is_active: [true] });
    this.passwordForm = this.fb.group({ currentPassword: ['', Validators.required], newPassword: ['', [Validators.required, Validators.minLength(8)]], confirmPassword: ['', Validators.required] }, { validators: this.passwordMatchValidator });
    this.depositSettingsForm = this.fb.group({ default_special_order_deposit_percentage: [30, [Validators.min(10), Validators.max(100)]] });
    this.quoteForm = this.fb.group({ quoted_amount: [null, [Validators.required, Validators.min(1000)]], deposit_percentage: [30, [Validators.required, Validators.min(10), Validators.max(100)]], transport_fee: [0, [Validators.min(0)]], quote_notes: [''] });
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value ? null : { 'mismatch': true };
  }

  private populateForms(): void {
    if (this.currentUser) this.profileForm.patchValue({ first_name: this.currentUser.first_name, last_name: this.currentUser.last_name, phone: this.currentUser.phone, email: this.currentUser.email });
    if (this.business) {
      this.businessForm.patchValue({ name: this.business.name, description: this.business.description, address: this.business.address, phone: this.business.phone });
      this.hoursForm.patchValue({ availability_start: this.business.availability_start, availability_end: this.business.availability_end });
      this.depositSettingsForm.patchValue({ default_special_order_deposit_percentage: (this.business as any).default_special_order_deposit_percentage || 30 });
    }

    this.locationForm = {
      latitude:  (this.business as any)?.latitude  ? String((this.business as any).latitude)  : '',
      longitude: (this.business as any)?.longitude ? String((this.business as any).longitude) : '',
      district:  (this.business as any)?.district  || '',
    };

  }

  loadData(): void { this.loadOrders(); this.loadMenus(); this.loadSpecialOrders(); }

  private loadRevenueStats(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/businesses/${this.business.id}/revenue-stats`).subscribe({
      next: (res) => { this.revenueStats = { total_received: Number(res.total_received || 0), total_commissions: Number(res.total_commissions || 0), total_orders_amount: Number(res.total_orders_amount || 0), transaction_count: Number(res.transaction_count || 0), this_month_received: Number(res.this_month_received || 0), this_month_commissions: Number(res.this_month_commissions || 0) }; },
      error: (err) => console.error('Erreur chargement stats revenus:', err)
    });
  }

  updateProfile(): void {
    if (this.profileForm.valid && this.currentUser?.id) {
      this.profileLoading = true;
      this.http.put(`${environment.apiUrl}/auth/profile`, { first_name: this.profileForm.value.first_name, last_name: this.profileForm.value.last_name, phone: this.profileForm.value.phone }).subscribe({
        next: (response: any) => { const u = response.data?.user || response.user; localStorage.setItem('user', JSON.stringify(u)); this.currentUser = u; this.profileLoading = false; this.toastService.showSuccess('Profil mis à jour', 'Vos informations ont été mises à jour avec succès'); },
        error: (error) => { this.profileLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour le profil'); }
      });
    }
  }

  updateBusiness(): void {
    if (this.businessForm.valid && this.business?.id) {
      this.businessLoading = true;
      this.businessService.updateBusiness(this.business.id, { name: this.businessForm.value.name, description: this.businessForm.value.description, address: this.businessForm.value.address, phone: this.businessForm.value.phone }).subscribe({
        next: (response: any) => { const b = response.data || response; localStorage.setItem('business', JSON.stringify(b)); this.business = b; this.businessLoading = false; this.toastService.showSuccess('Informations mises à jour', `Les informations de ${b.name} ont été mises à jour`); },
        error: (error) => { this.businessLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour'); }
      });
    }
  }

  openPasswordModal(): void { this.passwordForm.reset(); this.showPasswordModal = true; }
  closePasswordModal(): void { this.showPasswordModal = false; this.passwordForm.reset(); }

  changePassword(): void {
    if (this.passwordForm.valid) {
      this.passwordLoading = true;
      this.http.put(`${environment.apiUrl}/auth/change-password`, { currentPassword: this.passwordForm.value.currentPassword, newPassword: this.passwordForm.value.newPassword }).subscribe({
        next: () => { this.passwordLoading = false; this.toastService.showSuccess('Mot de passe modifié', 'Votre mot de passe a été changé avec succès'); setTimeout(() => this.closePasswordModal(), 1500); },
        error: (error) => { this.passwordLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de changer le mot de passe'); }
      });
    }
  }

  hasMinLength(): boolean { return (this.passwordForm.get('newPassword')?.value?.length ?? 0) >= 8; }
  hasUpperCase(): boolean { return /[A-Z]/.test(this.passwordForm.get('newPassword')?.value || ''); }
  hasLowerCase(): boolean { return /[a-z]/.test(this.passwordForm.get('newPassword')?.value || ''); }
  hasNumber(): boolean { return /[0-9]/.test(this.passwordForm.get('newPassword')?.value || ''); }
  hasSpecialChar(): boolean { return /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(this.passwordForm.get('newPassword')?.value || ''); }

  loadNotifications(): void {
    this.notificationService.getNotifications({ limit: 10, unreadOnly: false }).subscribe({
      next: (response: any) => { this.notifications = response.data?.notifications || []; this.unreadCount = response.data?.unreadCount || 0; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les notifications')
    });
  }

  toggleNotifications(): void { this.showNotifications = !this.showNotifications; }

  markNotificationAsRead(notification: Notification): void {
    if (!notification.is_read) {
      this.notificationService.markAsRead(notification.id).subscribe({
        next: () => { notification.is_read = true; this.notificationService.refreshUnreadCount(); this.loadNotifications(); }
      });
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    if (this.unreadCount === 0) return;
    const confirmed = await this.confirmationService.confirm('Marquer tout comme lu ?', `Voulez-vous marquer toutes les ${this.unreadCount} notifications comme lues ?`, { confirmText: 'Oui', cancelText: 'Annuler' });
    if (!confirmed) return;
    this.notificationService.markAllAsRead().subscribe({
      next: () => { this.notifications.forEach(n => n.is_read = true); this.notificationService.refreshUnreadCount(); this.loadNotifications(); this.toastService.showSuccess('Notifications lues', 'Toutes vos notifications ont été marquées comme lues'); }
    });
  }

  getNotificationIcon(type: string): string { return this.notificationService.getNotificationIcon(type); }
  getNotificationClass(type: string): string { return this.notificationService.getNotificationClass(type); }

  loadOrders(): void {
    if (this.business?.id) {
      this.orderService.getBusinessOrders(this.business.id).subscribe({
        next: (response: any) => {
          let ordersArray: any[] = [];
          if (Array.isArray(response)) ordersArray = response;
          else if (response && Array.isArray(response.data)) ordersArray = response.data;
          else if (response?.success !== undefined) ordersArray = response.data || [];
          this.orders = ordersArray;
          if (localStorage.getItem('seen_orders_count') === null) localStorage.setItem('seen_orders_count', String(ordersArray.length));
          const seenOrders = parseInt(localStorage.getItem('seen_orders_count')!);
          this.hasNewOrders = ordersArray.length > seenOrders;
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
        error: () => this.toastService.showError('Erreur', 'Impossible de charger les menus')
      });
    }
  }

  calculateOrderStats(): void {
    const today = new Date().toDateString();
    const todayOrders = this.orders.filter(o => o.created_at && new Date(o.created_at).toDateString() === today);
    const paidTodayOrders = todayOrders.filter(o => o.payment_status === 'paid');
    const grossRevenue = paidTodayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
    const averageCommissionRate = (this.business as any)?.subscription_plan?.commission_rate || 5;
    const totalCommissions = Math.round(grossRevenue * (averageCommissionRate / 100));
    this.orderStats = { total: todayOrders.length, revenue: grossRevenue, netRevenue: grossRevenue - totalCommissions, commissions: totalCommissions };
  }

  private loadCommissionStats(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/commissions/business/${this.business.id}`).subscribe({
      next: (res) => { if (res.stats) this.orderStats.commissions = (res.stats.total_collected || 0) + (res.stats.total_paid || 0); },
      error: (err) => console.error('Erreur chargement stats commissions:', err)
    });
  }

  async toggleAvailability(): Promise<void> {
    if (!this.business?.id) return;
    const newStatus = !this.business.is_available;
    const confirmed = await this.confirmationService.confirm(newStatus ? 'Devenir disponible ?' : 'Devenir indisponible ?', newStatus ? `Votre service sera visible sur la plateforme.` : `Votre service ne sera plus visible.`, { confirmText: newStatus ? 'Devenir disponible' : 'Devenir indisponible', cancelText: 'Annuler', type: newStatus ? 'success' : 'warning' });
    if (!confirmed) return;
    this.availabilityLoading = true;
    this.businessService.updateAvailability(this.business.id, newStatus).subscribe({
      next: (response: any) => { const b = response.data || response; localStorage.setItem('business', JSON.stringify(b)); this.business = b; this.availabilityLoading = false; this.toastService.showSuccess('Disponibilité mise à jour', `Vous êtes maintenant ${newStatus ? 'disponible' : 'indisponible'}`); },
      error: (error) => { this.availabilityLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour la disponibilité'); }
    });
  }

  updateHours(): void {
    if (this.hoursForm.valid && this.business?.id) {
      this.hoursLoading = true;
      const hoursData = { availability_start: this.formatTimeToHHMM(this.hoursForm.value.availability_start), availability_end: this.formatTimeToHHMM(this.hoursForm.value.availability_end) };
      this.businessService.updateHours(this.business.id, hoursData).subscribe({
        next: (response: any) => { const b = response.data || response; localStorage.setItem('business', JSON.stringify(b)); this.business = b; this.hoursForm.patchValue({ availability_start: b.availability_start, availability_end: b.availability_end }); this.hoursLoading = false; this.toastService.showSuccess('Horaires mis à jour', `${b.availability_start} - ${b.availability_end}`); },
        error: (error) => { this.hoursLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour les horaires'); }
      });
    }
  }

  private formatTimeToHHMM(time: string): string { if (!time) return ''; if (time.length === 5) return time; if (time.length === 8) return time.substring(0, 5); return time; }

  async showCreateMenuModal(): Promise<void> {
    if (!this.canAddMenuItem()) {
      const confirmed = await this.confirmationService.confirm("Limite d'articles atteinte", `Vous avez atteint la limite de ${this.subscriptionLimits?.max_menu_items} articles. Passez à un plan supérieur.`, { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' });
      if (confirmed) this.navigateToSubscription();
      return;
    }
    this.editingMenu = null;
    this.menuForm.reset({ name: '', description: '', is_active: true });
    this.showMenuModal = true;
  }

  closeMenuModal(): void { this.showMenuModal = false; this.editingMenu = null; this.menuForm.reset(); }

  saveMenu(): void {
    if (this.menuForm.valid && this.business?.id) {
      this.menuLoading = true;
      const menuData = { ...this.menuForm.value, business_id: this.business.id };
      const obs = this.editingMenu?.id ? this.businessService.updateMenu(this.editingMenu.id, menuData) : this.businessService.createMenu(this.business.id, menuData);
      obs.subscribe({
        next: () => { this.menuLoading = false; this.closeMenuModal(); this.loadMenus(); this.toastService.showSuccess(this.editingMenu ? 'Menu mis à jour' : 'Menu créé', `Le menu "${menuData.name}" a été ${this.editingMenu ? 'mis à jour' : 'créé'} avec succès`); },
        error: (error) => { this.menuLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de sauvegarder le menu'); }
      });
    }
  }

  editMenu(menu: Menu): void { this.editingMenu = menu; this.menuForm.patchValue({ name: menu.name, description: menu.description, is_active: menu.is_active }); this.showMenuModal = true; }

  async deleteMenu(menuId: number): Promise<void> {
    const menu = this.menus.find(m => m.id === menuId);
    const confirmed = await this.confirmationService.confirm('Supprimer le menu ?', `Êtes-vous sûr de vouloir supprimer le menu "${menu?.name}" ?`, { confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger' });
    if (!confirmed) return;
    this.businessService.deleteMenu(menuId).subscribe({
      next: () => { this.loadMenus(); this.toastService.showSuccess('Menu supprimé', 'Le menu a été supprimé avec succès'); },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de supprimer le menu')
    });
  }

  manageMenuItems(menu: Menu): void { this.selectedMenuForItems = menu; this.showItemsModal = true; }
  closeItemsModal(): void { this.showItemsModal = false; this.selectedMenuForItems = null; this.loadMenus(); }
  filterOrders(): void { this.filteredOrders = this.orderFilter ? this.orders.filter(o => o.status === this.orderFilter) : this.orders; }

  viewOrder(order: any): void {
    this.orderService.getOrderDetails(order.id).subscribe({
      next: (details: any) => { this.selectedOrder = details.data || details; this.showOrderDetailsModal = true; },
      error: () => { this.selectedOrder = order; this.showOrderDetailsModal = true; }
    });
  }

  onOrderModalClosed(): void { this.showOrderDetailsModal = false; this.selectedOrder = null; }

  async onOrderStatusChanged(event: { orderId: number; status: string }): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Changer le statut ?', `Voulez-vous ${this.getOrderStatusActionLabel(event.status)} cette commande ?`, { confirmText: 'Oui', cancelText: 'Non', type: event.status === 'cancelled' ? 'danger' : 'info' });
    if (!confirmed) return;
    this.loadingOrderUpdate = true;
    this.orderService.updateOrderStatus(event.orderId, event.status).subscribe({
      next: () => { this.loadingOrderUpdate = false; if (this.selectedOrder?.id === event.orderId) this.selectedOrder = { ...this.selectedOrder, status: event.status }; this.loadOrders(); this.toastService.showSuccess('Statut mis à jour', `Commande mise à jour : ${this.getOrderStatusLabel(event.status)}`); },
      error: (error) => { this.loadingOrderUpdate = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour le statut'); }
    });
  }

  async updateOrderStatus(orderId: number, status: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Changer le statut ?', `Voulez-vous ${this.getOrderStatusActionLabel(status)} cette commande ?`, { confirmText: 'Oui', cancelText: 'Non', type: status === 'cancelled' ? 'danger' : 'info' });
    if (!confirmed) return;
    this.orderService.updateOrderStatus(orderId, status).subscribe({
      next: () => { this.loadOrders(); this.toastService.showSuccess('Statut mis à jour', 'La commande a été mise à jour'); },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour')
    });
  }

  getOrderStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', confirmed: 'bg-info', preparing: 'bg-primary', ready: 'bg-success', delivered: 'bg-secondary', cancelled: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getOrderStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée' }; return l[status] || status; }
  getOrderStatusActionLabel(status: string): string { const l: { [k: string]: string } = { confirmed: 'confirmer', preparing: 'mettre en préparation', ready: 'marquer comme prête', delivered: 'marquer comme livrée', cancelled: 'annuler' }; return l[status] || status; }
  getPaymentStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', paid: 'bg-success', failed: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getPaymentStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', paid: 'Payé', failed: 'Échec' }; return l[status] || status; }

  loadSpecialOrders(): void {
    if (this.business?.id) {
      this.orderService.getSpecialOrders(this.business.id).subscribe({
        next: (response: any) => {
          let ordersArray: any[] = [];
          if (Array.isArray(response)) ordersArray = response;
          else if (response && Array.isArray(response.data)) ordersArray = response.data;
          else if (response?.success !== undefined) ordersArray = response.data || [];
          this.specialOrders = ordersArray;
          if (localStorage.getItem('seen_special_orders_count') === null) localStorage.setItem('seen_special_orders_count', String(ordersArray.length));
          const seenSpecial = parseInt(localStorage.getItem('seen_special_orders_count')!);
          this.hasNewSpecialOrders = ordersArray.length > seenSpecial;
          if (this.activeTab === 'special-orders') this.markSpecialOrdersAsSeen();
          this.filterSpecialOrders();
          this.loadSubscriptionLimits();
        },
        error: () => { this.specialOrders = []; }
      });
    }
  }

  filterSpecialOrders(): void { this.filteredSpecialOrders = this.specialOrderFilter ? this.specialOrders.filter(o => o.status === this.specialOrderFilter) : this.specialOrders; }

  async updateSpecialOrderStatus(orderId: number, status: string): Promise<void> {
    if (status === 'confirmed' && !this.canAcceptSpecialOrder()) {
      const confirmed = await this.confirmationService.confirm('Limite atteinte', `Vous avez atteint la limite de ${this.subscriptionLimits?.max_special_orders_per_month} commandes spéciales mensuelles.`, { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' });
      if (confirmed) this.navigateToSubscription();
      return;
    }
    const confirmed = await this.confirmationService.confirm('Changer le statut ?', `Voulez-vous ${status === 'confirmed' ? 'confirmer' : 'annuler'} cette commande spéciale ?`, { confirmText: 'Oui', cancelText: 'Non', type: status === 'cancelled' ? 'danger' : 'success' });
    if (!confirmed) return;
    this.orderService.updateSpecialOrderStatus(orderId, status).subscribe({
      next: () => { this.loadSpecialOrders(); this.toastService.showSuccess('Statut mis à jour', `Commande spéciale ${status === 'confirmed' ? 'confirmée' : 'annulée'}`); },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour')
    });
  }

  getSpecialOrderStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', confirmed: 'bg-success', cancelled: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getSpecialOrderStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' }; return l[status] || status; }
  getEventTypeLabel(eventType: string): string { const l: { [k: string]: string } = { mariage: 'Mariage', anniversaire: 'Anniversaire', bapteme: 'Baptême', entreprise: "Événement d'entreprise", reception: 'Réception', autre: 'Autre' }; return l[eventType] || eventType; }

  viewSpecialOrder(order: any): void { this.selectedSpecialOrder = order; this.showSpecialOrderDetailsModal = true; }
  onSpecialOrderModalClosed(): void { this.showSpecialOrderDetailsModal = false; this.selectedSpecialOrder = null; }

  async onSpecialOrderStatusChanged(event: { orderId: number; status: string }): Promise<void> {
    if (event.status === 'confirmed' && !this.canAcceptSpecialOrder()) {
      const goToSub = await this.confirmationService.confirm('Limite atteinte', `Vous avez atteint la limite de ${this.subscriptionLimits?.max_special_orders_per_month} commandes spéciales mensuelles.`, { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' });
      if (goToSub) this.navigateToSubscription();
      return;
    }
    this.onSpecialOrderModalClosed();
    this.orderService.updateSpecialOrderStatus(event.orderId, event.status).subscribe({
      next: () => { this.loadSpecialOrders(); this.toastService.showSuccess('Statut mis à jour', `Commande spéciale ${event.status === 'confirmed' ? 'confirmée' : 'annulée'}`); },
      error: (error: any) => { this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour'); }
    });
  }

  openPaymentModal(order: any): void { this.selectedOrderForPayment = order; this.showPaymentModal = true; }
  closePaymentModal(): void { this.showPaymentModal = false; this.selectedOrderForPayment = null; this.paymentLoading = false; }

  payOrder(): void {
    if (!this.selectedOrderForPayment) return;
    this.paymentLoading = true;
    this.paymentService.initiatePayment({ order_id: this.selectedOrderForPayment.id, amount: this.selectedOrderForPayment.total_amount, currency: 'XOF', payment_method: this.paymentMethod, customer_name: this.selectedOrderForPayment.client_name, customer_phone: this.selectedOrderForPayment.client_phone, customer_email: this.selectedOrderForPayment.client_email || '' } as any).subscribe({
      next: (response: any) => {
        this.paymentLoading = false;
        if (response?.data?.sandbox) {
          this.closePaymentModal();
          this.toastService.showSuccess('Paiement sandbox accepté', `Commande #${this.selectedOrderForPayment?.id} payée (${this.formatMontant(this.selectedOrderForPayment?.total_amount)} FCFA). Reçu envoyé.`);
          this.loadOrders(); this.loadCommissionStats(); this.loadRevenueStats();
        }
      },
      error: (err: any) => { this.paymentLoading = false; this.toastService.showError('Erreur paiement', err.error?.message || 'Impossible de traiter le paiement'); }
    });
  }

  async confirmCodPayment(orderId: number, clientName: string, amount: number): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Confirmer paiement reçu', `Avez-vous bien reçu ${this.formatMontant(amount)} FCFA en cash de ${clientName} ?`, { confirmText: 'Oui, paiement reçu', cancelText: 'Annuler', type: 'success' });
    if (!confirmed) return;
    this.http.post(`${environment.apiUrl}/orders/${orderId}/confirm-cod-payment`, { cod_amount: amount }).subscribe({
      next: () => { this.loadOrders(); this.loadCommissionStats(); this.loadRevenueStats(); this.toastService.showSuccess('Paiement confirmé', `${this.formatMontant(amount)} FCFA reçus de ${clientName}`); },
      error: (err) => { this.toastService.showError('Erreur', err.error?.error || 'Impossible de confirmer le paiement'); }
    });
  }
  openDepositSettingsModal(): void {
    if (this.business) this.depositSettingsForm.patchValue({ default_special_order_deposit_percentage: (this.business as any).default_special_order_deposit_percentage || 30 });
    this.showDepositSettingsModal = true;
  }

  closeDepositSettingsModal(): void { this.showDepositSettingsModal = false; }

  async saveDepositSettings(): Promise<void> {
    if (!this.depositSettingsForm.valid || !this.business?.id) return;
    const percentage = this.depositSettingsForm.value.default_special_order_deposit_percentage;
    const confirmed = await this.confirmationService.confirm('Modifier le pourcentage d\'acompte ?', `Le pourcentage d'acompte par défaut sera de ${percentage}%.`, { confirmText: 'Oui, enregistrer', cancelText: 'Annuler', type: 'info' });
    if (!confirmed) return;
    this.depositSettingsLoading = true;
    this.businessService.updateBusiness(this.business.id, { default_special_order_deposit_percentage: percentage }).subscribe({
      next: (response: any) => { const b = response.data || response; localStorage.setItem('business', JSON.stringify(b)); this.business = b; this.depositSettingsLoading = false; this.closeDepositSettingsModal(); this.toastService.showSuccess('Paramètres acomptes mis à jour', `Acompte par défaut configuré à ${percentage}%`); },
      error: (error) => { this.depositSettingsLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour les paramètres'); }
    });
  }
  calculateExampleDeposit(totalAmount: number): number {
    const percentage = this.depositSettingsForm.get('default_special_order_deposit_percentage')?.value || 30;
    return Math.round((totalAmount * percentage) / 100);
  }
  openQuoteModal(order: any): void {
    this.selectedOrderForQuote = order;
    this.quoteLoading = false;
    this.quoteForm.reset({ quoted_amount: null, deposit_percentage: this.getDepositPercentage(), transport_fee: 0, quote_notes: '' });
    if (order.quoted_amount && order.quoted_amount > 0) {
      this.quoteForm.patchValue({ quoted_amount: order.quoted_amount, deposit_percentage: order.deposit_percentage || this.getDepositPercentage(), transport_fee: order.transport_fee || 0, quote_notes: order.quote_notes || '' });
    }
    this.showQuoteModal = true;
  }

  closeQuoteModal(): void { this.showQuoteModal = false; this.selectedOrderForQuote = null; this.quoteLoading = false; this.quoteForm.reset({ quoted_amount: null, deposit_percentage: 30, transport_fee: 0, quote_notes: '' }); }

  calculateQuoteTotals() {
    const quotedAmount = Number(this.quoteForm.get('quoted_amount')?.value || 0);
    const depositPercentage = Number(this.quoteForm.get('deposit_percentage')?.value || 30);
    const transportFee = Number(this.quoteForm.get('transport_fee')?.value || 0);
    const finalAmount = quotedAmount + transportFee;
    const depositAmount = Math.round(finalAmount * depositPercentage / 100);
    const balance = finalAmount - depositAmount;
    return { depositAmount, finalAmount, balance };
  }

  async sendQuote(): Promise<void> {
    this.quoteForm.markAllAsTouched();
    if (!this.selectedOrderForQuote?.id) return;
    const rawValue = this.quoteForm.get('quoted_amount')?.value;
    const quotedAmount = (rawValue !== null && rawValue !== '' && rawValue !== undefined) ? Number(rawValue) : 0;
    if (!quotedAmount || isNaN(quotedAmount) || quotedAmount < 1000) {
      this.toastService.showError('Montant invalide', 'Le montant de la prestation doit être d\'au moins 1 000 FCFA');
      this.quoteForm.get('quoted_amount')?.setErrors({ min: true });
      return;
    }
    if (this.quoteForm.invalid) return;
    const orderId = this.selectedOrderForQuote.id;
    const clientEmail = this.selectedOrderForQuote.client_email;
    const clientName = this.selectedOrderForQuote.client_name;
    const finalAmount = quotedAmount + Number(this.quoteForm.value.transport_fee || 0);
    const confirmed = await this.confirmationService.confirm('Envoyer le devis ?', `Le devis de ${this.formatMontant(finalAmount)} FCFA sera envoyé à ${clientName} par email.`, { confirmText: 'Envoyer', cancelText: 'Annuler', type: 'info' });
    if (!confirmed) return;
    this.quoteLoading = true;
    const quoteData = { quoted_amount: quotedAmount, deposit_percentage: Number(this.quoteForm.value.deposit_percentage), transport_fee: Number(this.quoteForm.value.transport_fee || 0), quote_notes: String(this.quoteForm.value.quote_notes || '') };
    this.orderService.sendSpecialOrderQuote(orderId, quoteData).subscribe({
      next: () => { this.quoteLoading = false; this.closeQuoteModal(); this.loadSpecialOrders(); this.toastService.showSuccess('✅ Devis envoyé !', `Email envoyé à ${clientEmail}`); },
      error: (error: any) => { this.quoteLoading = false; this.toastService.showError('Erreur envoi devis', error.error?.error || error.error?.message || 'Impossible d\'envoyer le devis'); }
    });
  }

  formatMontant(n: any): string { return Math.round(Number(n || 0)).toLocaleString('fr-FR'); }
  getDepositPercentage(): number { return (this.business as any)?.default_special_order_deposit_percentage ?? 30; }
  onPaymentAccountStatusChange(status: string): void { this.paymentAccountStatus = status; }

  get hasCoordinates(): boolean {
    return !!(this.business as any)?.latitude && !!(this.business as any)?.longitude;
  }

  // ✅ Géocodage depuis l'adresse (OpenStreetMap, sans clé API)
  geocodeMyAddress(): void {
    const address = this.business?.address;
    if (!address?.trim()) {
      this.toastService.showWarning('Adresse manquante', 'Renseignez d\'abord votre adresse dans "Mon Profil"');
      return;
    }
    this.geocodingLoading = true;
    const query = encodeURIComponent(`${address}, Lomé, Togo`);
    this.http.get<any[]>(
      `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=tg`,
      { headers: { 'Accept-Language': 'fr' } }
    ).subscribe({
      next: (results) => {
        this.geocodingLoading = false;
        if (results?.length > 0) {
          this.locationForm.latitude  = parseFloat(results[0].lat).toFixed(6);
          this.locationForm.longitude = parseFloat(results[0].lon).toFixed(6);
          this.toastService.showSuccess('Coordonnées trouvées', 'Vérifiez et enregistrez');
        } else {
          this.toastService.showWarning('Introuvable', 'Entrez les coordonnées manuellement');
        }
      },
      error: () => {
        this.geocodingLoading = false;
        this.toastService.showError('Erreur', 'Impossible de géocoder');
      }
    });
  }

  // ✅ Utiliser la position GPS actuelle du navigateur
  useMyCurrentPosition(): void {
    if (!navigator.geolocation) {
      this.toastService.showError('Non supporté', 'Votre navigateur ne supporte pas la géolocalisation');
      return;
    }
    this.gettingPosition = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.gettingPosition = false;
        this.locationForm.latitude  = pos.coords.latitude.toFixed(6);
        this.locationForm.longitude = pos.coords.longitude.toFixed(6);
        this.toastService.showSuccess('Position obtenue', 'Vérifiez et enregistrez');
      },
      () => {
        this.gettingPosition = false;
        this.toastService.showError('Refusé', 'Autorisez la géolocalisation dans votre navigateur');
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // ✅ Sauvegarder la localisation
  saveLocation(): void {
    if (!this.business?.id) return;

    const lat = this.locationForm.latitude  ? parseFloat(String(this.locationForm.latitude))  : null;
    const lng = this.locationForm.longitude ? parseFloat(String(this.locationForm.longitude)) : null;
    const district = this.locationForm.district?.trim() || null;

    // ✅ Vérification avant envoi
    if (!lat && !lng && !district) {
      this.toastService.showWarning('Aucune donnée', 'Renseignez au moins les coordonnées ou le quartier');
      return;
    }

    if (lat && (isNaN(lat) || lat < -90  || lat > 90)) {
      this.toastService.showError('Latitude invalide', 'Doit être entre -90 et 90');
      return;
    }
    if (lng && (isNaN(lng) || lng < -180 || lng > 180)) {
      this.toastService.showError('Longitude invalide', 'Doit être entre -180 et 180');
      return;
    }

    // ✅ Ne pas envoyer de champs null — le backend rejette les updates vides
    const payload: any = {};
    if (lat  !== null && !isNaN(lat))  payload.latitude  = lat;
    if (lng  !== null && !isNaN(lng))  payload.longitude = lng;
    if (district)                       payload.district  = district;

    console.log('[saveLocation] payload envoyé:', payload);

    if (Object.keys(payload).length === 0) {
      this.toastService.showWarning('Aucune donnée valide', 'Renseignez les coordonnées');
      return;
    }

    this.locationLoading = true;
    this.businessService.updateBusiness(this.business.id, payload).subscribe({
      next: (response: any) => {
        this.locationLoading = false;
        const b = response.data || response;
        localStorage.setItem('business', JSON.stringify(b));
        this.business = b;
        this.toastService.showSuccess(
          'Localisation enregistrée',
          'Votre établissement apparaîtra dans les résultats de proximité'
        );
      },
      error: (err) => {
        this.locationLoading = false;
        console.error('[saveLocation] erreur:', err);
        this.toastService.showError('Erreur', err.error?.message || 'Impossible d\'enregistrer');
      }
    });
  }

}