import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TestimonialService } from '../../../core/services/testimonial/testimonial.service';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { TestimonialSubmission } from '../../../core/models/testimonial.model';

@Component({
  selector: 'app-submit-testimonial',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './submit-testimonial.component.html',
  styleUrls: ['./submit-testimonial.component.scss']
})
export class SubmitTestimonialComponent implements OnInit {
  testimonialForm!: FormGroup;
  currentUser: any;
  
  loading = false;
  checkingEligibility = true;
  
  // États
  isEligible = false;
  hasTestimonial = false;
  testimonial: any = null;
  
  // Messages d'éligibilité
  eligibilityMessage = '';
  accountAge = 0;
  deliveredOrders = 0;
  
  // Sélecteur de rating
  selectedRating = 0;
  hoveredRating = 0;
  
  constructor(
    private fb: FormBuilder,
    private testimonialService: TestimonialService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.initForm();
    this.checkEligibilityAndLoadTestimonial();
  }

  initForm(): void {
    this.testimonialForm = this.fb.group({
      rating: [0, [Validators.required, Validators.min(1), Validators.max(5)]],
      comment: ['', [
        Validators.required,
        Validators.minLength(50),
        Validators.maxLength(500)
      ]],
      displayName: [''],
      allowPhoto: [false]
    });
  }

  checkEligibilityAndLoadTestimonial(): void {
    this.checkingEligibility = true;
    
    // Charger le témoignage existant
    this.testimonialService.getMyTestimonial().subscribe({
      next: (response: any) => {
        if (response.hasTestimonial) {
          // L'utilisateur a déjà un témoignage
          this.hasTestimonial = true;
          this.testimonial = response.testimonial;
          this.isEligible = true;
          
          // Pré-remplir le formulaire si pending ou rejected
          if (this.testimonial.status === 'pending' || this.testimonial.status === 'rejected') {
            this.selectedRating = this.testimonial.rating;
            this.testimonialForm.patchValue({
              rating: this.testimonial.rating,
              comment: this.testimonial.comment,
              displayName: this.testimonial.display_name || '',
              allowPhoto: !!this.testimonial.display_photo
            });
          }
        } else {
          // Pas de témoignage, vérifier l'éligibilité
          this.hasTestimonial = false;
          this.checkEligibility();
        }
        
        this.checkingEligibility = false;
      },
      error: (error: any) => {
        console.error('Error loading testimonial:', error);
        this.checkingEligibility = false;
        this.hasTestimonial = false;
        this.checkEligibility();
      }
    });
  }

  checkEligibility(): void {
    this.testimonialService.checkEligibility().subscribe({
      next: (response: any) => {
        // ✅ La réponse peut être wrappée dans { success, eligible, ... }
        // ou directement { eligible, ... }
        const data = response.data || response;
        this.isEligible      = data.eligible === true;
        this.accountAge      = data.accountAge || 0;
        this.deliveredOrders = data.deliveredOrders || 0;

        if (!this.isEligible) {
          this.eligibilityMessage = data.message || 'Vous n\'êtes pas encore éligible';
        }
      },
      error: (error: any) => {
        console.error('Error checking eligibility:', error);
        // ✅ Si 400, extraire le message d'éligibilité plutôt que d'afficher une erreur générique
        const errData = error.error || {};
        this.isEligible = false;
        this.eligibilityMessage = errData.message || 'Erreur de vérification d\'éligibilité';
        this.accountAge      = errData.accountAge      || 0;
        this.deliveredOrders = errData.deliveredOrders || 0;
      }
    });
  }

  // ==========================================
  // GESTION DU RATING
  // ==========================================

  selectRating(rating: number): void {
    this.selectedRating = rating;
    this.testimonialForm.patchValue({ rating });
  }

  hoverRating(rating: number): void {
    this.hoveredRating = rating;
  }

  resetHover(): void {
    this.hoveredRating = 0;
  }

  getStarClass(star: number): string {
    const activeRating = this.hoveredRating || this.selectedRating;
    return star <= activeRating ? 'bi-star-fill text-warning' : 'bi-star text-muted';
  }

  // ==========================================
  // VALIDATION
  // ==========================================

  get comment() {
    return this.testimonialForm.get('comment');
  }

  get commentLength(): number {
    return this.comment?.value?.length || 0;
  }

  getCommentLengthClass(): string {
    if (this.commentLength < 50) return 'text-danger';
    if (this.commentLength > 450) return 'text-warning';
    return 'text-success';
  }

  // ==========================================
  // SOUMISSION
  // ==========================================

  submitTestimonial(): void {
  if (this.testimonialForm.invalid || this.selectedRating === 0) {
    this.testimonialForm.markAllAsTouched();
    this.toastService.showWarning('Formulaire incomplet', 'Veuillez remplir tous les champs requis');
    return;
  }

  this.loading = true;

  // ✅ Construire le display_name depuis le formulaire ou les infos user
  const displayNameValue = this.testimonialForm.value.displayName?.trim()
    || `${this.currentUser?.first_name || ''} ${(this.currentUser?.last_name || '').charAt(0)}.`.trim();

  const formData: TestimonialSubmission = {
    rating:      this.testimonialForm.value.rating,
    comment:     this.testimonialForm.value.comment,
    displayName: displayNameValue,
    display_name: displayNameValue,
    allowPhoto:  this.testimonialForm.value.allowPhoto || false,
    allow_photo: this.testimonialForm.value.allowPhoto || false,
  };

  if (this.hasTestimonial && (this.testimonial?.status === 'pending' || this.testimonial?.status === 'rejected')) {
    this.testimonialService.updateMyTestimonial(formData).subscribe({
      next: () => {
        this.loading = false;
        this.toastService.showSuccess('Témoignage mis à jour', 'En attente de validation');
        this.checkEligibilityAndLoadTestimonial();
      },
      error: (error: any) => {
        this.loading = false;
        this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour');
      }
    });
  } else {
    this.testimonialService.submitTestimonial(formData).subscribe({
      next: () => {
        this.loading = false;
        this.toastService.showSuccess('Témoignage soumis', 'En attente de validation');
        this.testimonialForm.reset();
        this.selectedRating = 0;
        this.checkEligibilityAndLoadTestimonial();
      },
      error: (error: any) => {
        this.loading = false;
        this.toastService.showError('Erreur', error.error?.message || 'Impossible de soumettre');
      }
    });
  }
}

  // ==========================================
  // HELPERS
  // ==========================================

  getStatusBadgeClass(status: string): string {
    const classes: { [key: string]: string } = {
      'pending': 'bg-warning',
      'approved': 'bg-success',
      'rejected': 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente de validation',
      'approved': 'Approuvé',
      'rejected': 'Rejeté'
    };
    return labels[status] || status;
  }

  canEdit(): boolean {
    return !this.hasTestimonial || 
           this.testimonial?.status === 'pending' || 
           this.testimonial?.status === 'rejected';
  }
}