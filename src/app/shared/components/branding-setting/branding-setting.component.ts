// shared/components/branding-setting/branding-setting.component.ts
import { CommonModule }                              from '@angular/common';
import { HttpClient, HttpHeaders }                   from '@angular/common/http';
import { Component, OnInit, ElementRef, ViewChild }  from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule } from '@angular/forms';
import { ToastService }  from '../../../core/services/toast/toast.service';
import { AuthService }   from '../../../core/services/auth/auth.service';
import { environment }   from '../../../../environments/environment';
import { BrandingHighlight } from '../../../core/models/business.model';

type Tab = 'colors' | 'logo' | 'banner' | 'gallery' | 'social' | 'highlights' | 'pratique';
export interface PaymentOption { value: string; label: string; icon: string; }

@Component({
  selector:    'app-branding-setting',
  standalone:  true,
  imports:     [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './branding-setting.component.html',
  styleUrl:    './branding-setting.component.scss',
})
export class BrandingSettingComponent implements OnInit {
  @ViewChild('logoFileInput')    logoFileInput!:    ElementRef<HTMLInputElement>;
  @ViewChild('bannerFileInput')  bannerFileInput!:  ElementRef<HTMLInputElement>;
  @ViewChild('galleryFileInput') galleryFileInput!: ElementRef<HTMLInputElement>;

  brandingForm: FormGroup;
  hasPremium = false; loading = false;
  businessId: number | null = null;
  activeTab: Tab = 'colors';

  uploadingLogo = false; uploadingBanner = false;
  uploadingGallery = false; uploadingCover = false;

  logoPreview:   string | null = null;
  bannerPreview: string | null = null;
  galleryUrls:   string[]      = [];

  galleryUrlInput = ''; logoUrlInput = ''; bannerUrlInput = '';
  showGalleryUrl = false; showLogoUrl = false; showBannerUrl = false; showCoverUrl = false;
  selectedPayments: string[] = [];

  readonly paymentOptions: PaymentOption[] = [
    { value: 'cash',        label: 'Espèces',       icon: 'bi-cash-coin' },
    { value: 'card',        label: 'Carte bancaire', icon: 'bi-credit-card-fill' },
    { value: 'mixx by yas', label: 'Mixx By Yas',   icon: 'bi-phone-fill' },
    { value: 'flooz',       label: 'Flooz',          icon: 'bi-phone-fill' },
    { value: 'wave',        label: 'Wave',           icon: 'bi-wallet2' },
  ];

  tabs: { key: Tab; label: string; icon: string }[] = [
    { key: 'colors',     label: 'Couleurs',   icon: 'bi-palette-fill'          },
    { key: 'logo',       label: 'Logo',       icon: 'bi-image-fill'            },
    { key: 'banner',     label: 'Bannière',   icon: 'bi-card-image'            },
    { key: 'gallery',    label: 'Galerie',    icon: 'bi-images'                },
    { key: 'social',     label: 'Réseaux',    icon: 'bi-share-fill'            },
    { key: 'highlights', label: 'Arguments',  icon: 'bi-award-fill'            },
    { key: 'pratique',   label: 'Pratique',   icon: 'bi-clipboard2-check-fill' },
  ];

  highlightIcons = [
    'bi-award','bi-clock','bi-geo-alt','bi-star','bi-heart','bi-truck',
    'bi-shield-check','bi-people','bi-fire','bi-leaf','bi-cup-hot',
    'bi-trophy','bi-lightning','bi-hand-thumbs-up',
  ];

  constructor(
    private fb:           FormBuilder,
    private http:         HttpClient,
    private toastService: ToastService,
    private authService:  AuthService,
  ) {
    this.brandingForm = this.fb.group({
      primary_color: ['#1a1a2e'], secondary_color: ['#6c757d'], accent_color: ['#e8a87c'],
      logo_url: [''], logo_square_url: [''],
      banner_url: [''], banner_mobile_url: [''],
      tagline: [''], opening_hours_text: [''],
      facebook_url: [''], instagram_url: [''], whatsapp_number: [''], tiktok_url: [''],
      highlight_1_icon: ['bi-award'], highlight_1_text: [''],
      highlight_2_icon: ['bi-clock'], highlight_2_text: [''],
      highlight_3_icon: ['bi-geo-alt'], highlight_3_text: [''],
      practical_note: [''],
    });
  }

  ngOnInit(): void {
    const b = this.authService.getBusiness();
    this.businessId = b?.id || null;
    this.checkPremium();
    this.loadBranding();
  }

  checkPremium(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/current`).subscribe({
      next:  s  => { this.hasPremium = s?.plan_code === 'premium' || s?.data?.plan_code === 'premium' || s?.custom_branding === true; },
      error: () => { this.hasPremium = false; },
    });
  }

  loadBranding(): void {
    if (!this.businessId) return;
    this.http.get<any>(`${environment.apiUrl}/branding/${this.businessId}`).subscribe({
      next: (res) => {
        const d = res.data; if (!d) return;
        const h: BrandingHighlight[] = Array.isArray(d.highlights) ? d.highlights : [];
        this.brandingForm.patchValue({
          primary_color: d.primary_color || '#1a1a2e', secondary_color: d.secondary_color || '#6c757d', accent_color: d.accent_color || '#e8a87c',
          logo_url: d.logo_url || '', logo_square_url: d.logo_square_url || '',
          banner_url: d.banner_url || '', banner_mobile_url: d.banner_mobile_url || '',
          tagline: d.tagline || '', opening_hours_text: d.opening_hours_text || '',
          facebook_url: d.facebook_url || '', instagram_url: d.instagram_url || '',
          whatsapp_number: d.whatsapp_number || '', tiktok_url: d.tiktok_url || '',
          highlight_1_icon: h[0]?.icon || 'bi-award', highlight_1_text: h[0]?.text || '',
          highlight_2_icon: h[1]?.icon || 'bi-clock', highlight_2_text: h[1]?.text || '',
          highlight_3_icon: h[2]?.icon || 'bi-geo-alt', highlight_3_text: h[2]?.text || '',
          practical_note: d.practical_note || d.footer_text || '',
        });
        this.selectedPayments = Array.isArray(d.payment_methods) ? d.payment_methods : [];
        if (d.logo_url)        this.logoPreview   = this.resolveUrl(d.logo_url);
        if (d.banner_url)      this.bannerPreview = this.resolveUrl(d.banner_url);
        this.galleryUrls = (Array.isArray(d.gallery_urls) ? d.gallery_urls : []).map((u: string) => this.resolveUrl(u) as string);
      },
      error: () => {},
    });
  }

  setTab(t: Tab): void { this.activeTab = t; }
  togglePayment(v: string): void {
    this.selectedPayments = this.selectedPayments.includes(v)
      ? this.selectedPayments.filter(p => p !== v)
      : [...this.selectedPayments, v];
  }
  isPaymentSelected(v: string): boolean { return this.selectedPayments.includes(v); }
  private getToken(): string {
    // 1. Si AuthService expose getToken() publiquement
    if (typeof (this.authService as any).getToken === 'function') {
      const t = (this.authService as any).getToken();
      if (t) return t;
    }
    // 2. Propriété token directe
    if ((this.authService as any).token) return (this.authService as any).token;
    // 3. Essayer les clés courantes dans localStorage / sessionStorage
    for (const storage of [localStorage, sessionStorage]) {
      for (const key of ['token', 'access_token', 'auth_token', 'jwt', 'jwt_token']) {
        const t = storage.getItem(key);
        if (t) return t;
      }
    }
    return '';
  }

  private async uploadFetch(
    file:       File,
    maxMB:      number,
    endpoint:   string,
    fieldName:  string,
    setLoading: (v: boolean) => void
  ): Promise<any> {
    const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'];
    if (!allowed.includes(file.type)) throw new Error('Format invalide. JPG, PNG, WEBP ou SVG uniquement.');
    if (file.size > maxMB * 1024 * 1024) throw new Error(`Fichier trop lourd. Maximum ${maxMB} MB.`);

    setLoading(true);
    const fd = new FormData();
    fd.append(fieldName, file, file.name);

    const token = this.getToken();
    const headers: Record<string, string> = { 'ngrok-skip-browser-warning': 'true' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // ✅ NE PAS ajouter Content-Type — fetch le définit automatiquement avec boundary

    try {
      const res = await fetch(`${environment.apiUrl}/branding/${endpoint}`, {
        method: 'POST', headers, body: fd,
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Erreur HTTP ${res.status}`);
      return data.data;
    } finally {
      setLoading(false);
    }
  }

  private previewLocal(file: File, cb: (url: string) => void): void {
    const r = new FileReader();
    r.onload = e => cb(e.target?.result as string);
    r.readAsDataURL(file);
  }

  // ─── Handlers de sélection ────────────────────────────────────
  async onLogoSelected(e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    this.previewLocal(f, url => { this.logoPreview = url; });
    try {
      const d = await this.uploadFetch(f, 5, 'upload-logo', 'logo', v => this.uploadingLogo = v);
      this.logoPreview = this.resolveUrl(d.logo_url);
      this.brandingForm.patchValue({ logo_url: d.logo_url });
      this.toastService.showSuccess('Logo uploadé !', '');
    } catch (err: any) {
      this.logoPreview = null;
      this.toastService.showError('Erreur logo', err.message || 'Impossible d\'uploader');
    }
  }

  async onBannerSelected(e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    this.previewLocal(f, url => { this.bannerPreview = url; });
    try {
      const d = await this.uploadFetch(f, 8, 'upload-banner', 'banner', v => this.uploadingBanner = v);
      const raw = d.banner_url || d.banner_mobile_url;
      this.bannerPreview = this.resolveUrl(raw);
      this.brandingForm.patchValue({ banner_url: raw });
      this.toastService.showSuccess('Bannière uploadée !', '');
    } catch (err: any) {
      this.bannerPreview = null;
      this.toastService.showError('Erreur bannière', err.message || 'Impossible d\'uploader');
    }
  }

  async onGallerySelected(e: Event): Promise<void> {
    const f = (e.target as HTMLInputElement).files?.[0]; if (!f) return;
    if (this.galleryUrls.length >= 10) { this.toastService.showWarning('Max atteint', 'Maximum 10 photos'); return; }
    this.previewLocal(f, url => { this.galleryUrls = [...this.galleryUrls, url]; });
    try {
      const d = await this.uploadFetch(f, 5, 'upload-gallery', 'photo', v => this.uploadingGallery = v);
      this.galleryUrls = [...this.galleryUrls.slice(0, -1), this.resolveUrl(d.photo_url) as string];
      this.toastService.showSuccess('Photo ajoutée !', '');
    } catch (err: any) {
      this.galleryUrls = this.galleryUrls.slice(0, -1);
      this.toastService.showError('Erreur galerie', err.message || 'Impossible d\'uploader');
    }
  }

  // ─── Ajout depuis URL ─────────────────────────────────────────

  addLogoFromUrl(): void {
    const url = this.logoUrlInput.trim();
    if (!this.isValidUrl(url)) { this.toastService.showError('URL invalide', ''); return; }
    this.logoPreview = url; this.brandingForm.patchValue({ logo_url: url });
    this.logoUrlInput = ''; this.showLogoUrl = false;
    this.toastService.showSuccess('Logo ajouté', '');
  }

  addBannerFromUrl(): void {
    const url = this.bannerUrlInput.trim();
    if (!this.isValidUrl(url)) { this.toastService.showError('URL invalide', ''); return; }
    this.bannerPreview = url; this.brandingForm.patchValue({ banner_url: url });
    this.bannerUrlInput = ''; this.showBannerUrl = false;
    this.toastService.showSuccess('Bannière ajoutée', '');
  }

  addGalleryFromUrl(): void {
    const url = this.galleryUrlInput.trim();
    if (!this.isValidUrl(url)) { this.toastService.showError('URL invalide', ''); return; }
    if (this.galleryUrls.length >= 10) { this.toastService.showWarning('Max atteint', ''); return; }
    this.galleryUrls = [...this.galleryUrls, url];
    this.galleryUrlInput = ''; this.showGalleryUrl = false;
    this.toastService.showSuccess('Photo ajoutée', '');
  }

  private isValidUrl(url: string): boolean {
    try { return ['http:', 'https:'].includes(new URL(url).protocol); } catch { return false; }
  }

  removeGalleryImage(i: number): void { this.galleryUrls = this.galleryUrls.filter((_, idx) => idx !== i); }
  removeLogo():   void { this.logoPreview   = null; this.brandingForm.patchValue({ logo_url:        '' }); }
  removeBanner(): void { this.bannerPreview = null; this.brandingForm.patchValue({ banner_url:      '' }); }

  get previewStyle() {
    const v = this.brandingForm.value;
    return { '--p': v.primary_color, '--s': v.secondary_color, '--a': v.accent_color };
  }

  resolveUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const base = environment.apiUrl.replace(/\/api$/, '');
    let abs = url.startsWith('http') ? url : `${base}${url}`;
    if (abs.includes('ngrok')) abs += (abs.includes('?') ? '&' : '?') + 'ngrok-skip-browser-warning=true';
    return abs;
  }

  private rawUrl(url: string | null | undefined): string {
    if (!url || url.startsWith('data:') || url.startsWith('blob:')) return '';
    try { return new URL(url).pathname; } catch { return url; }
  }

  saveBranding(): void {
    this.loading = true;
    const v = this.brandingForm.value;
    const highlights: BrandingHighlight[] = [
      { icon: v.highlight_1_icon || 'bi-award', text: v.highlight_1_text || '' },
      { icon: v.highlight_2_icon || 'bi-clock', text: v.highlight_2_text || '' },
      { icon: v.highlight_3_icon || 'bi-geo-alt', text: v.highlight_3_text || '' },
    ].filter(h => h.text.trim().length > 0);

    const { highlight_1_icon, highlight_1_text, highlight_2_icon, highlight_2_text,
            highlight_3_icon, highlight_3_text, ...rest } = v;

    const payload = {
      ...rest,
      logo_url:        this.rawUrl(rest.logo_url)   || rest.logo_url   || null,
      banner_url:      this.rawUrl(rest.banner_url) || rest.banner_url || null,
      // ✅ cover_image_url retiré — géré par CoverImageSettingComponent
      highlights,
      gallery_urls:    this.galleryUrls
        .map(u => this.rawUrl(u) || u)
        .filter(u => u && !u.startsWith('data:')),
      payment_methods: this.selectedPayments,
      footer_text:     v.practical_note || '',
    };

    const headers = new HttpHeaders({ 'ngrok-skip-browser-warning': 'true' });
    this.http.put(`${environment.apiUrl}/branding/${this.businessId}`, payload, { headers }).subscribe({
      next:  () => { this.loading = false; this.toastService.showSuccess('Branding enregistré !', ''); },
      error: (err) => {
        this.loading = false;
        if (err.error?.code === 'PREMIUM_REQUIRED')
          this.toastService.showWarning('Premium requis', 'Passez au plan Premium');
        else
          this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'enregistrer');
      },
    });
  }

  resetBranding(): void {
    if (!confirm('Réinitialiser tout le branding ?')) return;
    this.loading = true;
    this.http.delete(`${environment.apiUrl}/branding`).subscribe({
      next: () => {
        this.loading = false;
        this.galleryUrls = []; this.selectedPayments = [];
        this.brandingForm.reset({ primary_color: '#1a1a2e', secondary_color: '#6c757d', accent_color: '#e8a87c', highlight_1_icon: 'bi-award', highlight_2_icon: 'bi-clock', highlight_3_icon: 'bi-geo-alt' });
        this.toastService.showSuccess('Réinitialisé', '');
      },
      error: () => { this.loading = false; this.toastService.showError('Erreur', ''); },
    });
  }

  getPaymentLabel(v: string): string { return this.paymentOptions.find(p => p.value === v)?.label ?? v; }
  navigateToSubscription(): void {}
}