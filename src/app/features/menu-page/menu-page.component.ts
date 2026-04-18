import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { BusinessService } from '../../core/services/business/business.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { Business } from '../../core/models/business.model';
import { Menu } from '../../core/models/menu.model';
 
@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './menu-page.component.html',
  styleUrls: ['./menu-page.component.scss']
})
export class MenuPageComponent implements OnInit {
  business: Business | null = null;
  menus: Menu[] = [];
  cart: any[] = [];
 
  loading      = true;
  loadingMenus = false;
  navigating   = false;          // ✅ NOUVEAU — overlay de transition
  activeMenuIndex = 0;
 
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private businessService: BusinessService,
    private toastService: ToastService
  ) {}
 
  ngOnInit(): void {
    const businessId = this.route.snapshot.paramMap.get('id');
    if (businessId) {
      this.loadBusiness(Number(businessId));
    } else {
      this.toastService.showError('Erreur', 'Identifiant de l\'établissement manquant');
      this.router.navigate(['/']);
    }
  }
 
  loadBusiness(businessId: number): void {
    this.loading = true;
    this.businessService.getBusinessById(businessId).subscribe({
      next: (response: any) => {
        this.business = response.data || response;
        if (!this.business) {
          this.toastService.showError('Erreur', 'Établissement introuvable');
          this.router.navigate(['/']);
          return;
        }
        this.loadMenus(businessId);
      },
      error: () => {
        this.loading = false;
        this.toastService.showError('Erreur', 'Impossible de charger l\'établissement');
        this.router.navigate(['/']);
      }
    });
  }
 
  loadMenus(businessId: number): void {
    this.loadingMenus = true;
    this.businessService.getBusinessMenus(businessId).subscribe({
      next: (response: any) => {
        const menusData = response.data || response;
        this.menus = Array.isArray(menusData)
          ? menusData.filter((menu: Menu) => menu.is_active)
          : [];
 
        const menuPromises = this.menus.map(menu =>
          this.businessService.getMenuItems(menu.id!).toPromise()
        );
 
        Promise.all(menuPromises).then(itemsArrays => {
          itemsArrays.forEach((itemsResponse: any, index) => {
            const items = itemsResponse?.data || itemsResponse;
            if (items) this.menus[index].items = Array.isArray(items) ? items : [];
          });
          this.loading      = false;
          this.loadingMenus = false;
        }).catch(() => {
          this.loading      = false;
          this.loadingMenus = false;
          this.toastService.showError('Erreur', 'Impossible de charger les items du menu');
        });
      },
      error: () => {
        this.loading      = false;
        this.loadingMenus = false;
        this.toastService.showError('Erreur', 'Impossible de charger les menus');
      }
    });
  }
 
  toggleMenu(index: number): void {
    this.activeMenuIndex = this.activeMenuIndex === index ? -1 : index;
  }
 
  addToCart(item: any): void {
    const existing  = this.cart.find(c => c.menu_item_id === item.id);
    const itemPrice = Number(item.price) || 0;
    if (existing) {
      existing.quantity += 1;
      existing.subtotal  = existing.quantity * existing.unit_price;
    } else {
      this.cart.push({
        menu_item_id: item.id,
        quantity:     1,
        unit_price:   itemPrice,
        subtotal:     itemPrice,
        menu_item:    { ...item, price: itemPrice }
      });
    }
    this.toastService.showSuccess('Article ajouté', `${item.name} ajouté au panier`);
  }
 
  removeFromCart(item: any): void {
    const existing = this.cart.find(c => c.menu_item_id === item.id);
    if (existing) {
      if (existing.quantity > 1) {
        existing.quantity -= 1;
        existing.subtotal  = existing.quantity * existing.unit_price;
      } else {
        this.cart = this.cart.filter(c => c.menu_item_id !== item.id);
      }
    }
  }
 
  getCartItemQuantity(itemId: number): number {
    return this.cart.find(c => c.menu_item_id === itemId)?.quantity ?? 0;
  }
 
  getCartTotal(): number {
    return this.cart.reduce((t, i) => t + (Number(i.subtotal) || 0), 0);
  }
 
  getCartCount(): number {
    return this.cart.reduce((c, i) => c + i.quantity, 0);
  }
 
  // ✅ MODIFIÉ — transition fluide avec overlay
  proceedToCheckout(): void {
    if (!this.cart.length || !this.business) {
      this.toastService.showWarning('Panier vide', 'Ajoutez au moins un article');
      return;
    }
 
    this.navigating = true;   // affiche l'overlay immédiatement
 
    sessionStorage.setItem('checkout_cart',     JSON.stringify(this.cart));
    sessionStorage.setItem('checkout_business', JSON.stringify(this.business));
 
    setTimeout(() => {
      this.router.navigate(['/checkout']);
    }, 480);
  }
 
  goBack(): void {
    this.router.navigate(['/']);
  }
 
  clearCart(): void {
    this.cart = [];
    this.toastService.showInfo('Panier vidé', 'Tous les articles ont été retirés');
  }
 
  // ── Helpers images ───────────────────────────────────────────
  getBusinessImage(business: Business): string {
    return (business as any).image_url || this.getDefaultImage(business.type);
  }
 
  getDefaultImage(type: string): string {
    return type === 'restaurant'
      ? 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&q=80'
      : 'https://images.unsplash.com/photo-1555244162-803834f70033?w=800&q=80';
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
 
  getCategoryLabel(category: string): string {
    const labels: { [key: string]: string } = {
      'entree': 'Entrée', 'plat': 'Plat', 'dessert': 'Dessert',
      'boisson': 'Boisson', 'accompagnement': 'Accompagnement'
    };
    return labels[category] || category;
  }
 
  isRestaurantOpen(): boolean {
    if (!this.business || this.business.type !== 'restaurant') return false;
    if (!this.business.opening_hour || !this.business.closing_hour) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const op  = this.timeToMinutes(this.business.opening_hour);
    const cl  = this.timeToMinutes(this.business.closing_hour);
    return cl < op ? (cur >= op || cur <= cl) : (cur >= op && cur <= cl);
  }
 
  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
 
  getBusinessStatus(): string {
    if (!this.business) return '';
    if (this.business.type === 'restaurant') return this.isRestaurantOpen() ? 'Ouvert' : 'Fermé';
    return this.business.is_available ? 'Disponible' : 'Indisponible';
  }
 
  getBusinessBadgeClass(): string {
    if (!this.business) return '';
    if (this.business.type === 'restaurant') return this.isRestaurantOpen() ? 'bg-success' : 'bg-danger';
    return this.business.is_available ? 'bg-success' : 'bg-warning';
  }
}
 