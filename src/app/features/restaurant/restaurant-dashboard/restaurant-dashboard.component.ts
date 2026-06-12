import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Reservation } from '../../../core/models/reservation.model';
import { Order } from '../../../core/models/order.model';
import { Menu } from '../../../core/models/menu.model';
import { Business } from '../../../core/models/business.model';
import { User } from '../../../core/models/user.model';
import { AuthService } from '../../../core/services/auth/auth.service';
import { BusinessService } from '../../../core/services/business/business.service';
import { OrderService } from '../../../core/services/orders/order.service';
import { ReservationService } from '../../../core/services/reservations/reservation.service';
import { MenuItemsModalComponent } from '../../../shared/modal/menu-items-modal/menu-items-modal.component';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { NotificationService } from '../../../core/services/notification/notification.service';
import { Notification } from '../../../core/models/notification.model';
import { ReservationDetailsModalComponent } from '../../../shared/modal/reservation-details-modal/reservation-details-modal.component';
import { OrderDetailsModalComponent } from '../../../shared/modal/order-details-modal/order-details-modal.component';
import { SubscriptionManagementComponent } from '../../../shared/subscription-management/subscription-management.component';
import { CommissionsViewComponent } from '../../../shared/commissions-view/commissions-view.component';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';
import { Router } from '@angular/router';
import { SupportTicketComponent } from '../../../shared/components/support-ticket/support-ticket.component';
import { BrandingSettingComponent } from '../../../shared/components/branding-setting/branding-setting.component';
import { BusinessReviewsComponent } from '../../../shared/components/business-reviews/business-reviews.component';
import { SubmitTestimonialComponent } from '../../../shared/components/submit-testimonial/submit-testimonial.component';
import { PaymentService } from '../../../core/services/payments/payment.service';
import { BusinessAnalyticsComponent } from '../../../shared/components/business-analytics/business-analytics/business-analytics.component';
import { PaymentAccountComponent } from '../../../shared/components/payment-account/payment-account.component';
import { CoverImageSettingComponent } from '../../../shared/components/cover-image-setting/cover-image-setting.component';

import { Driver } from '../../../core/models/driver.model';
import { DriverService } from '../../../core/services/driver/driver.service';


interface SubscriptionLimits {
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_reservations_per_month: number | null;
  max_photos: number;
  current_menu_items: number;
  current_orders: number;
  current_reservations: number;
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
  selector: 'app-restaurant-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MenuItemsModalComponent,
    ReservationDetailsModalComponent,
    OrderDetailsModalComponent,
    SubscriptionManagementComponent,
    CommissionsViewComponent,
    SupportTicketComponent,
    BrandingSettingComponent,
    BusinessReviewsComponent,
    SubmitTestimonialComponent,
    BusinessAnalyticsComponent,
    PaymentAccountComponent,
    CoverImageSettingComponent,
  ],
  templateUrl: './restaurant-dashboard.component.html',
  styleUrl: './restaurant-dashboard.component.scss'
})
export class RestaurantDashboardComponent implements OnInit {
  activeTab = 'overview';
  business: Business | null = null;
  currentUser: User | null = null;
  orders: Order[] = [];
  filteredOrders: Order[] = [];
  reservations: Reservation[] = [];
  filteredReservations: Reservation[] = [];
  menus: Menu[] = [];

  orderStats = { total: 0, revenue: 0, netRevenue: 0, commissions: 0 };
  reservationStats = { total: 0 };
  notifications: Notification[] = [];
  unreadCount = 0;
  showNotifications = false;

  selectedReservation: Reservation | null = null;
  showReservationDetailsModal = false;
  selectedOrder: any = null;
  showOrderDetailsModal = false;
  loadingOrderUpdate = false;

  subscriptionLimits: SubscriptionLimits | null = null;
  revenueStats: RestaurantRevenueStats | null = null;

  Math = Math;
  mobileMoreOpen = false;

  profileForm!: FormGroup;
  businessForm!: FormGroup;
  hoursForm!: FormGroup;
  menuForm!: FormGroup;
  passwordForm!: FormGroup;

  orderFilter = '';
  reservationFilter = '';

  profileLoading = false;
  businessLoading = false;
  hoursLoading = false;
  menuLoading = false;
  passwordLoading = false;

  isOpen = false;
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

  isSandbox = environment.paymentMode === 'sandbox';
  paymentLoading = false;
  showPaymentModal = false;
  selectedOrderForPayment: any = null;
  paymentMethod = 'Mixx By Yas';

  depositSettingsForm!: FormGroup;
  depositSettingsLoading = false;
  showDepositSettingsModal = false;

  hasNewOrders = false;
  hasNewReservations = false;
  hasNewReviews = false;
  currentReviewsCount = 0;
  hasNewSupportResponse = false;

  analyticsAccess = false;

  paymentAccountStatus = 'not_configured';

  locationForm = { latitude: '', longitude: '', district: '' };
  locationLoading = false;
  geocodingLoading = false;
  gettingPosition = false;

  // ── Livreurs ────────────────────────────────────────────────
  drivers: Driver[] = [];
  showDriverModal  = false;
  editingDriver: Driver | null = null;
  driverLoading    = false;
  newDriverCredentials: any = null;
  driverForm: {
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    vehicle_type: 'moto' | 'velo' | 'voiture' | 'pied';
    max_concurrent_orders: number;
  } = {
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    vehicle_type: 'moto',
    max_concurrent_orders: 3
  };

  // ── Assignation livreur ─────────────────────────────────────
  showAssignModal   = false;
  orderToAssign:  any = null;
  selectedDriverId: number | null | undefined = null;
  assignLoading     = false;

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
    private reservationService: ReservationService,
    private notificationService: NotificationService,
    private http: HttpClient,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService,
    private paymentService: PaymentService,
    private driverService: DriverService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForms();
    this.currentUser = this.authService.getCurrentUser();
    this.business = this.authService.getBusiness();

    if (this.business) {
      this.populateForms();
      this.checkIfOpen();
      this.loadData();
      this.loadSubscriptionLimits();
      this.loadCommissionStats();
      this.loadRevenueStats();
      this.loadReviewsCount();
      this.loadSupportResponseCount();
      this.checkAnalyticsAccess();
    } else {
      console.error('No business found for this user');
    }

    this.loadNotifications();
    this.notificationService.unreadCount$.subscribe(count => { this.unreadCount = count; });
    this.notificationService.refreshUnreadCount();
  }

  private checkAnalyticsAccess(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/usage`).subscribe({
      next: (response) => {
        const featureFlag: boolean | undefined = response.features?.analytics_access;
        const planCode: string = (response.plan?.name || '').toLowerCase();
        const premiumPlans = ['premium', 'premium_yearly'];
        const isPremiumByPlan = premiumPlans.includes(planCode);
        if (featureFlag !== undefined && featureFlag !== null) {
          this.analyticsAccess = featureFlag === true;
        } else {
          this.analyticsAccess = isPremiumByPlan;
        }
      },
      error: () => { this.analyticsAccess = false; }
    });
  }

  private loadCommissionStats(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/commissions/business/${this.business.id}`).subscribe({
      next: (res) => {
        if (res.stats) {
          this.orderStats.commissions = (res.stats.total_collected || 0) + (res.stats.total_paid || 0);
        }
      },
      error: (err) => console.error('Erreur chargement stats commissions:', err)
    });
  }

  private loadRevenueStats(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/businesses/${this.business.id}/revenue-stats`).subscribe({
      next: (res) => {
        this.revenueStats = {
          total_received: Number(res.total_received || 0),
          total_commissions: Number(res.total_commissions || 0),
          total_orders_amount: Number(res.total_orders_amount || 0),
          transaction_count: Number(res.transaction_count || 0),
          this_month_received: Number(res.this_month_received || 0),
          this_month_commissions: Number(res.this_month_commissions || 0)
        };
      },
      error: (err) => console.error('Erreur chargement stats revenus:', err)
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
          max_reservations_per_month: limits.reservations_per_month ?? null,
          max_photos: limits.photos,
          current_menu_items: usage.menu_items || 0,
          current_orders: usage.orders_this_month || 0,
          current_reservations: usage.reservations_this_month || 0,
          current_photos: usage.photos || 0
        };
        this.checkLimitsAndAlert();
      },
      error: (err) => console.error('Erreur chargement limites:', err)
    });
  }

  checkLimitsAndAlert(): void {
    if (!this.subscriptionLimits) return;
    if (this.subscriptionLimits.max_reservations_per_month != null) {
      const pct = (this.subscriptionLimits.current_reservations / this.subscriptionLimits.max_reservations_per_month) * 100;
      if (pct >= 100) console.warn(`Limite de réservations mensuelle atteinte`);
      else if (pct >= 90) console.warn(`Approche limite réservations`);
    }
    if (this.subscriptionLimits.max_menu_items != null) {
      const pct = (this.subscriptionLimits.current_menu_items / this.subscriptionLimits.max_menu_items) * 100;
      if (pct >= 100) console.warn(`Limite d'articles de menu atteinte`);
      else if (pct >= 90) console.warn(`Approche limite articles menu`);
    }
  }

  canAddMenuItem(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_menu_items == null) return true;
    return this.subscriptionLimits.current_menu_items < this.subscriptionLimits.max_menu_items;
  }

  canAcceptReservation(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_reservations_per_month == null) return true;
    return this.subscriptionLimits.current_reservations < this.subscriptionLimits.max_reservations_per_month;
  }

  get hasCoordinates(): boolean {
    return !!(this.business as any)?.latitude && !!(this.business as any)?.longitude;
  }
  getLimitAlertMessage(type: 'menu_items' | 'reservations'): string | null {
    if (!this.subscriptionLimits) return null;
    if (type === 'menu_items' && this.subscriptionLimits.max_menu_items != null) {
      const pct = (this.subscriptionLimits.current_menu_items / this.subscriptionLimits.max_menu_items) * 100;
      if (pct >= 100) return `Limite d'articles de menu atteinte (${this.subscriptionLimits.max_menu_items}). Passez à un plan supérieur.`;
      if (pct >= 90) return `Attention : ${this.subscriptionLimits.current_menu_items}/${this.subscriptionLimits.max_menu_items} articles utilisés.`;
    }
    if (type === 'reservations' && this.subscriptionLimits.max_reservations_per_month != null) {
      const pct = (this.subscriptionLimits.current_reservations / this.subscriptionLimits.max_reservations_per_month) * 100;
      if (pct >= 100) return `Limite de réservations mensuelle atteinte (${this.subscriptionLimits.max_reservations_per_month}). Passez à un plan supérieur.`;
      if (pct >= 90) return `Attention : ${this.subscriptionLimits.current_reservations}/${this.subscriptionLimits.max_reservations_per_month} réservations ce mois.`;
    }
    return null;
  }

  navigateToSubscription(): void { this.activeTab = 'subscription'; }

  markOrdersAsSeen(): void { localStorage.setItem('seen_orders_count', String(this.orders.length)); this.hasNewOrders = false; }
  markReservationsAsSeen(): void { localStorage.setItem('seen_reservations_count', String(this.reservations.length)); this.hasNewReservations = false; }
  markReviewsAsSeen(): void { localStorage.setItem('seen_reviews_count', String(this.currentReviewsCount)); this.hasNewReviews = false; }

  loadSupportResponseCount(): void {
    if (!this.business?.id) return;
    this.http.get<any>(`${environment.apiUrl}/support/my-tickets`).subscribe({
      next: (response) => {
        const tickets = response.data || [];
        const resolvedCount = tickets.filter((t: any) => t.status === 'resolved' && t.response).length;
        if (localStorage.getItem('seen_support_resolved_count') === null) {
          localStorage.setItem('seen_support_resolved_count', String(resolvedCount));
        }
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
        if (localStorage.getItem('seen_reviews_count') === null) {
          localStorage.setItem('seen_reviews_count', String(total));
        }
        const seen = parseInt(localStorage.getItem('seen_reviews_count')!);
        this.hasNewReviews = total > seen;
      },
      error: () => {}
    });
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
      opening_hour: ['', Validators.required],
      closing_hour: ['', Validators.required]
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
    this.depositSettingsForm = this.fb.group({
      requires_reservation_deposit: [false],
      default_deposit_amount: [5000, [Validators.min(0)]]
    });
    
  }

  private passwordMatchValidator(g: FormGroup) {
    return g.get('newPassword')?.value === g.get('confirmPassword')?.value ? null : { 'mismatch': true };
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
      this.businessForm.patchValue({ name: this.business.name, description: this.business.description, address: this.business.address, phone: this.business.phone });
      this.hoursForm.patchValue({ opening_hour: this.business.opening_hour, closing_hour: this.business.closing_hour });
      this.depositSettingsForm.patchValue({
        requires_reservation_deposit: this.business.requires_reservation_deposit || false,
        default_deposit_amount: this.business.default_deposit_amount || 5000
      });
    }

    this.locationForm = {
      latitude:  (this.business as any)?.latitude  ? String((this.business as any).latitude)  : '',
      longitude: (this.business as any)?.longitude ? String((this.business as any).longitude) : '',
      district:  (this.business as any)?.district  || '',
    };
  }

  loadData(): void { this.loadOrders(); this.loadReservations(); this.loadMenus(); }

  checkIfOpen(): void {
    if (this.business?.opening_hour && this.business?.closing_hour) {
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      const openingMinutes = this.timeToMinutes(this.business.opening_hour);
      const closingMinutes = this.timeToMinutes(this.business.closing_hour);
      if (closingMinutes < openingMinutes) {
        this.isOpen = currentMinutes >= openingMinutes || currentMinutes <= closingMinutes;
      } else {
        this.isOpen = currentMinutes >= openingMinutes && currentMinutes <= closingMinutes;
      }
    }
  }

  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  }

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
          this.toastService.showSuccess('Profil mis à jour', 'Vos informations personnelles ont été mises à jour avec succès');
        },
        error: (error) => {
          this.profileLoading = false;
          this.toastService.showError('Erreur de mise à jour', error.error?.message || 'Impossible de mettre à jour votre profil');
        }
      });
    }
  }

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
          this.toastService.showSuccess('Informations mises à jour', 'Les informations de votre restaurant ont été mises à jour');
        },
        error: (error) => {
          this.businessLoading = false;
          this.toastService.showError('Erreur de mise à jour', error.error?.message || 'Impossible de mettre à jour les informations');
        }
      });
    }
  }

  updateHours(): void {
    if (this.hoursForm.valid && this.business?.id) {
      this.hoursLoading = true;
      const hoursData = {
        opening_hour: this.formatTimeToHHMM(this.hoursForm.value.opening_hour),
        closing_hour: this.formatTimeToHHMM(this.hoursForm.value.closing_hour)
      };
      this.businessService.updateHours(this.business.id, hoursData).subscribe({
        next: (response: any) => {
          const updatedBusiness = response.data || response;
          localStorage.setItem('business', JSON.stringify(updatedBusiness));
          this.business = updatedBusiness;
          this.hoursForm.patchValue({ opening_hour: updatedBusiness.opening_hour, closing_hour: updatedBusiness.closing_hour });
          this.hoursLoading = false;
          this.checkIfOpen();
          this.toastService.showSuccess('Horaires mis à jour', `Nouveaux horaires: ${updatedBusiness.opening_hour} - ${updatedBusiness.closing_hour}`);
        },
        error: (error) => {
          this.hoursLoading = false;
          this.toastService.showError('Erreur de mise à jour', error.error?.message || 'Impossible de mettre à jour les horaires');
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

  openPasswordModal(): void { this.passwordForm.reset(); this.showPasswordModal = true; }
  closePasswordModal(): void { this.showPasswordModal = false; this.passwordForm.reset(); }

  async changePassword(): Promise<void> {
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

  loadOrders(): void {
    if (this.business?.id) {
      this.orderService.getBusinessOrders(this.business.id).subscribe({
        next: (response: any) => {
          let ordersArray: any[] = [];
          if (Array.isArray(response)) ordersArray = response;
          else if (response && Array.isArray(response.data)) ordersArray = response.data;
          else if (response?.success !== undefined) ordersArray = response.data || [];
          this.orders = ordersArray;
          if (localStorage.getItem('seen_orders_count') === null) {
            localStorage.setItem('seen_orders_count', String(ordersArray.length));
          }
          const seenOrders = parseInt(localStorage.getItem('seen_orders_count')!);
          this.hasNewOrders = ordersArray.length > seenOrders;
          this.filterOrders();
          this.calculateOrderStats();
        },
        error: () => { this.orders = []; }
      });
    }
  }

  loadReservations(): void {
    if (this.business?.id) {
      this.reservationService.getRestaurantReservations(this.business.id).subscribe({
        next: (response: any) => {
          const newData = response.data || response || [];
          this.reservations = newData;
          if (localStorage.getItem('seen_reservations_count') === null) {
            localStorage.setItem('seen_reservations_count', String(newData.length));
          }
          const seenRes = parseInt(localStorage.getItem('seen_reservations_count')!);
          this.hasNewReservations = newData.length > seenRes;
          this.filterReservations();
          this.calculateReservationStats();
          this.loadSubscriptionLimits();
        },
        error: () => { this.reservations = []; }
      });
    }
  }

  loadMenus(): void {
    if (this.business?.id) {
      this.businessService.getBusinessMenus(this.business.id).subscribe({
        next: (response: any) => {
          this.menus = response.data || response || [];
          this.loadSubscriptionLimits();
        },
        error: () => { this.menus = []; }
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

  calculateReservationStats(): void {
    const today = new Date().toDateString();
    const todayReservations = this.reservations.filter(r => new Date(r.reservation_date).toDateString() === today);
    this.reservationStats = { total: todayReservations.length };
  }

  async showCreateMenuModal(): Promise<void> {
    if (!this.canAddMenuItem()) {
      const confirmed = await this.confirmationService.confirm("Limite d'articles atteinte", `Vous avez atteint la limite de ${this.subscriptionLimits?.max_menu_items} articles de menu. Pour en ajouter plus, passez à un plan supérieur.`, { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' });
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
        next: () => {
          this.menuLoading = false; this.closeMenuModal(); this.loadMenus();
          this.toastService.showSuccess(this.editingMenu ? 'Menu mis à jour' : 'Menu créé', `Le menu "${menuData.name}" a été ${this.editingMenu ? 'mis à jour' : 'créé'} avec succès`);
        },
        error: (error) => { this.menuLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de sauvegarder le menu'); }
      });
    }
  }

  editMenu(menu: Menu): void { this.editingMenu = menu; this.menuForm.patchValue({ name: menu.name, description: menu.description, is_active: menu.is_active }); this.showMenuModal = true; }

  async deleteMenu(menuId: number): Promise<void> {
    const menu = this.menus.find(m => m.id === menuId);
    const confirmed = await this.confirmationService.confirm('Supprimer le menu ?', `Êtes-vous sûr de vouloir supprimer le menu "${menu?.name}" ? Cette action est irréversible.`, { confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger' });
    if (!confirmed) return;
    this.businessService.deleteMenu(menuId).subscribe({
      next: () => { this.loadMenus(); this.toastService.showSuccess('Menu supprimé', 'Le menu a été supprimé avec succès'); },
      error: (error) => this.toastService.showError('Erreur de suppression', error.error?.message || 'Impossible de supprimer le menu')
    });
  }

  manageMenuItems(menu: Menu): void { this.selectedMenuForItems = menu; this.showItemsModal = true; }
  filterOrders(): void { this.filteredOrders = this.orderFilter ? this.orders.filter(o => o.status === this.orderFilter) : this.orders; }
  filterReservations(): void { this.filteredReservations = this.reservationFilter ? this.reservations.filter(r => r.status === this.reservationFilter) : this.reservations; }

  viewOrder(order: Order): void {
    this.orderService.getOrderDetails(order.id!).subscribe({
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
      next: () => {
        this.loadingOrderUpdate = false;
        if (this.selectedOrder?.id === event.orderId) this.selectedOrder = { ...this.selectedOrder, status: event.status };
        this.loadOrders();
        this.toastService.showSuccess('Statut mis à jour', `Commande mise à jour : ${this.getOrderStatusLabel(event.status)}`);
      },
      error: (error) => { this.loadingOrderUpdate = false; this.toastService.showError('Erreur de mise à jour', error.error?.message || 'Impossible de mettre à jour le statut'); }
    });
  }

  async updateOrderStatus(orderId: number, status: string): Promise<void> {
    const statusLabels: { [key: string]: string } = { 'confirmed': 'confirmer', 'preparing': 'mettre en préparation', 'ready': 'marquer comme prête', 'delivered': 'marquer comme livrée', 'cancelled': 'annuler' };
    const confirmed = await this.confirmationService.confirm('Changer le statut ?', `Voulez-vous ${statusLabels[status]} cette commande ?`, { confirmText: 'Oui', cancelText: 'Non', type: status === 'cancelled' ? 'danger' : 'info' });
    if (!confirmed) return;
    this.orderService.updateOrderStatus(orderId, status).subscribe({
      next: () => { this.loadOrders(); this.toastService.showSuccess('Statut mis à jour', `La commande a été mise à jour`); },
      error: (error) => { this.toastService.showError('Erreur de mise à jour', error.error?.message || 'Impossible de mettre à jour le statut'); }
    });
  }

  viewReservation(reservation: Reservation): void { this.selectedReservation = reservation; this.showReservationDetailsModal = true; }
  closeReservationDetailsModal(): void { this.showReservationDetailsModal = false; this.selectedReservation = null; }

  async updateReservationStatus(reservationId: number, status: string): Promise<void> {
    if (status === 'confirmed' && !this.canAcceptReservation()) {
      const confirmed = await this.confirmationService.confirm('Limite de réservations atteinte', `Vous avez atteint la limite de ${this.subscriptionLimits?.max_reservations_per_month} réservations mensuelles. Pour accepter plus de réservations, passez à un plan supérieur.`, { confirmText: 'Voir les plans', cancelText: 'Annuler', type: 'warning' });
      if (confirmed) this.navigateToSubscription();
      return;
    }
    const confirmed = await this.confirmationService.confirm('Changer le statut ?', `Voulez-vous ${status === 'confirmed' ? 'confirmer' : 'annuler'} cette réservation ?`, { confirmText: 'Oui', cancelText: 'Non', type: status === 'cancelled' ? 'danger' : 'success' });
    if (!confirmed) return;
    this.reservationService.updateReservationStatus(reservationId, status).subscribe({
      next: () => { this.loadReservations(); this.toastService.showSuccess('Statut mis à jour', `La réservation a été ${status === 'confirmed' ? 'confirmée' : 'annulée'}`); },
      error: (error) => this.toastService.showError('Erreur de mise à jour', error.error?.message || 'Impossible de mettre à jour le statut')
    });
  }

  getOrderStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', confirmed: 'bg-info', preparing: 'bg-primary', ready: 'bg-success', delivered: 'bg-secondary', cancelled: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getOrderStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée' }; return l[status] || status; }
  getOrderStatusActionLabel(status: string): string { const l: { [k: string]: string } = { confirmed: 'confirmer', preparing: 'mettre en préparation', ready: 'marquer comme prête', delivered: 'marquer comme livrée', cancelled: 'annuler' }; return l[status] || status; }
  getPaymentStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', paid: 'bg-success', failed: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getPaymentStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', paid: 'Payé', failed: 'Échec' }; return l[status] || status; }
  getReservationStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', confirmed: 'bg-success', cancelled: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getReservationStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' }; return l[status] || status; }

  closeItemsModal(): void { this.showItemsModal = false; this.selectedMenuForItems = null; }

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
    const confirmed = await this.confirmationService.confirm('Marquer tout comme lu ?', `Voulez-vous marquer toutes les ${this.unreadCount} notifications comme lues ?`, { confirmText: 'Oui, tout marquer', cancelText: 'Annuler' });
    if (!confirmed) return;
    this.notificationService.markAllAsRead().subscribe({
      next: () => { this.notifications.forEach(n => n.is_read = true); this.notificationService.refreshUnreadCount(); this.loadNotifications(); this.toastService.showSuccess('Notifications lues', 'Toutes vos notifications ont été marquées comme lues'); }
    });
  }

  getNotificationIcon(type: string): string { return this.notificationService.getNotificationIcon(type); }
  getNotificationClass(type: string): string { return this.notificationService.getNotificationClass(type); }

  openPaymentModal(order: any): void { this.selectedOrderForPayment = order; this.showPaymentModal = true; }
  closePaymentModal(): void { this.showPaymentModal = false; this.selectedOrderForPayment = null; this.paymentLoading = false; }

  payOrder(): void {
    if (!this.selectedOrderForPayment) return;
    this.paymentLoading = true;
    this.paymentService.initiatePayment({
      order_id: this.selectedOrderForPayment.id,
      amount: this.selectedOrderForPayment.total_amount,
      currency: 'XOF',
      payment_method: this.paymentMethod,
      customer_name: this.selectedOrderForPayment.client_name,
      customer_phone: this.selectedOrderForPayment.client_phone,
      customer_email: this.selectedOrderForPayment.client_email || ''
    } as any).subscribe({
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

  formatMontant(n: any): string { return Math.round(Number(n || 0)).toLocaleString('fr-FR'); }
  formatAmount(n: any): string { if (n == null || n === '') return '0 FCFA'; return Math.round(Number(n)).toLocaleString('fr-FR') + ' FCFA'; }

  openDepositSettingsModal(): void {
    if (this.business) {
      this.depositSettingsForm.patchValue({
        requires_reservation_deposit: this.business.requires_reservation_deposit || false,
        default_deposit_amount: this.business.default_deposit_amount || 5000
      });
    }
    this.showDepositSettingsModal = true;
  }

  closeDepositSettingsModal(): void { this.showDepositSettingsModal = false; this.depositSettingsForm.reset(); }

  async saveDepositSettings(): Promise<void> {
    if (!this.depositSettingsForm.valid || !this.business?.id) return;
    const requiresDeposit = this.depositSettingsForm.value.requires_reservation_deposit;
    if (requiresDeposit && !this.business.requires_reservation_deposit) {
      const confirmed = await this.confirmationService.confirm('Activer les acomptes ?', `Les clients devront payer ${this.depositSettingsForm.value.default_deposit_amount} FCFA pour réserver.`, { confirmText: 'Oui, activer', cancelText: 'Annuler', type: 'warning' });
      if (!confirmed) return;
    }
    if (!requiresDeposit && this.business.requires_reservation_deposit) {
      const confirmed = await this.confirmationService.confirm('Désactiver les acomptes ?', 'Les réservations ne demanderont plus d\'acompte.', { confirmText: 'Oui, désactiver', cancelText: 'Annuler', type: 'info' });
      if (!confirmed) return;
    }
    this.depositSettingsLoading = true;
    const depositData = { requires_reservation_deposit: requiresDeposit, default_deposit_amount: requiresDeposit ? this.depositSettingsForm.value.default_deposit_amount : null };
    this.businessService.updateBusiness(this.business.id, depositData).subscribe({
      next: (response: any) => {
        const updatedBusiness = response.data || response;
        localStorage.setItem('business', JSON.stringify(updatedBusiness));
        this.business = updatedBusiness;
        this.depositSettingsLoading = false; this.showDepositSettingsModal = false;
        this.toastService.showSuccess('Paramètres acomptes mis à jour', requiresDeposit ? `Acompte de ${depositData.default_deposit_amount} FCFA activé pour les réservations` : 'Acomptes désactivés pour les réservations');
      },
      error: (error) => { this.depositSettingsLoading = false; this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour les paramètres'); }
    });
  }

  async toggleDepositRequirement(): Promise<void> {
    if (!this.business?.id) return;
    const newStatus = !this.business.requires_reservation_deposit;
    const confirmed = await this.confirmationService.confirm(
      newStatus ? 'Activer les acomptes ?' : 'Désactiver les acomptes ?',
      newStatus ? `Les clients devront payer un acompte de ${this.business.default_deposit_amount || 5000} FCFA pour réserver.` : 'Les réservations ne demanderont plus d\'acompte.',
      { confirmText: newStatus ? 'Activer' : 'Désactiver', cancelText: 'Annuler', type: newStatus ? 'warning' : 'info' }
    );
    if (!confirmed) return;
    this.businessService.updateBusiness(this.business.id, { requires_reservation_deposit: newStatus }).subscribe({
      next: (response: any) => {
        const updatedBusiness = response.data || response;
        localStorage.setItem('business', JSON.stringify(updatedBusiness));
        this.business = updatedBusiness;
        this.toastService.showSuccess('Paramètres mis à jour', newStatus ? 'Acomptes activés' : 'Acomptes désactivés');
      },
      error: (error) => { this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour'); }
    });
  }

  async confirmCodPayment(orderId: number, clientName: string, amount: number): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Confirmer paiement reçu', `Avez-vous bien reçu ${this.formatMontant(amount)} FCFA en cash de ${clientName} ?`, { confirmText: 'Oui, paiement reçu', cancelText: 'Annuler', type: 'success' });
    if (!confirmed) return;
    this.http.post(`${environment.apiUrl}/orders/${orderId}/confirm-cod-payment`, { cod_amount: amount }).subscribe({
      next: (response: any) => { this.loadOrders(); this.loadCommissionStats(); this.loadRevenueStats(); this.toastService.showSuccess('Paiement confirmé', `${this.formatMontant(amount)} FCFA reçus de ${clientName}`); },
      error: (err) => { this.toastService.showError('Erreur', err.error?.error || 'Impossible de confirmer le paiement'); }
    });
  }

  onPaymentAccountStatusChange(status: string): void {
    this.paymentAccountStatus = status;
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

  // ══════════════════════════════════════════════════════════
  // GESTION LIVREURS
  // ══════════════════════════════════════════════════════════

  loadDrivers(): void {
    if (!this.business?.id) return;
    this.driverService.getBusinessDrivers(this.business.id).subscribe({
      next: (res) => { this.drivers = res.data || []; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les livreurs')
    });
  }

  vehicleLabel(type: string): string {
    const l: Record<string, string> = {
      moto: '🏍️ Moto', velo: '🚲 Vélo', voiture: '🚗 Voiture', pied: '🚶 À pied'
    };
    return l[type] || type;
  }

  openCreateDriverModal(): void {
    this.editingDriver = null;
    this.newDriverCredentials = null;
    this.driverForm = {
      first_name: '', last_name: '', phone: '', email: '',
      vehicle_type: 'moto', max_concurrent_orders: 3
    };
    this.showDriverModal = true;
  }

  editDriver(driver: Driver): void {
    this.editingDriver = driver;
    this.newDriverCredentials = null;
    this.driverForm = {
      first_name: driver.first_name,
      last_name:  driver.last_name,
      phone:      driver.phone,
      email:      driver.email || '',
      vehicle_type: driver.vehicle_type,
      max_concurrent_orders: driver.max_concurrent_orders
    };
    this.showDriverModal = true;
  }

  closeDriverModal(): void {
    this.showDriverModal = false;
    this.editingDriver   = null;
    this.newDriverCredentials = null;
  }

  saveDriver(): void {
    if (!this.driverForm.first_name || !this.driverForm.phone) {
      this.toastService.showError('Erreur', 'Prénom et téléphone sont requis');
      return;
    }
    this.driverLoading = true;

    if (this.editingDriver) {
      this.driverService.updateDriver(this.editingDriver.id!, {
        first_name: this.driverForm.first_name,
        last_name:  this.driverForm.last_name,
        vehicle_type: this.driverForm.vehicle_type,
        max_concurrent_orders: this.driverForm.max_concurrent_orders
      }).subscribe({
        next: () => {
          this.driverLoading = false;
          this.closeDriverModal();
          this.loadDrivers();
          this.toastService.showSuccess('Livreur mis à jour', '');
        },
        error: (err) => {
          this.driverLoading = false;
          this.toastService.showError('Erreur', err.error?.error || 'Impossible de modifier');
        }
      });
    } else {
      this.driverService.createDriver(this.driverForm).subscribe({
        next: (res) => {
          this.driverLoading = false;
          this.newDriverCredentials = res.credentials;
          this.loadDrivers();
          this.toastService.showSuccess(
            'Livreur créé',
            `Identifiants générés pour ${this.driverForm.first_name}`
          );
        },
        error: (err) => {
          this.driverLoading = false;
          this.toastService.showError('Erreur', err.error?.error || 'Impossible de créer');
        }
      });
    }
  }

  async confirmDeleteDriver(driver: Driver): Promise<void> {
    const ok = await this.confirmationService.confirm(
      'Désactiver le livreur ?',
      `Voulez-vous désactiver ${driver.first_name} ${driver.last_name} ?`,
      { confirmText: 'Désactiver', cancelText: 'Annuler', type: 'warning' }
    );
    if (!ok) return;
    this.driverService.deleteDriver(driver.id!).subscribe({
      next: () => { this.loadDrivers(); this.toastService.showSuccess('Livreur désactivé', ''); },
      error: () => this.toastService.showError('Erreur', 'Impossible de désactiver')
    });
  }

  // ══════════════════════════════════════════════════════════
  // ASSIGNATION LIVREUR
  // ══════════════════════════════════════════════════════════

  openAssignModal(order: any): void {
    this.orderToAssign    = order;
    this.selectedDriverId = null;
    this.showAssignModal  = true;
    this.loadDrivers();
  }

  closeAssignModal(): void {
    this.showAssignModal  = false;
    this.orderToAssign    = null;
    this.selectedDriverId = null;
  }

  confirmAssign(): void {
    if (!this.orderToAssign || !this.selectedDriverId) return;
    this.assignLoading = true;
    this.driverService.assignDriver(this.orderToAssign.id, this.selectedDriverId).subscribe({
      next: () => {
        this.assignLoading = false;
        const d = this.drivers.find(dr => dr.id === this.selectedDriverId);
        this.toastService.showSuccess(
          'Livreur assigné',
          `${d?.first_name} ${d?.last_name} prend en charge la commande #${this.orderToAssign?.id}`
        );
        this.closeAssignModal();
        this.loadOrders();
      },
      error: (err) => {
        this.assignLoading = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'assigner');
      }
    });
  }

}