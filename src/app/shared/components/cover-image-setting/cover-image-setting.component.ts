import { Component, OnInit, ElementRef, ViewChild, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-cover-image-setting',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cover-image-setting.component.html',
  styleUrl: './cover-image-setting.component.scss'
})
export class CoverImageSettingComponent implements OnInit {
  @ViewChild('coverFileInput') coverFileInput!: ElementRef<HTMLInputElement>;

  // ✅ Notifie le parent quand la cover change (pour recharger la liste si besoin)
  @Output() coverChanged = new EventEmitter<string | null>();

  coverPreview: string | null = null;
  initialLoading = true;
  uploading = false;
  uploadProgress = 0;
  saving = false;
  uploadError: string | null = null;

  showUrlInput = false;
  urlInput = '';
  urlPreviewSrc: string | null = null;
  urlPreviewValid = false;

  businessId: number | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    const b = this.authService.getBusiness();
    this.businessId = b?.id || null;
    this.loadCover();
  }

  // ── Chargement depuis l'API ─────────────────────────────────
  loadCover(): void {
    if (!this.businessId) {
      this.initialLoading = false;
      return;
    }
    this.http.get<any>(`${environment.apiUrl}/branding/${this.businessId}`).subscribe({
      next: (res) => {
        const coverUrl = res.data?.cover_image_url;
        this.coverPreview = coverUrl ? this.resolveUrl(coverUrl) : null;
        this.initialLoading = false;
      },
      error: () => {
        this.initialLoading = false;
      }
    });
  }

  // ── Sélection fichier ───────────────────────────────────────
  async onFileSelected(e: Event): Promise<void> {
    const file = (e.target as HTMLInputElement).files?.[0];
    // ✅ Reset input pour permettre re-sélection du même fichier
    (e.target as HTMLInputElement).value = '';

    if (!file) return;

    this.uploadError = null;

    // Validation type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      this.uploadError = 'Format invalide. JPG, PNG ou WEBP uniquement.';
      return;
    }

    // Validation taille
    if (file.size > 8 * 1024 * 1024) {
      this.uploadError = `Fichier trop lourd (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum 8 MB.`;
      return;
    }

    await this.uploadFile(file);
  }

  // ── Upload via fetch() natif ────────────────────────────────
  private async uploadFile(file: File): Promise<void> {
    this.uploading = true;
    this.uploadProgress = 0;
    this.uploadError = null;

    // Aperçu local immédiat
    const localPreview = await this.readFileAsDataUrl(file);
    this.coverPreview = localPreview;

    const fd = new FormData();
    fd.append('cover', file, file.name);

    const token = this.getToken();
    const headers: Record<string, string> = {
      'ngrok-skip-browser-warning': 'true'
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    try {
      // Simulation de progression (fetch ne supporte pas nativement onprogress)
      const progressInterval = setInterval(() => {
        if (this.uploadProgress < 85) this.uploadProgress += 15;
      }, 200);

      const res = await fetch(`${environment.apiUrl}/branding/upload-cover`, {
        method: 'POST',
        headers,
        body: fd,
      });

      clearInterval(progressInterval);
      this.uploadProgress = 100;

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || `Erreur HTTP ${res.status}`);
      }

      // ✅ URL définitive depuis le serveur
      const serverUrl = data.data?.cover_image_url; // ex: /uploads/covers/cover-business-11-xxx.jpg
      if (!serverUrl) throw new Error('URL manquante dans la réponse serveur');

      // serverUrl est toujours un chemin relatif depuis le backend
      // On reconstruit avec environment.apiUrl courant (fonctionne en local ET ngrok)
      const base = environment.apiUrl.replace(/\/api$/, '');
      const absoluteUrl = serverUrl.startsWith('http') ? serverUrl : `${base}${serverUrl}`;
      this.coverPreview = absoluteUrl.includes('ngrok')
        ? absoluteUrl + (absoluteUrl.includes('?') ? '&' : '?') + 'ngrok-skip-browser-warning=true'
        : absoluteUrl;

      this.coverChanged.emit(serverUrl);
      this.toastService.showSuccess('Image enregistrée !', 'Visible sur la page d\'accueil');

    } catch (err: any) {
      this.uploadError = err.message || 'Impossible d\'uploader l\'image';
      this.coverPreview = null;
      this.coverChanged.emit(null);
    } finally {
      this.uploading = false;
      setTimeout(() => { this.uploadProgress = 0; }, 500);
    }
  }

  // ── Lecture fichier en base64 ───────────────────────────────
  private readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => resolve(e.target?.result as string);
      reader.onerror = () => reject(new Error('Impossible de lire le fichier'));
      reader.readAsDataURL(file);
    });
  }

  // ── Aperçu URL en temps réel ────────────────────────────────
  onUrlInput(): void {
    const url = this.urlInput.trim();
    this.urlPreviewValid = false;
    this.urlPreviewSrc = null;

    if (!url) return;

    try {
      const parsed = new URL(url);
      if (['http:', 'https:'].includes(parsed.protocol)) {
        this.urlPreviewSrc = url;
      }
    } catch {
      // URL invalide — pas d'aperçu
    }
  }

  // ── Appliquer URL ───────────────────────────────────────────
  applyUrl(): void {
    const url = this.urlInput.trim();

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        this.toastService.showError('URL invalide', 'L\'URL doit commencer par http:// ou https://');
        return;
      }
    } catch {
      this.toastService.showError('URL invalide', 'Entrez une URL valide');
      return;
    }

    this.saving = true;
    const headers = new HttpHeaders({ 'ngrok-skip-browser-warning': 'true' });

    // ✅ Envoyer l'URL COMPLÈTE (pas le pathname) — le backend la stocke telle quelle
    this.http.put(
      `${environment.apiUrl}/branding/cover-url`,
      { cover_image_url: url },  // URL externe complète conservée
      { headers }
    ).subscribe({
      next: () => {
        // ✅ Afficher l'URL externe directement — pas besoin de resolveUrl
        this.coverPreview = url;
        this.urlInput = '';
        this.urlPreviewSrc = null;
        this.urlPreviewValid = false;
        this.showUrlInput = false;
        this.saving = false;
        this.coverChanged.emit(url);
        this.toastService.showSuccess('Image enregistrée !', 'Visible sur la page d\'accueil');
      },
      error: (err) => {
        this.saving = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'enregistrer');
      }
    });
  }

  // ── Supprimer la cover ──────────────────────────────────────
  removeCover(): void {
    if (!confirm('Supprimer l\'image de la carte d\'accueil ?')) return;

    const headers = new HttpHeaders({ 'ngrok-skip-browser-warning': 'true' });
    this.http.put(
      `${environment.apiUrl}/branding/cover-url`,
      { cover_image_url: null },
      { headers }
    ).subscribe({
      next: () => {
        this.coverPreview = null;
        this.coverChanged.emit(null);
        this.toastService.showSuccess('Image supprimée', '');
      },
      error: () => this.toastService.showError('Erreur', 'Impossible de supprimer')
    });
  }

  // ── Erreur d'affichage de l'aperçu ─────────────────────────
  onPreviewError(): void {
    // L'image en base64 local est affichée mais l'URL ngrok peut être expirée
    // On recharge depuis l'API pour avoir l'URL fraîche
    this.loadCover();
  }

  // ── Helpers ─────────────────────────────────────────────────
  private getToken(): string {
    if (typeof (this.authService as any).getToken === 'function') {
      const t = (this.authService as any).getToken();
      if (t) return t;
    }
    for (const key of ['token', 'access_token', 'auth_token', 'jwt']) {
      const t = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (t) return t;
    }
    return '';
  }

  resolveUrl(url: string | null | undefined): string | null {
    if (!url) return null;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;

    // URL déjà absolue avec le bon hostname — retourner telle quelle + ngrok header si besoin
    if (url.startsWith('http')) {
      let abs = url;
      if (abs.includes('ngrok') && !abs.includes('ngrok-skip-browser-warning')) {
        abs += (abs.includes('?') ? '&' : '?') + 'ngrok-skip-browser-warning=true';
      }
      return abs;
    }

    // Chemin relatif (/uploads/...) — construire avec la base courante
    const base = environment.apiUrl.replace(/\/api$/, '');
    let abs = `${base}${url}`;
    if (abs.includes('ngrok') && !abs.includes('ngrok-skip-browser-warning')) {
      abs += (abs.includes('?') ? '&' : '?') + 'ngrok-skip-browser-warning=true';
    }
    return abs;
  }

}