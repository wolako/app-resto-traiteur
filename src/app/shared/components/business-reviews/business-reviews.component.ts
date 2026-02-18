// business-reviews.component.ts - VERSION GUEST SUPPORT

import { Component, Input, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../core/services/auth/auth.service';
import { Review, ReviewService, ReviewStats } from '../../../core/services/reviews/review.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-business-reviews',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './business-reviews.component.html',
  styleUrl: './business-reviews.component.scss'
})
export class BusinessReviewsComponent implements OnInit {
  @Input() businessId!: number;

  // ── Formulaires ─────────────────────────────────────────────
  reviewForm: FormGroup;       // client connecté
  guestReviewForm: FormGroup;  // invité

  // ── Données ─────────────────────────────────────────────────
  reviews: Review[]         = [];
  filteredReviews: Review[] = [];
  stats: ReviewStats | null = null;

  // ── État ────────────────────────────────────────────────────
  loading       = false;
  isLoggedIn    = false;
  isClient      = false;
  hasReviewed   = false;
  hoverRating   = 0;
  currentRating = 0;
  filterRating  = 0;

  // ── Mode d'affichage du formulaire ─────────────────────────
  // 'none' | 'client' | 'guest'
  formMode: 'none' | 'client' | 'guest' = 'none';

  constructor(
    private fb: FormBuilder,
    private reviewService: ReviewService,
    private authService: AuthService,
    private toastService: ToastService
  ) {
    // Formulaire client connecté
    this.reviewForm = this.fb.group({
      rating:  [0, [Validators.required, Validators.min(1), Validators.max(5)]],
      comment: ['', [Validators.maxLength(1000)]]
    });

    // Formulaire invité
    this.guestReviewForm = this.fb.group({
      guest_name:  ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      guest_phone: ['', [
        Validators.required,
        Validators.pattern(/^[+]?[\d\s\-]{8,15}$/)
      ]],
      rating:  [0, [Validators.required, Validators.min(1), Validators.max(5)]],
      comment: ['', [Validators.maxLength(1000)]]
    });
  }

  ngOnInit(): void {
    this.isLoggedIn = this.authService.isLoggedIn();
    const currentUser = this.authService.getCurrentUser();
    this.isClient = currentUser?.role === 'client';

    this.loadReviews();

    if (this.isLoggedIn && this.isClient) {
      this.checkIfUserReviewed();
      this.formMode = 'client';
    } else if (!this.isLoggedIn) {
      this.formMode = 'guest'; // Invité → formulaire invité directement
    }
    // restaurant/traiteur → formMode reste 'none'
  }

  // ── Chargement ──────────────────────────────────────────────

  loadReviews(): void {
    this.reviewService.getBusinessReviews(this.businessId).subscribe({
      next: (res) => {
        this.reviews         = res.data.reviews;
        this.filteredReviews = res.data.reviews;
        this.stats           = res.data.stats;
      },
      error: (err) => console.error('Erreur chargement avis:', err)
    });
  }

  checkIfUserReviewed(): void {
    this.reviewService.getMyReviews().subscribe({
      next: (res) => {
        this.hasReviewed = res.data.some(r => r.business_id === this.businessId);
      },
      error: () => { this.hasReviewed = false; }
    });
  }

  // ── Notation (partagée entre les deux formulaires) ──────────

  setRating(rating: number, form: 'client' | 'guest' = 'client'): void {
    this.currentRating = rating;
    if (form === 'client') {
      this.reviewForm.patchValue({ rating });
      this.reviewForm.get('rating')?.markAsTouched();
    } else {
      this.guestReviewForm.patchValue({ rating });
      this.guestReviewForm.get('rating')?.markAsTouched();
    }
  }

  getRatingLabel(rating: number): string {
    const labels: Record<number, string> = {
      1: 'Très mauvais', 2: 'Mauvais', 3: 'Moyen', 4: 'Bon', 5: 'Excellent'
    };
    return labels[rating] ?? '';
  }

  // ── Soumission CLIENT connecté ───────────────────────────────

  submitReview(): void {
    if (this.reviewForm.invalid) {
      this.reviewForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    this.reviewService.createReview({
      business_id: this.businessId,
      rating:  this.reviewForm.value.rating,
      comment: this.reviewForm.value.comment ?? ''
    }).subscribe({
      next: () => {
        this.toastService.showSuccess('Avis publié', 'Merci pour votre retour !');
        this.resetClientForm();
        this.loadReviews();
        this.hasReviewed = true;
        this.loading = false;
      },
      error: (err) => {
        this.toastService.showError('Erreur', err.error?.error ?? 'Impossible de publier l\'avis');
        this.loading = false;
      }
    });
  }

  // ── Soumission INVITÉ ────────────────────────────────────────

  submitGuestReview(): void {
    if (this.guestReviewForm.invalid) {
      this.guestReviewForm.markAllAsTouched();
      return;
    }
    this.loading = true;
    const val = this.guestReviewForm.value;
    this.reviewService.createGuestReview({
      business_id: this.businessId,
      rating:      val.rating,
      comment:     val.comment ?? '',
      guest_name:  val.guest_name,
      guest_phone: val.guest_phone
    }).subscribe({
      next: () => {
        this.toastService.showSuccess('Avis publié', 'Merci pour votre retour !');
        this.resetGuestForm();
        this.loadReviews();
        this.hasReviewed = true; // Masquer le formulaire après envoi
        this.loading = false;
      },
      error: (err) => {
        this.toastService.showError('Erreur', err.error?.error ?? 'Impossible de publier l\'avis');
        this.loading = false;
      }
    });
  }

  resetClientForm(): void {
    this.reviewForm.reset({ rating: 0, comment: '' });
    this.currentRating = 0;
    this.hoverRating   = 0;
  }

  resetGuestForm(): void {
    this.guestReviewForm.reset({ rating: 0, comment: '', guest_name: '', guest_phone: '' });
    this.currentRating = 0;
    this.hoverRating   = 0;
  }

  // ── Filtres ─────────────────────────────────────────────────

  setFilter(star: number): void {
    this.filterRating    = star;
    this.filteredReviews = star === 0
      ? this.reviews
      : this.reviews.filter(r => r.rating === star);
  }

  // ── Helpers ──────────────────────────────────────────────────

  getReviewerName(review: Review): string {
    if (review.is_guest) return review.guest_name ?? 'Invité';
    if (review.user_name) return review.user_name;
    const first = review.first_name ?? '';
    const last  = review.last_name  ?? '';
    return (first + ' ' + last).trim() || 'Utilisateur';
  }

  getStarCount(star: number): number {
    if (!this.stats) return 0;
    const s = this.stats as any;
    switch (star) {
      case 5: return s['five_stars']  ?? 0;
      case 4: return s['four_stars']  ?? 0;
      case 3: return s['three_stars'] ?? 0;
      case 2: return s['two_stars']   ?? 0;
      case 1: return s['one_star']    ?? 0;
      default: return 0;
    }
  }

  getPercentage(star: number): number {
    if (!this.stats || this.stats.total_reviews === 0) return 0;
    return (this.getStarCount(star) / this.stats.total_reviews) * 100;
  }
}