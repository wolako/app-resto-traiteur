import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { ToastService } from '../../../core/services/toast/toast.service';
import { AuthService } from '../../../core/services/auth/auth.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-branding-setting',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './branding-setting.component.html',
  styleUrl: './branding-setting.component.scss'
})
export class BrandingSettingComponent implements OnInit {
  brandingForm: FormGroup;
  hasPremium = false;
  loading = false;
  businessId: number | null = null;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private toastService: ToastService,
    private authService: AuthService
  ) {
    this.brandingForm = this.fb.group({
      primary_color: ['#0d6efd'],
      secondary_color: ['#6c757d'],
      accent_color: ['#ffc107'],
      logo_url: [''],
      footer_text: ['']
    });
  }

  ngOnInit(): void {
    const business = this.authService.getBusiness();
    this.businessId = business?.id || null;
    
    this.checkPremium();
    this.loadBranding();
  }

  checkPremium(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/current`)
      .subscribe({
        next: (sub) => {
          this.hasPremium = sub?.custom_branding || false;
        },
        error: (err) => console.error('Erreur vérification Premium:', err)
      });
  }

  loadBranding(): void {
    if (!this.businessId) return;

    this.http.get<any>(`${environment.apiUrl}/branding/${this.businessId}`)
      .subscribe({
        next: (res) => {
          if (res.data) {
            this.brandingForm.patchValue({
              primary_color: res.data.primary_color || '#0d6efd',
              secondary_color: res.data.secondary_color || '#6c757d',
              accent_color: res.data.accent_color || '#ffc107',
              logo_url: res.data.logo_url || '',
              footer_text: res.data.footer_text || ''
            });
          }
        },
        error: (err) => console.error('Erreur chargement branding:', err)
      });
  }

  saveBranding(): void {
    this.loading = true;
    this.http.put(`${environment.apiUrl}/branding`, this.brandingForm.value)
      .subscribe({
        next: () => {
          this.loading = false;
          this.toastService.showSuccess('Branding enregistré', 'Vos modifications ont été sauvegardées');
        },
        error: (err) => {
          this.loading = false;
          this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'enregistrer');
        }
      });
  }

  resetBranding(): void {
    if (!confirm('Réinitialiser le branding aux valeurs par défaut ?')) return;

    this.loading = true;
    this.http.delete(`${environment.apiUrl}/branding`)
      .subscribe({
        next: () => {
          this.loading = false;
          this.brandingForm.patchValue({
            primary_color: '#0d6efd',
            secondary_color: '#6c757d',
            accent_color: '#ffc107',
            logo_url: '',
            footer_text: ''
          });
          this.toastService.showSuccess('Branding réinitialisé', 'Les valeurs par défaut ont été restaurées');
        },
        error: (err) => {
          this.loading = false;
          this.toastService.showError('Erreur', 'Impossible de réinitialiser');
        }
      });
  }

  navigateToSubscription(): void {
    // Cette méthode sera appelée par le parent via EventEmitter si besoin
    // Ou naviguer directement ici
  }
}
