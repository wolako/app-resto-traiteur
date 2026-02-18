import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { User } from '../../models/user.model';
import { Business } from '../../models/business.model';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AdminService {

  constructor(private http: HttpClient) {}

  // =============================================
  // GESTION DES UTILISATEURS
  // =============================================

  getAllUsers(role?: string): Observable<User[]> {
    let url = `${environment.apiUrl}/admin/users`;
    if (role) {
      url += `?role=${role}`;
    }
    return this.http.get<any>(url).pipe(
      map(response => response.data || response)
    );
  }

  updateUserStatus(userId: number, isActive: boolean): Observable<User> {
    return this.http.put<any>(`${environment.apiUrl}/admin/users/${userId}/status`, {
      is_active: isActive
    }).pipe(
      map(response => response.data || response)
    );
  }

  deleteUser(userId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/admin/users/${userId}`);
  }

  // =============================================
  // GESTION DES ÉTABLISSEMENTS
  // =============================================

  getAllBusinesses(): Observable<Business[]> {
    return this.http.get<any>(`${environment.apiUrl}/admin/businesses`).pipe(
      map(response => response.data || response)
    );
  }

  getBusinessById(businessId: number): Observable<Business> {
    return this.http.get<any>(`${environment.apiUrl}/admin/businesses/${businessId}`).pipe(
      map(response => response.data || response)
    );
  }

  updateBusiness(businessId: number, updates: Partial<Business>): Observable<Business> {
    return this.http.put<any>(`${environment.apiUrl}/admin/businesses/${businessId}`, updates).pipe(
      map(response => response.data || response)
    );
  }

  updateBusinessStatus(businessId: number, isActive: boolean): Observable<Business> {
    return this.http.put<any>(`${environment.apiUrl}/admin/businesses/${businessId}/status`, {
      is_active: isActive
    }).pipe(
      map(response => response.data || response)
    );
  }

  deleteBusiness(businessId: number): Observable<void> {
    return this.http.delete<void>(`${environment.apiUrl}/admin/businesses/${businessId}`);
  }

  // =============================================
  // GESTION DES COMMANDES (NOUVEAU)
  // =============================================

  getAllOrders(status?: string, paymentStatus?: string): Observable<any[]> {
    let url = `${environment.apiUrl}/admin/orders`;
    const params = [];
    if (status) params.push(`status=${status}`);
    if (paymentStatus) params.push(`payment_status=${paymentStatus}`);
    if (params.length > 0) url += `?${params.join('&')}`;

    return this.http.get<any>(url).pipe(
      map(response => response.data || response)
    );
  }

  getOrderById(orderId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/admin/orders/${orderId}`).pipe(
      map(response => response.data || response)
    );
  }

  updateOrderStatus(orderId: number, status: string): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/admin/orders/${orderId}/status`, {
      status
    }).pipe(
      map(response => response.data || response)
    );
  }

  // =============================================
  // GESTION DES RÉSERVATIONS (NOUVEAU)
  // =============================================

  getAllReservations(status?: string): Observable<any[]> {
    let url = `${environment.apiUrl}/admin/reservations`;
    if (status) url += `?status=${status}`;

    return this.http.get<any>(url).pipe(
      map(response => response.data || response)
    );
  }

  getReservationById(reservationId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/admin/reservations/${reservationId}`).pipe(
      map(response => response.data || response)
    );
  }

  updateReservationStatus(reservationId: number, status: string): Observable<any> {
    return this.http.put<any>(`${environment.apiUrl}/admin/reservations/${reservationId}/status`, {
      status
    }).pipe(
      map(response => response.data || response)
    );
  }

  // =============================================
  // STATISTIQUES
  // =============================================

  getGlobalStatistics(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/admin/statistics`).pipe(
      map(response => response.data || response)
    );
  }

  // =============================================
  // PAIEMENTS
  // =============================================

  getAllPayments(): Observable<any[]> {
    return this.http.get<any>(`${environment.apiUrl}/admin/payments`).pipe(
      map(response => response.data || response)
    );
  }

  // =============================================
  // ABONNEMENTS & RAPPELS D'EXPIRATION (NOUVEAU)
  // =============================================

  /**
   * Liste tous les abonnements actifs avec leur statut d'expiration
   * GET /api/admin/subscriptions
   */
  getAllSubscriptions(expiringSoon?: boolean): Observable<any> {
    let url = `${environment.apiUrl}/admin/subscriptions`;
    if (expiringSoon) url += '?expiring_soon=true';
    return this.http.get<any>(url);
  }

  /**
   * Historique des rappels envoyés
   * GET /api/admin/subscriptions/reminders-history
   */
  getRemindersHistory(limit: number = 50): Observable<any> {
    return this.http.get<any>(
      `${environment.apiUrl}/admin/subscriptions/reminders-history?limit=${limit}`
    );
  }

  /**
   * Déclencher manuellement le job de rappels
   * POST /api/admin/subscriptions/trigger-reminders
   */
  triggerExpiryReminders(): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/admin/subscriptions/trigger-reminders`,
      {}
    );
  }

  /**
   * Envoyer un rappel ciblé à un abonnement spécifique
   * POST /api/admin/subscriptions/:id/send-reminder
   */
  sendManualReminder(subscriptionId: number, channel: 'email' | 'sms' | 'both'): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/admin/subscriptions/${subscriptionId}/send-reminder`,
      { channel }
    );
  }

}