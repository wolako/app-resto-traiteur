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

@Component({
  selector: 'app-restaurant-dashboard',
  standalone: true,
  imports: [
    CommonModule, 
    ReactiveFormsModule, 
    FormsModule, 
    MenuItemsModalComponent, 
    ReservationDetailsModalComponent,
    SubscriptionManagementComponent,
    CommissionsViewComponent,
    SupportTicketComponent,
    BrandingSettingComponent,
    BusinessReviewsComponent,
    SubmitTestimonialComponent
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
  // ✅ CORRIGÉ : Statistiques incluent maintenant les commissions
  orderStats = { total: 0, revenue: 0, commissions: 0 };
  reservationStats = { total: 0 };
  notifications: Notification[] = [];
  unreadCount = 0;
  showNotifications = false;
  selectedReservation: Reservation | null = null;
  showReservationDetailsModal = false;
  subscriptionLimits: SubscriptionLimits | null = null;

  Math = Math;
  
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
      // ✅ NOUVEAU : Charger les statistiques de commissions
      this.loadCommissionStats();
    } else {
      console.error('No business found for this user');
    }

    this.loadNotifications();
    
    this.notificationService.unreadCount$.subscribe(count => {
      this.unreadCount = count;
    });
  
    this.notificationService.refreshUnreadCount();
  }

  // ✅ NOUVEAU : Charger les statistiques de commissions
  private loadCommissionStats(): void {
    if (!this.business?.id) return;

    this.http.get<any>(`${environment.apiUrl}/commissions/business/${this.business.id}`)
      .subscribe({
        next: (res) => {
          if (res.stats) {
            // Mettre à jour les revenus avec les commissions collectées + payées
            this.orderStats.commissions = 
              (res.stats.total_collected || 0) + (res.stats.total_paid || 0);
          }
        },
        error: (err) => {
          console.error('Erreur chargement stats commissions:', err);
        }
      });
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
            max_reservations_per_month: limits.reservations_per_month,
            max_photos: limits.photos,
            current_menu_items: usage.menu_items || 0,
            current_orders: usage.orders_this_month || 0,
            current_reservations: usage.reservations_this_month || 0,
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

    if (this.subscriptionLimits.max_reservations_per_month !== null) {
      const reservationPercentage = (this.subscriptionLimits.current_reservations / this.subscriptionLimits.max_reservations_per_month) * 100;
      
      if (reservationPercentage >= 100) {
        console.warn(`❌ Limite de réservations mensuelle atteinte (${this.subscriptionLimits.max_reservations_per_month})`);
      } else if (reservationPercentage >= 90) {
        console.warn(`⚠️ Vous approchez de la limite de réservations (${this.subscriptionLimits.current_reservations}/${this.subscriptionLimits.max_reservations_per_month})`);
      }
    }

    if (this.subscriptionLimits.max_menu_items !== null) {
      const menuPercentage = (this.subscriptionLimits.current_menu_items / this.subscriptionLimits.max_menu_items) * 100;
      
      if (menuPercentage >= 100) {
        console.warn(`❌ Limite d'articles de menu atteinte (${this.subscriptionLimits.max_menu_items})`);
      } else if (menuPercentage >= 90) {
        console.warn(`⚠️ Vous approchez de la limite d'articles de menu (${this.subscriptionLimits.current_menu_items}/${this.subscriptionLimits.max_menu_items})`);
      }
    }
  }

  canAddMenuItem(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_menu_items === null) return true;
    return this.subscriptionLimits.current_menu_items < this.subscriptionLimits.max_menu_items;
  }

  canAcceptReservation(): boolean {
    if (!this.subscriptionLimits) return true;
    if (this.subscriptionLimits.max_reservations_per_month === null) return true;
    return this.subscriptionLimits.current_reservations < this.subscriptionLimits.max_reservations_per_month;
  }

  getLimitAlertMessage(type: 'menu_items' | 'reservations'): string | null {
    if (!this.subscriptionLimits) return null;

    if (type === 'menu_items' && this.subscriptionLimits.max_menu_items !== null) {
      const percentage = (this.subscriptionLimits.current_menu_items / this.subscriptionLimits.max_menu_items) * 100;
      
      if (percentage >= 100) {
        return `Limite d'articles de menu atteinte (${this.subscriptionLimits.max_menu_items}). Passez à un plan supérieur.`;
      } else if (percentage >= 90) {
        return `Attention : ${this.subscriptionLimits.current_menu_items}/${this.subscriptionLimits.max_menu_items} articles utilisés.`;
      }
    }

    if (type === 'reservations' && this.subscriptionLimits.max_reservations_per_month !== null) {
      const percentage = (this.subscriptionLimits.current_reservations / this.subscriptionLimits.max_reservations_per_month) * 100;
      
      if (percentage >= 100) {
        return `Limite de réservations mensuelle atteinte (${this.subscriptionLimits.max_reservations_per_month}). Passez à un plan supérieur.`;
      } else if (percentage >= 90) {
        return `Attention : ${this.subscriptionLimits.current_reservations}/${this.subscriptionLimits.max_reservations_per_month} réservations ce mois.`;
      }
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
        opening_hour: this.business.opening_hour,
        closing_hour: this.business.closing_hour
      });
    }
  }

  loadData(): void {
    this.loadOrders();
    this.loadReservations();
    this.loadMenus();
  }

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

      const profileData = {
        first_name: this.profileForm.value.first_name,
        last_name: this.profileForm.value.last_name,
        phone: this.profileForm.value.phone
      };

      this.http.put(`${environment.apiUrl}/auth/profile`, profileData)
        .subscribe({
          next: (response: any) => {
            const updatedUser = response.data?.user || response.user;
            localStorage.setItem('user', JSON.stringify(updatedUser));
            this.currentUser = updatedUser;
            this.profileLoading = false;
            this.toastService.showSuccess(
              'Profil mis à jour',
              'Vos informations personnelles ont été mises à jour avec succès'
            );
          },
          error: (error) => {
            console.error('Error updating profile:', error);
            this.profileLoading = false;
            this.toastService.showError(
              'Erreur de mise à jour',
              error.error?.message || 'Impossible de mettre à jour votre profil'
            );
          }
        });
    }
  }

  updateBusiness(): void {
    if (this.businessForm.valid && this.business?.id) {
      this.businessLoading = true;

      const businessData = {
        name: this.businessForm.value.name,
        description: this.businessForm.value.description,
        address: this.businessForm.value.address,
        phone: this.businessForm.value.phone
      };

      this.businessService.updateBusiness(this.business.id, businessData)
        .subscribe({
          next: (response: any) => {
            const updatedBusiness = response.data || response;
            localStorage.setItem('business', JSON.stringify(updatedBusiness));
            this.business = updatedBusiness;
            this.businessLoading = false;
            this.toastService.showSuccess(
              'Informations mises à jour',
              'Les informations de votre restaurant ont été mises à jour'
            );
          },
          error: (error) => {
            console.error('Error updating business:', error);
            this.businessLoading = false;
            this.toastService.showError(
              'Erreur de mise à jour',
              error.error?.message || 'Impossible de mettre à jour les informations'
            );
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
      
      this.businessService.updateHours(this.business.id, hoursData)
        .subscribe({
          next: (response: any) => {
            const updatedBusiness = response.data || response;
            localStorage.setItem('business', JSON.stringify(updatedBusiness));
            this.business = updatedBusiness;
            
            this.hoursForm.patchValue({
              opening_hour: updatedBusiness.opening_hour,
              closing_hour: updatedBusiness.closing_hour
            });
            
            this.hoursLoading = false;
            this.checkIfOpen();
            this.toastService.showSuccess(
              'Horaires mis à jour',
              `Nouveaux horaires: ${updatedBusiness.opening_hour} - ${updatedBusiness.closing_hour}`
            );
          },
          error: (error) => {
            console.error('Error updating hours:', error);
            this.hoursLoading = false;
            this.toastService.showError(
              'Erreur de mise à jour',
              error.error?.message || 'Impossible de mettre à jour les horaires'
            );
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

  async changePassword(): Promise<void> {
    if (this.passwordForm.valid) {
      this.passwordLoading = true;

      const passwordData = {
        currentPassword: this.passwordForm.value.currentPassword,
        newPassword: this.passwordForm.value.newPassword
      };

      this.http.put(`${environment.apiUrl}/auth/change-password`, passwordData)
        .subscribe({
          next: () => {
            this.passwordLoading = false;
            this.toastService.showSuccess(
              'Mot de passe modifié',
              'Votre mot de passe a été changé avec succès'
            );
            setTimeout(() => {
              this.closePasswordModal();
            }, 1500);
          },
          error: (error) => {
            console.error('Error changing password:', error);
            this.passwordLoading = false;
            this.toastService.showError(
              'Erreur',
              error.error?.message || 'Impossible de changer le mot de passe'
            );
          }
        });
    }
  }

  hasMinLength(): boolean {
    const password = this.passwordForm.get('newPassword')?.value;
    return password ? password.length >= 8 : false;
  }

  hasUpperCase(): boolean {
    const password = this.passwordForm.get('newPassword')?.value;
    return password ? /[A-Z]/.test(password) : false;
  }

  hasLowerCase(): boolean {
    const password = this.passwordForm.get('newPassword')?.value;
    return password ? /[a-z]/.test(password) : false;
  }

  hasNumber(): boolean {
    const password = this.passwordForm.get('newPassword')?.value;
    return password ? /[0-9]/.test(password) : false;
  }

  hasSpecialChar(): boolean {
    const password = this.passwordForm.get('newPassword')?.value;
    return password ? /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) : false;
  }

  loadOrders(): void {
    if (this.business?.id) {
      this.orderService.getBusinessOrders(this.business.id).subscribe({
        next: (response: any) => {
          let ordersArray: any[] = [];
          
          if (Array.isArray(response)) {
            ordersArray = response;
          } else if (response && Array.isArray(response.data)) {
            ordersArray = response.data;
          } else if (response && Array.isArray(response.orders)) {
            ordersArray = response.orders;
          } else if (response && response.success !== undefined) {
            ordersArray = response.data || [];
          } else {
            ordersArray = [];
          }
          
          this.orders = ordersArray;
          this.filterOrders();
          this.calculateOrderStats();
        },
        error: (error) => {
          console.error('Error loading orders:', error);
          this.orders = [];
        }
      });
    }
  }

  loadReservations(): void {
    if (this.business?.id) {
      this.reservationService.getRestaurantReservations(this.business.id).subscribe({
        next: (response: any) => {
          this.reservations = response.data || response || [];
          this.filterReservations();
          this.calculateReservationStats();
          this.loadSubscriptionLimits();
        },
        error: (error) => {
          console.error('Error loading reservations:', error);
          this.reservations = [];
        }
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
        error: (error) => {
          console.error('Error loading menus:', error);
          this.menus = [];
        }
      });
    }
  }

  // ✅ CORRIGÉ : Calcul basé sur total_amount (montant total des commandes)
  calculateOrderStats(): void {
    const today = new Date().toDateString();
    
    // Toutes les commandes du jour
    const todayOrders = this.orders.filter(o => 
      o.created_at && new Date(o.created_at).toDateString() === today
    );
    
    // ✅ NOUVEAU : Seulement les commandes PAYÉES du jour pour le revenue
    const paidTodayOrders = todayOrders.filter(o => o.payment_status === 'paid');
    
    this.orderStats = {
      total: todayOrders.length,  // Toutes les commandes
      revenue: paidTodayOrders.reduce((sum, order) => sum + Number(order.total_amount || 0), 0), // Seulement payées
      commissions: this.orderStats.commissions // Chargé séparément
    };
  }

  calculateReservationStats(): void {
    const today = new Date().toDateString();
    const todayReservations = this.reservations.filter(r => 
      new Date(r.reservation_date).toDateString() === today
    );
    this.reservationStats = {
      total: todayReservations.length
    };
  }

  async showCreateMenuModal(): Promise<void> {
    if (!this.canAddMenuItem()) {
      const confirmed = await this.confirmationService.confirm(
        'Limite d\'articles atteinte',
        `Vous avez atteint la limite de ${this.subscriptionLimits?.max_menu_items} articles de menu de votre plan actuel. Pour ajouter plus d'articles, vous devez passer à un plan supérieur.`,
        {
          confirmText: 'Voir les plans',
          cancelText: 'Annuler',
          type: 'warning'
        }
      );

      if (confirmed) {
        this.navigateToSubscription();
      }
      return;
    }

    this.editingMenu = null;
    this.menuForm.reset({
      name: '',
      description: '',
      is_active: true
    });
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
      const menuData = {
        ...this.menuForm.value,
        business_id: this.business.id
      };

      if (this.editingMenu && this.editingMenu.id) {
        this.businessService.updateMenu(this.editingMenu.id, menuData).subscribe({
          next: () => {
            this.menuLoading = false;
            this.closeMenuModal();
            this.loadMenus();
            this.toastService.showSuccess(
              'Menu mis à jour',
              `Le menu "${menuData.name}" a été mis à jour avec succès`
            );
          },
          error: (error) => {
            console.error('Error updating menu:', error);
            this.menuLoading = false;
            this.toastService.showError(
              'Erreur de mise à jour',
              error.error?.message || 'Impossible de mettre à jour le menu'
            );
          }
        });
      } else {
        this.businessService.createMenu(this.business.id, menuData).subscribe({
          next: () => {
            this.menuLoading = false;
            this.closeMenuModal();
            this.loadMenus();
            this.toastService.showSuccess(
              'Menu créé',
              `Le menu "${menuData.name}" a été créé avec succès`
            );
          },
          error: (error) => {
            console.error('Error creating menu:', error);
            this.menuLoading = false;
            this.toastService.showError(
              'Erreur de création',
              error.error?.message || 'Impossible de créer le menu'
            );
          }
        });
      }
    }
  }

  editMenu(menu: Menu): void {
    this.editingMenu = menu;
    this.menuForm.patchValue({
      name: menu.name,
      description: menu.description,
      is_active: menu.is_active
    });
    this.showMenuModal = true;
  }

  async deleteMenu(menuId: number): Promise<void> {
    const menu = this.menus.find(m => m.id === menuId);
    const confirmed = await this.confirmationService.confirm(
      'Supprimer le menu ?',
      `Êtes-vous sûr de vouloir supprimer le menu "${menu?.name}" ? Cette action est irréversible.`,
      {
        confirmText: 'Supprimer',
        cancelText: 'Annuler',
        type: 'danger'
      }
    );

    if (!confirmed) return;

    this.businessService.deleteMenu(menuId).subscribe({
      next: () => {
        this.loadMenus();
        this.toastService.showSuccess(
          'Menu supprimé',
          'Le menu a été supprimé avec succès'
        );
      },
      error: (error) => {
        console.error('Error deleting menu:', error);
        this.toastService.showError(
          'Erreur de suppression',
          error.error?.message || 'Impossible de supprimer le menu'
        );
      }
    });
  }

  manageMenuItems(menu: Menu): void {
    this.selectedMenuForItems = menu;
    this.showItemsModal = true;
  }

  filterOrders(): void {
    this.filteredOrders = this.orderFilter 
      ? this.orders.filter(o => o.status === this.orderFilter)
      : this.orders;
  }

  filterReservations(): void {
    this.filteredReservations = this.reservationFilter 
      ? this.reservations.filter(r => r.status === this.reservationFilter)
      : this.reservations;
  }

  async updateOrderStatus(orderId: number, status: string): Promise<void> {
    const statusLabels: { [key: string]: string } = {
      'confirmed': 'confirmer',
      'preparing': 'mettre en préparation',
      'ready': 'marquer comme prête',
      'delivered': 'marquer comme livrée',
      'cancelled': 'annuler'
    };

    const confirmed = await this.confirmationService.confirm(
      'Changer le statut ?',
      `Voulez-vous ${statusLabels[status]} cette commande ?`,
      {
        confirmText: 'Oui',
        cancelText: 'Non',
        type: status === 'cancelled' ? 'danger' : 'info'
      }
    );

    if (!confirmed) return;

    this.orderService.updateOrderStatus(orderId, status).subscribe({
      next: () => {
        this.loadOrders();
        this.toastService.showSuccess(
          'Statut mis à jour',
          `La commande a été ${statusLabels[status] === 'annuler' ? 'annulée' : statusLabels[status]}`
        );
      },
      error: (error) => {
        console.error('Error updating order status:', error);
        this.toastService.showError(
          'Erreur de mise à jour',
          error.error?.message || 'Impossible de mettre à jour le statut'
        );
      }
    });
  }

  async updateReservationStatus(reservationId: number, status: string): Promise<void> {
    if (status === 'confirmed' && !this.canAcceptReservation()) {
      const confirmed = await this.confirmationService.confirm(
        'Limite de réservations atteinte',
        `Vous avez atteint la limite de ${this.subscriptionLimits?.max_reservations_per_month} réservations mensuelles de votre plan actuel. Pour accepter plus de réservations, vous devez passer à un plan supérieur.`,
        {
          confirmText: 'Voir les plans',
          cancelText: 'Annuler',
          type: 'warning'
        }
      );

      if (confirmed) {
        this.navigateToSubscription();
      }
      return;
    }

    const confirmed = await this.confirmationService.confirm(
      'Changer le statut ?',
      `Voulez-vous ${status === 'confirmed' ? 'confirmer' : 'annuler'} cette réservation ?`,
      {
        confirmText: 'Oui',
        cancelText: 'Non',
        type: status === 'cancelled' ? 'danger' : 'success'
      }
    );

    if (!confirmed) return;

    this.reservationService.updateReservationStatus(reservationId, status).subscribe({
      next: () => {
        this.loadReservations();
        this.toastService.showSuccess(
          'Statut mis à jour',
          `La réservation a été ${status === 'confirmed' ? 'confirmée' : 'annulée'}`
        );
      },
      error: (error) => {
        console.error('Error updating reservation status:', error);
        this.toastService.showError(
          'Erreur de mise à jour',
          error.error?.message || 'Impossible de mettre à jour le statut'
        );
      }
    });
  }

  getOrderStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning',
      'confirmed': 'bg-info',
      'preparing': 'bg-primary',
      'ready': 'bg-success',
      'delivered': 'bg-secondary',
      'cancelled': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getOrderStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'confirmed': 'Confirmée',
      'preparing': 'En préparation',
      'ready': 'Prête',
      'delivered': 'Livrée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  getPaymentStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning',
      'paid': 'bg-success',
      'failed': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getPaymentStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'paid': 'Payé',
      'failed': 'Échec'
    };
    return labels[status] || status;
  }

  getReservationStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning',
      'confirmed': 'bg-success',
      'cancelled': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getReservationStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'confirmed': 'Confirmée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  viewOrder(order: Order): void {
    console.log('View order details', order);
    alert('Détails de la commande à venir !');
  }

  viewReservation(reservation: Reservation): void {
    console.log('View reservation details', reservation);
    this.selectedReservation = reservation;
    this.showReservationDetailsModal = true;
  }

  closeItemsModal(): void {
    this.showItemsModal = false;
    this.selectedMenuForItems = null;
  }

  loadNotifications(): void {
    this.notificationService.getNotifications({ limit: 10, unreadOnly: false })
      .subscribe({
        next: (response: any) => {
          this.notifications = response.data?.notifications || [];
          this.unreadCount = response.data?.unreadCount || 0;
        },
        error: (error) => {
          console.error('Error loading notifications:', error);
          this.toastService.showError(
            'Erreur',
            'Impossible de charger les notifications'
          );
        }
      });
  }

  toggleNotifications(): void {
    this.showNotifications = !this.showNotifications;
  }

  markNotificationAsRead(notification: Notification): void {
    if (!notification.is_read) {
      this.notificationService.markAsRead(notification.id)
        .subscribe({
          next: () => {
            notification.is_read = true;
            this.notificationService.refreshUnreadCount();
            this.loadNotifications();
          },
          error: (error) => {
            console.error('Error marking notification as read:', error);
          }
        });
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    if (this.unreadCount === 0) return;

    const confirmed = await this.confirmationService.confirm(
      'Marquer tout comme lu ?',
      `Voulez-vous marquer toutes les ${this.unreadCount} notifications comme lues ?`,
      {
        confirmText: 'Oui, tout marquer',
        cancelText: 'Annuler'
      }
    );

    if (!confirmed) return;

    this.notificationService.markAllAsRead()
      .subscribe({
        next: () => {
          this.notifications.forEach(n => n.is_read = true);
          this.notificationService.refreshUnreadCount();
          this.loadNotifications();
          this.toastService.showSuccess(
            'Notifications lues',
            'Toutes vos notifications ont été marquées comme lues'
          );
        },
        error: (error) => {
          console.error('Error marking all notifications as read:', error);
          this.toastService.showError(
            'Erreur',
            'Impossible de marquer les notifications comme lues'
          );
        }
      });
  }

  getNotificationIcon(type: string): string {
    return this.notificationService.getNotificationIcon(type);
  }

  getNotificationClass(type: string): string {
    return this.notificationService.getNotificationClass(type);
  }

  closeReservationDetailsModal(): void {
    this.showReservationDetailsModal = false;
    this.selectedReservation = null;
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

    const paymentData = {
      order_id:       this.selectedOrderForPayment.id,
      amount:         this.selectedOrderForPayment.total_amount,
      currency:       'XOF',
      payment_method: this.paymentMethod,
      customer_name:  this.selectedOrderForPayment.client_name,
      customer_phone: this.selectedOrderForPayment.client_phone,
      customer_email: this.selectedOrderForPayment.client_email || ''
    };

    this.paymentService.initiatePayment(paymentData as any).subscribe({
      next: (response: any) => {
        this.paymentLoading = false;

        if (response?.data?.sandbox) {
          this.closePaymentModal();
          this.toastService.showSuccess(
            '✅ Paiement sandbox accepté',
            `Commande #${this.selectedOrderForPayment?.id} payée (${this.formatMontant(this.selectedOrderForPayment?.total_amount)} FCFA). Reçu envoyé.`
          );
          this.loadOrders();
          // ✅ Recharger les stats de commissions après paiement
          this.loadCommissionStats();
        }
      },
      error: (err: any) => {
        this.paymentLoading = false;
        this.toastService.showError(
          'Erreur paiement',
          err.error?.message || 'Impossible de traiter le paiement'
        );
      }
    });
  }

  formatMontant(n: any): string {
    return Math.round(Number(n || 0)).toLocaleString('fr-FR');
  }
}