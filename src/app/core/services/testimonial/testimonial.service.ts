// src/app/core/services/testimonial/testimonial.service.ts

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Testimonial, TestimonialSubmission, TestimonialStats } from '../../models/testimonial.model';

@Injectable({
  providedIn: 'root'
})
export class TestimonialService {
  private apiUrl = `${environment.apiUrl}/testimonials`;

  constructor(private http: HttpClient) {}

  // =============================================
  // PUBLIC - Pour les clients
  // =============================================

  /**
   * Récupérer les témoignages approuvés (pour affichage public)
   * @param featured - Si true, ne retourne que les témoignages vedettes
   * @param limit - Nombre maximum de témoignages à retourner
   */
  getApprovedTestimonials(featured: boolean = false, limit: number = 10): Observable<Testimonial[]> {
    const params: any = { status: 'approved', limit };
    if (featured) {
      params.featured = 'true';
    }
    return this.http.get<any>(`${this.apiUrl}/public`, { params }).pipe(
      // ✅ Unwrap { success: true, data: [...] } → [...]
      map(response => response.data || response)
    );
  }

  /**
   * Vérifier l'éligibilité de l'utilisateur pour soumettre un témoignage
   */
  checkEligibility(): Observable<{
  eligible: boolean;
  accountAge?: number;
  deliveredOrders?: number;
  message?: string;
}> {
  return this.http.get<any>(`${this.apiUrl}/check-eligibility`).pipe(
    map(response => response.data || response)  // ✅ unwrap data si nécessaire
  );
}

  /**
   * Soumettre un nouveau témoignage (client authentifié)
   */
  submitTestimonial(data: TestimonialSubmission): Observable<Testimonial> {
    return this.http.post<Testimonial>(`${this.apiUrl}/submit`, data);
  }

  /**
   * Récupérer le témoignage de l'utilisateur connecté
   */
  getMyTestimonial(): Observable<{ hasTestimonial: boolean; testimonial?: Testimonial }> {
    return this.http.get<{ hasTestimonial: boolean; testimonial?: Testimonial }>(`${this.apiUrl}/my-testimonial`);
  }

  /**
   * Vérifier si l'utilisateur connecté a déjà soumis un témoignage
   * @deprecated Utiliser getMyTestimonial() à la place
   */
  checkUserTestimonial(): Observable<{ hasTestimonial: boolean; testimonial?: Testimonial }> {
    return this.getMyTestimonial();
  }

  /**
   * Mettre à jour son propre témoignage (si pending ou rejected)
   */
  updateMyTestimonial(data: TestimonialSubmission): Observable<Testimonial> {
    return this.http.put<Testimonial>(`${this.apiUrl}/my-testimonial`, data);
  }

  // =============================================
  // ADMIN - Gestion et modération
  // =============================================

  /**
   * Récupérer tous les témoignages (avec filtres)
   */
  getAllTestimonials(status?: string): Observable<Testimonial[]> {
    const params: any = {};
    if (status) params.status = status;
    return this.http.get<any>(`${this.apiUrl}/admin/all`, { params }).pipe(
      // ✅ Unwrap { success, data: [...] } → [...]
      map(response => response.data || response)
    );
  }

  /**
   * Obtenir les statistiques des témoignages
   */
  getTestimonialStats(): Observable<TestimonialStats> {
    return this.http.get<any>(`${this.apiUrl}/admin/stats`).pipe(
      // ✅ Unwrap { success, data: {...} } → {...}
      map(response => response.data || response)
    );
  }

  /**
   * Approuver un témoignage
   */
  approveTestimonial(id: number, featured: boolean = false): Observable<Testimonial> {
    return this.http.put<any>(`${this.apiUrl}/admin/${id}/approve`, { featured }).pipe(
      map(response => response.data || response)
    );
  }

  /**
   * Rejeter un témoignage
   */
  rejectTestimonial(id: number, reason?: string): Observable<Testimonial> {
    return this.http.put<any>(`${this.apiUrl}/admin/${id}/reject`, { reason }).pipe(
      map(response => response.data || response)
    );
  }

  /**
   * Basculer le statut "featured"
   */
  toggleFeatured(id: number): Observable<Testimonial> {
    return this.http.patch<any>(`${this.apiUrl}/admin/${id}/toggle-featured`, {}).pipe(
      map(response => response.data || response)
    );
  }

  /**
   * Supprimer un témoignage
   */
  deleteTestimonial(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/admin/${id}`);
  }

}