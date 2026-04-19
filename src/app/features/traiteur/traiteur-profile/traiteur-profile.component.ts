import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { BusinessService } from '../../../core/services/business/business.service';
import { AnalyticsService } from '../../../core/services/analytics/analytics.service';
import { BrandingHighlight, BusinessPublicProfile, PublicMenu, PublicMenuItem } from '../../../core/models/business.model';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-traiteur-profile',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './traiteur-profile.component.html',
  styleUrls: ['./traiteur-profile.component.scss'],
})
export class TraiteurProfileComponent implements OnInit, OnDestroy {

  profile: BusinessPublicProfile | null = null;
  loading = true;
  error: string | null = null;

  activeMenuId: number | null = null;
  activeCategory: string = 'all';

  galleryOpen = false;
  galleryIndex = 0;

  isScrolled = false;

  eventTypes = [
    { icon: 'bi-people-fill',        label: 'Mariages' },
    { icon: 'bi-building',           label: 'Événements corporate' },
    { icon: 'bi-balloon-heart-fill', label: 'Anniversaires' },
    { icon: 'bi-mortarboard-fill',   label: 'Cérémonies' },
    { icon: 'bi-cup-hot-fill',       label: 'Cocktails' },
    { icon: 'bi-house-heart-fill',   label: 'Réceptions privées' },
  ];

  private readonly PAYMENT_LABELS: Record<string, string> = {
    cash:   'Espèces',
    card:   'Carte bancaire',
    tmoney: 'T-Money',
    flooz:  'Flooz',
    wave:   'Wave',
  };

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private businessService: BusinessService,
    private analyticsService: AnalyticsService,
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = Number(params['id']);
      if (id) {
        this.loadProfile(id);
      } else {
        this.error = 'Profil introuvable';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    this.removeCustomStyles();
  }

  loadProfile(id: number): void {
    this.loading = true;
    this.error = null;

    this.businessService.getPublicProfile(id).subscribe({
      next: (profile) => {
        if (profile.type !== 'traiteur') {
          this.router.navigate(['/profil/restaurant', id], { replaceUrl: true });
          return;
        }

        this.profile = profile;
        this.loading = false;

        if (profile.menus?.length) {
          this.activeMenuId = profile.menus[0].id;
        }

        if (profile.branding) {
          this.applyBranding(profile.branding);
        }

        // ✅ Guard
        if (profile.id) {
          this.analyticsService.trackPageView(profile.id);
        }
      },
      error: () => {
        this.error = 'Ce profil est introuvable ou indisponible.';
        this.loading = false;
      },
    });
  }

  applyBranding(branding: any): void {
    const root = document.documentElement;
    if (branding.primary_color)   root.style.setProperty('--brand-primary',   branding.primary_color);
    if (branding.secondary_color) root.style.setProperty('--brand-secondary', branding.secondary_color);
    if (branding.accent_color)    root.style.setProperty('--brand-accent',    branding.accent_color);
  }

  removeCustomStyles(): void {
    const root = document.documentElement;
    root.style.removeProperty('--brand-primary');
    root.style.removeProperty('--brand-secondary');
    root.style.removeProperty('--brand-accent');
  }

  goToSpecialOrder(): void {
    if (!this.profile) return;

    if (this.profile.id) {
      this.analyticsService.trackOrderStarted(this.profile.id);
    }

    sessionStorage.setItem('special_order_caterer', JSON.stringify({
      id:                 this.profile.id,
      name:               this.profile.name,
      type:               this.profile.type,
      address:            this.profile.address,
      phone:              this.profile.phone,
      image_url:          this.profile.image_url,
      is_available:       this.profile.is_available,
      availability_start: this.profile.availability_start,
      availability_end:   this.profile.availability_end,
      default_special_order_deposit_percentage:
        this.profile.default_special_order_deposit_percentage,
    }));

    this.router.navigate(['/special-order', this.profile.id]);
  }
    
  goToMenu(): void {
    if (!this.profile?.id) return;
    this.analyticsService.trackMenuClick(this.profile.id, 0);
    this.router.navigate(['/menu', this.profile.id]);
  }

  goBack(): void {
    this.router.navigate(['/']);
  }

  openWhatsApp(): void {
    const number = this.profile?.branding?.whatsapp_number;
    if (number) {
      const msg = encodeURIComponent(`Bonjour, je souhaite obtenir des informations sur vos services traiteur.`);
      window.open(`https://wa.me/${number.replace(/\D/g, '')}?text=${msg}`, '_blank');
    }
  }

  setActiveMenu(menuId: number): void {
    this.activeMenuId = menuId;
    this.activeCategory = 'all';
    if (this.profile?.id) {
      this.analyticsService.trackMenuClick(this.profile.id, menuId);
    }
  }

  setActiveCategory(category: string): void {
    this.activeCategory = category;
  }

  // ✅ Tracker les clics sur les articles
  onItemClick(item: PublicMenuItem): void {
    if (!this.profile?.id) return;
    this.analyticsService.trackItemClick(
      this.profile.id,
      item.id,
      this.activeMenuId ?? undefined
    );
  }

  get activeMenu(): PublicMenu | null {
    return this.profile?.menus?.find(m => m.id === this.activeMenuId) ?? null;
  }

  get categories(): string[] {
    const items = this.activeMenu?.items ?? [];
    const cats = [...new Set(items.map(i => i.category).filter(Boolean))];
    return cats as string[];
  }

  get filteredItems(): PublicMenuItem[] {
    const items = this.activeMenu?.items?.filter(i => i.is_available) ?? [];
    if (this.activeCategory === 'all') return items;
    return items.filter(i => i.category === this.activeCategory);
  }

  get activeMenus(): PublicMenu[] {
    return this.profile?.menus ?? [];
  }

  get highlights(): BrandingHighlight[] {
    const h = this.profile?.branding?.highlights;
    return Array.isArray(h) ? h.filter(item => item.text?.trim()) : [];
  }

  get galleryUrls(): string[] {
    const urls = this.profile?.branding?.gallery_urls ?? [];
    return (Array.isArray(urls) ? urls : [])
      .map(u => this.resolveImageUrl(u) as string)
      .filter(Boolean);
  }

  openGallery(index: number): void {
    this.galleryIndex = index;
    this.galleryOpen = true;
    document.body.style.overflow = 'hidden';
  }

  closeGallery(): void {
    this.galleryOpen = false;
    document.body.style.overflow = '';
  }

  prevImage(): void {
    this.galleryIndex = (this.galleryIndex - 1 + this.galleryUrls.length) % this.galleryUrls.length;
  }

  nextImage(): void {
    this.galleryIndex = (this.galleryIndex + 1) % this.galleryUrls.length;
  }

  @HostListener('window:keydown', ['$event'])
  onKeydown(e: KeyboardEvent): void {
    if (!this.galleryOpen) return;
    if (e.key === 'ArrowLeft')  this.prevImage();
    if (e.key === 'ArrowRight') this.nextImage();
    if (e.key === 'Escape')     this.closeGallery();
  }

  get starsArray(): number[] { return [1, 2, 3, 4, 5]; }

  getRatingPercent(stars: number): number {
    const dist = this.profile?.rating_distribution;
    if (!dist) return 0;
    const total = this.profile?.reviews_count ?? 0;
    return total > 0 ? Math.round(((dist[stars] ?? 0) / total) * 100) : 0;
  }

  @HostListener('window:scroll')
  onScroll(): void {
    this.isScrolled = window.scrollY > 80;
  }

  private resolveImageUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('data:')) return url;

    const base = environment.apiUrl.replace(/\/api$/, '');
    const absolute = url.startsWith('http') ? url : `${base}${url}`;

    if (absolute.includes('ngrok')) {
      const sep = absolute.includes('?') ? '&' : '?';
      return `${absolute}${sep}ngrok-skip-browser-warning=true`;
    }
    return absolute;
  }

  getBannerImage(): string | null {
    const bannerUrl = this.profile?.branding?.banner_url;
    return bannerUrl ? this.resolveImageUrl(bannerUrl) : null;
  }

  // traiteur-profile.component.ts — ajouter/remplacer
  hasBannerImage(): boolean {
    const url = this.profile?.branding?.banner_url;
    return !!(url && url.trim().length > 0);
  }

  getBannerImageUrl(): string {
    const url = this.profile?.branding?.banner_url;
    if (!url || !url.trim()) return '';
    return this.resolveImageUrl(url) ?? '';
  }

  getBannerFallbackColor(): string {
    const color = this.profile?.branding?.primary_color;
    if (color && /^#[0-9A-Fa-f]{6}$/.test(color)) return color;
    return '#1a1a2e';
  }

  getLogoUrl(): string | null {
    return this.resolveImageUrl(this.profile?.branding?.logo_url);
  }

  getItemImage(item: PublicMenuItem): string {
    return this.resolveImageUrl(item.image_url) ?? 'assets/images/default-food.jpg';
  }

  formatHour(time: string | null | undefined): string {
    if (!time) return '--:--';
    return time.substring(0, 5);
  }

  formatPrice(price: number): string {
    return new Intl.NumberFormat('fr-TG', {
      style: 'currency', currency: 'XOF', maximumFractionDigits: 0
    }).format(price);
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  }

  isAvailable(): boolean {
    return this.profile?.is_available ?? false;
  }

  getStarFill(star: number): string {
    const rating = this.profile?.average_rating ?? 0;
    if (star <= Math.floor(rating)) return 'full';
    if (star === Math.ceil(rating) && rating % 1 >= 0.5) return 'half';
    return 'empty';
  }

  getCategoryLabel(cat: string): string {
    const labels: Record<string, string> = {
      starter:   'Entrées',
      main:      'Plats principaux',
      dessert:   'Desserts',
      drink:     'Boissons',
      side:      'Accompagnements',
      appetizer: 'Apéritifs',
      buffet:    'Buffet',
      formula:   'Formules',
    };
    return labels[cat] ?? cat;
  }

  get depositLabel(): string {
    const pct = this.profile?.default_special_order_deposit_percentage ?? 30;
    return `${pct}% d'acompte requis`;
  }

  getWhatsAppUrl(number: string | undefined): string {
    if (!number) return '#';
    return `https://wa.me/${number.replace(/\D/g, '')}`;
  }

  getPaymentLabel(value: string): string {
    return this.PAYMENT_LABELS[value] ?? value;
  }

  trackById(_: number, item: any): number { return item.id; }
}