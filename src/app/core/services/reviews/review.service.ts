// src/app/core/services/reviews/review.service.ts - VERSION GUEST SUPPORT

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface Review {
  id: number;
  business_id: number;
  user_id: number | null;      // null si invité
  order_id?: number;
  rating: number;
  comment?: string;
  response?: string;
  responded_at?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
  // Champs renvoyés par le backend
  user_name?: string;
  first_name?: string;
  last_name?: string;
  is_guest?: boolean;           // ✅ true si avis d'un invité
  guest_name?: string;
}

export interface ReviewStats {
  average_rating: number;
  total_reviews:  number;
  five_stars:  number;
  four_stars:  number;
  three_stars: number;
  two_stars:   number;
  one_star:    number;
}

export interface BusinessReviewsResponse {
  reviews: Review[];
  stats: ReviewStats;
  pagination: { limit: number; offset: number; total: number };
}

/** Payload pour un client connecté */
export interface CreateReviewPayload {
  business_id: number;
  rating: number;
  comment?: string;
  order_id?: number;
}

/** Payload pour un invité */
export interface CreateGuestReviewPayload {
  business_id: number;
  rating: number;
  comment?: string;
  guest_name: string;
  guest_phone: string;
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private apiUrl = `${environment.apiUrl}/reviews`;

  constructor(private http: HttpClient) {}

  /** Créer un avis — CLIENT connecté */
  createReview(data: CreateReviewPayload): Observable<any> {
    return this.http.post(this.apiUrl, data);
  }

  /** Créer un avis — INVITÉ (pas de token) */
  createGuestReview(data: CreateGuestReviewPayload): Observable<any> {
    return this.http.post(this.apiUrl, data);
    // Pas de header Authorization → authenticateTokenOptional laisse passer
  }

  /** Obtenir les avis d'un business (public) */
  getBusinessReviews(
    businessId: number,
    params?: { limit?: number; offset?: number }
  ): Observable<{ success: boolean; data: BusinessReviewsResponse }> {
    return this.http.get<{ success: boolean; data: BusinessReviewsResponse }>(
      `${this.apiUrl}/business/${businessId}`,
      { params: params as any }
    );
  }

  /** Obtenir mes avis (client connecté) */
  getMyReviews(): Observable<{ success: boolean; data: Review[] }> {
    return this.http.get<{ success: boolean; data: Review[] }>(
      `${this.apiUrl}/my-reviews`
    );
  }

  /** Modifier un avis (client connecté) */
  updateReview(reviewId: number, data: { rating?: number; comment?: string }): Observable<any> {
    return this.http.put(`${this.apiUrl}/${reviewId}`, data);
  }

  /** Supprimer un avis (client connecté) */
  deleteReview(reviewId: number): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${reviewId}`);
  }

  /** Répondre à un avis (restaurant/traiteur) */
  respondToReview(reviewId: number, response: string): Observable<any> {
    return this.http.put(`${this.apiUrl}/${reviewId}/respond`, { response });
  }
}