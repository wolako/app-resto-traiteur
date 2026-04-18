import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';
import { BusinessService } from '../../core/services/business/business.service';
import { Business, LomeDistrict } from '../../core/models/business.model';
import { ChatService } from '../../core/services/chat/chat.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { SearchBarService, SearchBarState } from '../../core/services/search-bar/search-bar.service';
import { BusinessReviewsComponent } from '../../shared/components/business-reviews/business-reviews.component';
import { TestimonialsComponent } from '../../shared/components/testimonials/testimonials.component';
import { environment } from '../../../environments/environment';

declare var bootstrap: any;

// ── Types géolocalisation ─────────────────────────────────────
type GeoStatus =
  | 'idle'         // pas encore demandé
  | 'requesting'   // demande en cours
  | 'granted'      // position obtenue
  | 'denied'       // refusé → sélection manuelle
  | 'unavailable'  // API non disponible
  | 'error';       // autre erreur

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, BusinessReviewsComponent, TestimonialsComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent implements OnInit, OnDestroy {
  businesses: Business[] = [];
  filteredBusinesses: Business[] = [];
  loading = false;

  searchTerm = '';
  typeFilter = '';
  availabilityFilter = '';

  guestName = '';
  guestPhone = '';
  isLoadingGuestChat = false;
  selectedBusiness: Business | null = null;

  selectedBusinessForReviews: Business | null = null;
  showReviewsModal = false;

  readonly stars = [1, 2, 3, 4, 5];
  isScrolled = false;

  // ── Géolocalisation ───────────────────────────────────────
  geoStatus: GeoStatus = 'idle';
  userLat: number | null = null;
  userLng: number | null = null;
  selectedDistrict: string = '';
  geoRadius = 10; // km
  isGeoMode = false; // true = résultats filtrés par géo/district

  readonly districts: LomeDistrict[] = this.businessService.LOME_DISTRICTS;

  private searchBarSub?: Subscription;

  constructor(
    private businessService: BusinessService,
    private router: Router,
    private chatService: ChatService,
    private authService: AuthService,
    private toastService: ToastService,
    private searchBarService: SearchBarService
  ) {}

  ngOnInit(): void {
    const saved = this.searchBarService.getState();
    this.searchTerm         = saved.searchTerm;
    this.typeFilter         = saved.typeFilter;
    this.availabilityFilter = saved.availabilityFilter;

    // ✅ Demander la géolocalisation au chargement
    this.requestGeolocation();

    this.searchBarSub = this.searchBarService.state$.subscribe((state: SearchBarState) => {
      if (state.visible) {
        this.searchTerm         = state.searchTerm;
        this.typeFilter         = state.typeFilter;
        this.availabilityFilter = state.availabilityFilter;
        this.applyFilters();
      }
    });

    window.addEventListener('navbarSearchUpdate', this.onNavbarSearchUpdate);
  }

  ngOnDestroy(): void {
    this.searchBarService.updateFilters({
      searchTerm: this.searchTerm, typeFilter: this.typeFilter,
      availabilityFilter: this.availabilityFilter
    });
    this.searchBarSub?.unsubscribe();
    window.removeEventListener('navbarSearchUpdate', this.onNavbarSearchUpdate);
    this.searchBarService.setVisible(false);
  }

  // ── Géolocalisation ───────────────────────────────────────

  requestGeolocation(): void {
    if (!navigator.geolocation) {
      this.geoStatus = 'unavailable';
      this.loadBusinesses(); // fallback : tous les établissements
      return;
    }

    this.geoStatus = 'requesting';

    navigator.geolocation.getCurrentPosition(
      (position) => {
        this.userLat   = position.coords.latitude;
        this.userLng   = position.coords.longitude;
        this.geoStatus = 'granted';
        this.isGeoMode = true;
        this.loadNearbyBusinesses();
      },
      (error) => {
        console.warn('[Géolocalisation]', error.message);
        if (error.code === GeolocationPositionError.PERMISSION_DENIED) {
          this.geoStatus = 'denied';
        } else {
          this.geoStatus = 'error';
        }
        this.loadBusinesses(); // fallback : tous
      },
      {
        timeout: 8000,
        maximumAge: 5 * 60 * 1000, // cache 5 min
        enableHighAccuracy: false,
      }
    );
  }

  loadNearbyBusinesses(): void {
    if (this.userLat === null || this.userLng === null) return;
    this.loading = true;

    this.businessService.getBusinessesNearby(
      this.userLat, this.userLng, this.geoRadius,
      this.typeFilter || undefined
    ).subscribe({
      next: (response: any) => {
        const data = response.data || response;
        const nearby = Array.isArray(data) ? data.filter((b: Business) => b.is_active) : [];

        if (nearby.length === 0) {
          // ✅ Aucun établissement dans le rayon → fallback mais garder isGeoMode = true
          // pour afficher le bandeau avec option d'augmenter le rayon
          this.businesses = [];
          this.filteredBusinesses = [];
          this.loading = false;
          // Ne pas faire de fallback silencieux — laisser l'UI afficher "0 résultats"
          // L'utilisateur peut augmenter le rayon ou cliquer "Voir tout"
        } else {
          this.businesses = nearby;
          this.applyFilters();
          this.loading = false;
        }
      },
      error: () => {
        // Erreur réseau → fallback vers tous les établissements
        this.isGeoMode = false;
        this.loadBusinesses();
      }
    });
  }

  loadBusinessesByDistrict(district: string): void {
    this.loading = true;
    this.isGeoMode = true;

    this.businessService.getBusinessesByDistrict(district, this.typeFilter || undefined).subscribe({
      next: (response: any) => {
        const data = response.data || response;
        this.businesses = Array.isArray(data) ? data.filter((b: Business) => b.is_active) : [];
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.isGeoMode = false;
        this.loadBusinesses();
      }
    });
  }

  onDistrictChange(): void {
    if (!this.selectedDistrict) {
      this.isGeoMode = false;
      this.loadBusinesses();
      return;
    }
    this.loadBusinessesByDistrict(this.selectedDistrict);
  }

  resetGeoFilter(): void {
    this.isGeoMode = false;
    this.selectedDistrict = '';
    this.userLat = null;
    this.userLng = null;
    this.geoStatus = 'idle';
    this.loadBusinesses();
  }

  retryGeolocation(): void {
    this.geoStatus = 'idle';
    this.requestGeolocation();
  }

  // ── Chargement (tous) ─────────────────────────────────────
  loadBusinesses(): void {
    this.loading = true;
    this.businessService.getBusinesses().subscribe({
      next: (response: any) => {
        const data = response.data || response;
        this.businesses = Array.isArray(data) ? data.filter((b: Business) => b.is_active) : [];
        this.applyFilters();
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.businesses = [];
        this.filteredBusinesses = [];
        this.toastService.showError('Erreur de chargement', 'Impossible de charger les établissements.');
      }
    });
  }

  // ── Filtres ───────────────────────────────────────────────
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
    this.searchBarService.updateFilters({
      searchTerm: this.searchTerm, typeFilter: this.typeFilter,
      availabilityFilter: this.availabilityFilter
    });
  }

  // ── Images ────────────────────────────────────────────────
  private resolveImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('data:')) return url;

    // ✅ URL externe (http/https) — retourner telle quelle, pas de reconstruction
    if (url.startsWith('http')) {
      // Si c'est une ancienne URL ngrok stockée en base, on ne peut rien faire
      // Les URLs externes sont stockées telles quelles et affichées telles quelles
      return url;
    }

    // ✅ Chemin relatif (/uploads/...) — construire avec la base courante
    const base = environment.apiUrl.replace(/\/api$/, '');
    const absolute = `${base}${url}`;

    if (absolute.includes('ngrok')) {
      const sep = absolute.includes('?') ? '&' : '?';
      return `${absolute}${sep}ngrok-skip-browser-warning=true`;
    }
    return absolute;
  }

  getBusinessImage(business: any): string {
    const cover = business.cover_image_url;
    if (!cover) return this.getDefaultImage(business.type);

    // ✅ URL externe (https://...) — retourner telle quelle
    if (cover.startsWith('http')) return cover;

    // ✅ Chemin relatif (/uploads/...) — construire avec base courante
    const base = environment.apiUrl.replace(/\/api$/, '');
    const absolute = `${base}${cover}`;

    if (absolute.includes('ngrok')) {
      const sep = absolute.includes('?') ? '&' : '?';
      return `${absolute}${sep}ngrok-skip-browser-warning=true`;
    }
    return absolute;
  }

  getDefaultImage(type: string): string {
    return type === 'restaurant'
      ? 'assets/images/default-restaurant.jpg'
      : 'assets/images/default-traiteur.jpg';
  }

  onBusinessImageError(event: any, type: string): void {
    event.target.src = this.getDefaultImage(type);
  }

  // ── Distance formatée ─────────────────────────────────────
  formatDistance(km: number | undefined): string {
    if (km === undefined || km === null) return '';
    if (km < 1) return `${Math.round(km * 1000)} m`;
    return `${km.toFixed(1)} km`;
  }

  // ── Scroll ────────────────────────────────────────────────
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    const searchBarEl = document.querySelector('.filters-sticky-wrapper') as HTMLElement;
    if (!searchBarEl) return;
    const navbarH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--rt-navbar-h')) || 68;
    const rect = searchBarEl.getBoundingClientRect();
    const outOfView = rect.bottom <= navbarH;
    const currentlyVisible = this.searchBarService.getState().visible;
    if (outOfView !== currentlyVisible) {
      this.searchBarService.setVisible(outOfView);
      if (outOfView) {
        this.searchBarService.updateFilters({
          searchTerm: this.searchTerm, typeFilter: this.typeFilter,
          availabilityFilter: this.availabilityFilter
        });
      }
    }
    this.isScrolled = outOfView;
  }

  private onNavbarSearchUpdate = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    this.searchTerm         = detail.searchTerm         ?? this.searchTerm;
    this.typeFilter         = detail.typeFilter         ?? this.typeFilter;
    this.availabilityFilter = detail.availabilityFilter ?? this.availabilityFilter;
    this.applyFilters();
  };

  // ── Status établissements ─────────────────────────────────
  getBusinessStatus(business: Business): string {
    if (business.type === 'restaurant') return this.isRestaurantOpen(business) ? 'Ouvert' : 'Fermé';
    return business.is_available ? 'Disponible' : 'Indisponible';
  }
  getBusinessBadgeClass(business: Business): string {
    if (business.type === 'restaurant') return this.isRestaurantOpen(business) ? 'bg-success' : 'bg-danger';
    return business.is_available ? 'bg-success' : 'bg-warning';
  }
  getStatusIcon(business: Business): string {
    if (business.type === 'restaurant') return this.isRestaurantOpen(business) ? 'bi-check-circle-fill' : 'bi-x-circle-fill';
    return business.is_available ? 'bi-check-circle-fill' : 'bi-exclamation-circle-fill';
  }
  isRestaurantOpen(business: Business): boolean {
    if (business.type !== 'restaurant' || !business.opening_hour || !business.closing_hour) return false;
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const open  = this.timeToMinutes(business.opening_hour);
    const close = this.timeToMinutes(business.closing_hour);
    if (close < open) return cur >= open || cur <= close;
    return cur >= open && cur <= close;
  }
  private timeToMinutes(time: string): number {
    if (!time) return 0;
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
  }
  isCatererAvailable(business: Business): boolean {
    return business.type === 'traiteur' && business.is_available === true;
  }
  isBusinessAccessible(business: Business): boolean {
    return business.type === 'restaurant' ? this.isRestaurantOpen(business) : this.isCatererAvailable(business);
  }
  getStarArray(rating: number): { filled: boolean }[] {
    return this.stars.map(s => ({ filled: s <= Math.round(rating) }));
  }
  getRatingColorClass(rating: number): string {
    if (rating >= 4.5) return 'text-success';
    if (rating >= 3.5) return 'text-warning';
    if (rating >= 2)   return 'text-orange';
    return 'text-danger';
  }
  scrollToBusinesses(): void {
    const el = document.getElementById('businesses-section') ?? document.getElementById('businesses');
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  viewProfile(business: Business): void {
    if (!business.id) return;
    this.router.navigate([business.type === 'restaurant' ? '/profil/restaurant' : '/profil/traiteur', business.id]);
  }
  viewMenu(business: Business): void {
    if (!business.id) { this.toastService.showError('Erreur', 'Identifiant manquant'); return; }
    this.router.navigate(['/menu', business.id]);
  }
  makeReservation(business: Business): void {
    if (!this.isRestaurantOpen(business)) { this.toastService.showWarning('Restaurant fermé', 'Impossible de réserver en dehors des horaires.'); return; }
    sessionStorage.setItem('reservation_restaurant', JSON.stringify(business));
    this.router.navigate(['/reservation']);
  }
  makeSpecialOrder(business: Business): void {
    if (!business.is_available) { this.toastService.showWarning('Traiteur indisponible', 'Ce traiteur ne prend pas de commandes.'); return; }
    sessionStorage.setItem('special_order_caterer', JSON.stringify(business));
    this.router.navigate(['/special-order', business.id]);
  }
  async startChat(business: Business): Promise<void> {
    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.selectedBusiness = business;
      const el = document.getElementById('guestChatModal');
      if (el) new bootstrap.Modal(el).show();
      return;
    }
    try {
      const guestInfo = { client_id: currentUser.id, client_name: `${currentUser.first_name} ${currentUser.last_name}`, client_phone: currentUser.phone || '', initiated_by: 'client' };
      const response = await firstValueFrom(this.chatService.getOrCreateConversation(business.id!, guestInfo));
      const token = this.authService.getToken();
      if (token) this.chatService.connectSocket(token);
      await this.chatService.waitForSocketReady();
      await this.chatService.joinConversation(response.conversation.id);
      const messages = await firstValueFrom(this.chatService.getMessages(response.conversation.id));
      this.chatService.setMessages(messages.messages || []);
      this.chatService.setActiveConversation(response.conversation);
      this.toastService.showSuccess('Chat ouvert', `Conversation avec ${business.name} prête !`);
    } catch { this.toastService.showError('Erreur', 'Impossible de démarrer la conversation.'); }
  }
  async startGuestChat(): Promise<void> {
    if (!this.guestName.trim() || !this.guestPhone.trim() || !this.selectedBusiness) return;
    this.isLoadingGuestChat = true;
    try {
      const response = await firstValueFrom(this.chatService.getOrCreateConversation(this.selectedBusiness.id!, { client_name: this.guestName, client_phone: this.guestPhone }));
      this.chatService.connectSocket(undefined, { guestName: this.guestName, guestPhone: this.guestPhone });
      await this.chatService.waitForSocketReady();
      await this.chatService.joinConversation(response.conversation.id);
      const messages = await firstValueFrom(this.chatService.getMessages(response.conversation.id));
      this.chatService.setMessages(messages.messages || []);
      this.chatService.setActiveConversation(response.conversation);
      this.toastService.showSuccess('Chat démarré', `Conversation avec ${this.selectedBusiness.name} prête !`);
    } catch (err: any) {
      this.toastService.showError('Erreur', err.error?.message || 'Impossible de démarrer la conversation.');
    } finally {
      this.isLoadingGuestChat = false;
      bootstrap.Modal.getInstance(document.getElementById('guestChatModal'))?.hide();
      this.guestName = ''; this.guestPhone = '';
    }
  }
  viewReviews(business: Business): void {
    this.selectedBusinessForReviews = business;
    this.showReviewsModal = true;
    setTimeout(() => {
      const el = document.getElementById('reviewsModal');
      if (el) {
        new bootstrap.Modal(el).show();
        el.addEventListener('hidden.bs.modal', () => this.closeReviewsModal(), { once: true });
      }
    }, 50);
  }
  closeReviewsModal(): void {
    this.showReviewsModal = false;
    this.selectedBusinessForReviews = null;
  }
}