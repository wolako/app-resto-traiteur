import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { BusinessService } from '../../core/services/business/business.service';
import { Business } from '../../core/models/business.model';
import { Menu } from '../../core/models/menu.model';
import { ChatService } from '../../core/services/chat/chat.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../core/services/confirmation-modal/confirmation-modal.service';
import { BusinessReviewsComponent } from '../../shared/components/business-reviews/business-reviews.component';
import { TestimonialsComponent } from '../../shared/components/testimonials/testimonials.component';

declare var bootstrap: any;

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    CommonModule, 
    RouterModule, 
    FormsModule, 
    BusinessReviewsComponent,
    TestimonialsComponent
  ],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit {
  businesses: Business[] = [];
  filteredBusinesses: Business[] = [];
  selectedMenus: Menu[] = [];
  selectedBusiness: Business | null = null;
  cart: any[] = [];

  loading = false;
  loadingMenu = false;

  searchTerm = '';
  typeFilter = '';
  availabilityFilter = '';

  // Variables pour le modal invité chat
  guestName = '';
  guestPhone = '';
  isLoadingGuestChat = false;

  // Pour le menu accordion
  activeMenuIndex: number = 0;

  // ✅ Modal avis
  selectedBusinessForReviews: Business | null = null;
  showReviewsModal = false;

  // ✅ NOUVEAU : Étoiles helper
  readonly stars = [1, 2, 3, 4, 5];

  constructor(
    private businessService: BusinessService,
    private router: Router,
    private chatService: ChatService,
    private authService: AuthService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadBusinesses();
  }

  loadBusinesses(): void {
    this.loading = true;
    this.businessService.getBusinesses().subscribe({
      next: (response: any) => {
        const businessesData = response.data || response;
        this.businesses = Array.isArray(businessesData)
          ? businessesData.filter((b: Business) => b.is_active)
          : [];
        this.applyFilters();
        this.loading = false;
      },
      error: (error) => {
        console.error('Error loading businesses:', error);
        this.loading = false;
        this.businesses = [];
        this.filteredBusinesses = [];
        this.toastService.showError('Erreur de chargement', 'Impossible de charger les établissements.');
      }
    });
  }

  applyFilters(): void {
    this.filteredBusinesses = this.businesses.filter(business => {
      const matchesSearch = !this.searchTerm ||
        business.name.toLowerCase().includes(this.searchTerm.toLowerCase());
      const matchesType = !this.typeFilter || business.type === this.typeFilter;
      let matchesAvailability = true;
      if (this.availabilityFilter === 'available') {
        matchesAvailability = this.isCatererAvailable(business);
      } else if (this.availabilityFilter === 'open') {
        matchesAvailability = this.isRestaurantOpen(business);
      }
      return matchesSearch && matchesType && matchesAvailability;
    });
  }

  // ── Status ───────────────────────────────────────────────────

  getBusinessStatus(business: Business): string {
    if (business.type === 'restaurant') {
      return this.isRestaurantOpen(business) ? 'Ouvert' : 'Fermé';
    }
    return business.is_available ? 'Disponible' : 'Indisponible';
  }

  getBusinessBadgeClass(business: Business): string {
    if (business.type === 'restaurant') {
      return this.isRestaurantOpen(business) ? 'bg-success' : 'bg-danger';
    }
    return business.is_available ? 'bg-success' : 'bg-warning';
  }

  getStatusIcon(business: Business): string {
    if (business.type === 'restaurant') {
      return this.isRestaurantOpen(business) ? 'bi-check-circle-fill' : 'bi-x-circle-fill';
    }
    return business.is_available ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill';
  }

  isRestaurantOpen(business: Business): boolean {
    if (business.type !== 'restaurant' || !business.opening_hour || !business.closing_hour) {
      return false;
    }
    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const openingMinutes = this.timeToMinutes(business.opening_hour);
    const closingMinutes = this.timeToMinutes(business.closing_hour);
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

  isCatererAvailable(business: Business): boolean {
    return business.type === 'traiteur' && business.is_available === true;
  }

  isBusinessAccessible(business: Business): boolean {
    return business.type === 'restaurant'
      ? this.isRestaurantOpen(business)
      : this.isCatererAvailable(business);
  }

  // ── Images ───────────────────────────────────────────────────

  getBusinessImage(business: any): string {
    return business.image_url || this.getDefaultImage(business.type);
  }

  getDefaultImage(type: string): string {
    return type === 'restaurant'
      ? 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80'
      : 'https://images.unsplash.com/photo-1555244162-803834f70033?w=800&q=80';
  }

  onBusinessImageError(event: any, type: string): void {
    event.target.src = this.getDefaultImage(type);
  }

  getItemImage(item: any): string {
    return item.image_url || this.getDefaultFoodImage(item.category);
  }

  getDefaultFoodImage(category?: string): string {
    const images: { [key: string]: string } = {
      'entree':         'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
      'plat':           'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=600&q=80',
      'dessert':        'https://images.unsplash.com/photo-1551024506-0bccd828d307?w=600&q=80',
      'boisson':        'https://images.unsplash.com/photo-1544145945-f90425340c7e?w=600&q=80',
      'accompagnement': 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600&q=80'
    };
    return (category && images[category]) || images['plat'];
  }

  onItemImageError(event: any, category?: string): void {
    event.target.src = this.getDefaultFoodImage(category);
  }

  // ── ✅ NOUVEAU : Helpers notation ────────────────────────────

  /**
   * Retourne un tableau [1..5] pour afficher les étoiles remplies/vides
   * d'une note donnée
   */
  getStarArray(rating: number): { filled: boolean }[] {
    return this.stars.map(s => ({ filled: s <= Math.round(rating) }));
  }

  /**
   * Classe CSS pour la couleur de la note
   */
  getRatingColorClass(rating: number): string {
    if (rating >= 4.5) return 'text-success';
    if (rating >= 3.5) return 'text-warning';
    if (rating >= 2)   return 'text-orange';
    return 'text-danger';
  }

  // ── Menu ─────────────────────────────────────────────────────

  toggleMenu(index: number): void {
    this.activeMenuIndex = this.activeMenuIndex === index ? -1 : index;
  }

  viewMenu(business: Business): void {
    this.selectedBusiness = business;
    this.loadingMenu = true;
    this.selectedMenus = [];
    this.cart = [];
    this.activeMenuIndex = 0;

    this.businessService.getBusinessMenus(business.id!).subscribe({
      next: (response: any) => {
        const menusData = response.data || response;
        this.selectedMenus = Array.isArray(menusData)
          ? menusData.filter((menu: Menu) => menu.is_active)
          : [];

        const menuPromises = this.selectedMenus.map(menu =>
          this.businessService.getMenuItems(menu.id!).toPromise()
        );

        Promise.all(menuPromises).then(itemsArrays => {
          itemsArrays.forEach((itemsResponse: any, index) => {
            const items = itemsResponse?.data || itemsResponse;
            if (items) {
              this.selectedMenus[index].items = Array.isArray(items) ? items : [];
            }
          });
          this.loadingMenu = false;

          const modalElement = document.getElementById('menuModal');
          if (modalElement) {
            new bootstrap.Modal(modalElement).show();
          }
        }).catch(() => {
          this.loadingMenu = false;
          this.toastService.showError('Erreur', 'Impossible de charger le menu');
        });
      },
      error: () => {
        this.loadingMenu = false;
        this.toastService.showError('Erreur', 'Impossible de charger les menus');
      }
    });
  }

  // ── Panier ───────────────────────────────────────────────────

  addToCart(item: any): void {
    const existingItem = this.cart.find(c => c.menu_item_id === item.id);
    const itemPrice = Number(item.price) || 0;

    if (existingItem) {
      existingItem.quantity += 1;
      existingItem.subtotal = existingItem.quantity * existingItem.unit_price;
    } else {
      this.cart.push({
        menu_item_id: item.id,
        quantity: 1,
        unit_price: itemPrice,
        subtotal: itemPrice,
        menu_item: { ...item, price: itemPrice }
      });
    }

    this.toastService.showSuccess('Article ajouté', `${item.name} ajouté au panier`);
  }

  getCartTotal(): number {
    return this.cart.reduce((total, item) => total + (Number(item.subtotal) || 0), 0);
  }

  async proceedToCheckout(): Promise<void> {
    if (!this.cart.length || !this.selectedBusiness) {
      this.toastService.showWarning('Panier vide', 'Ajoutez au moins un article');
      return;
    }
    sessionStorage.setItem('checkout_cart', JSON.stringify(this.cart));
    sessionStorage.setItem('checkout_business', JSON.stringify(this.selectedBusiness));

    const modalElement = document.getElementById('menuModal');
    if (modalElement) {
      bootstrap.Modal.getInstance(modalElement)?.hide();
    }
    this.router.navigate(['/checkout']);
  }

  // ── Réservation / Commande spéciale ──────────────────────────

  makeReservation(business: Business): void {
    if (!this.isRestaurantOpen(business)) {
      this.toastService.showWarning('Restaurant fermé', 'Impossible de réserver en dehors des horaires.');
      return;
    }
    sessionStorage.setItem('reservation_restaurant', JSON.stringify(business));
    this.router.navigate(['/reservation']);
  }

  makeSpecialOrder(business: Business): void {
    if (!business.is_available) {
      this.toastService.showWarning('Traiteur indisponible', 'Ce traiteur ne prend pas de commandes.');
      return;
    }
    sessionStorage.setItem('special_order_caterer', JSON.stringify(business));
    this.router.navigate(['/special-order', business.id]);
  }

  // ── Chat ─────────────────────────────────────────────────────

  async startChat(business: Business): Promise<void> {
    const currentUser = this.authService.getCurrentUser();

    if (!currentUser) {
      this.selectedBusiness = business;
      const modalElement = document.getElementById('guestChatModal');
      if (modalElement) new bootstrap.Modal(modalElement).show();
      return;
    }

    try {
      const guestInfo = {
        client_id:    currentUser.id,
        client_name:  `${currentUser.first_name} ${currentUser.last_name}`,
        client_phone: currentUser.phone || '',
        initiated_by: 'client'
      };

      const response = await firstValueFrom(
        this.chatService.getOrCreateConversation(business.id!, guestInfo)
      );

      const token = this.authService.getToken();
      if (token) this.chatService.connectSocket(token);

      await this.chatService.waitForSocketReady();
      await this.chatService.joinConversation(response.conversation.id);

      const messages = await firstValueFrom(
        this.chatService.getMessages(response.conversation.id)
      );

      this.chatService.setMessages(messages.messages || []);
      this.chatService.setActiveConversation(response.conversation);
      this.toastService.showSuccess('Chat ouvert', `Conversation avec ${business.name} prête !`);

    } catch (err: any) {
      this.toastService.showError('Erreur', 'Impossible de démarrer la conversation.');
    }
  }

  async startGuestChat(): Promise<void> {
    if (!this.guestName.trim() || !this.guestPhone.trim() || !this.selectedBusiness) return;

    this.isLoadingGuestChat = true;

    try {
      const response = await firstValueFrom(
        this.chatService.getOrCreateConversation(this.selectedBusiness.id!, {
          client_name:  this.guestName,
          client_phone: this.guestPhone
        })
      );

      this.chatService.connectSocket(undefined, {
        guestName:  this.guestName,
        guestPhone: this.guestPhone
      });

      await this.chatService.waitForSocketReady();
      await this.chatService.joinConversation(response.conversation.id);

      const messages = await firstValueFrom(
        this.chatService.getMessages(response.conversation.id)
      );

      this.chatService.setMessages(messages.messages || []);
      this.chatService.setActiveConversation(response.conversation);
      this.toastService.showSuccess('Chat démarré', `Conversation avec ${this.selectedBusiness.name} prête !`);

    } catch (err: any) {
      this.toastService.showError('Erreur', err.error?.message || 'Impossible de démarrer la conversation.');
    } finally {
      this.isLoadingGuestChat = false;
      bootstrap.Modal.getInstance(document.getElementById('guestChatModal'))?.hide();
      this.guestName = '';
      this.guestPhone = '';
    }
  }

  // ── ✅ Modal Avis ────────────────────────────────────────────

  viewReviews(business: Business): void {
    this.selectedBusinessForReviews = business;
    this.showReviewsModal = true;

    // Attendre que Angular ait rendu le composant avant d'ouvrir le modal
    setTimeout(() => {
      const modalElement = document.getElementById('reviewsModal');
      if (modalElement) {
        const modal = new bootstrap.Modal(modalElement);
        modal.show();

        // Nettoyer quand le modal se ferme
        modalElement.addEventListener('hidden.bs.modal', () => {
          this.closeReviewsModal();
        }, { once: true });
      }
    }, 50);
  }

  closeReviewsModal(): void {
    this.showReviewsModal = false;
    this.selectedBusinessForReviews = null;
  }
  

  // ── Helpers ──────────────────────────────────────────────────

  getCategoryLabel(category: string): string {
    const labels: { [key: string]: string } = {
      'entree':         'Entrée',
      'plat':           'Plat',
      'dessert':        'Dessert',
      'boisson':        'Boisson',
      'accompagnement': 'Accompagnement'
    };
    return labels[category] || category;
  }
}