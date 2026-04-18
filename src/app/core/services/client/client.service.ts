import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface ClientNotificationPreferences {
  id?: number;
  user_id: number;
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  notify_order_confirmed: boolean;
  notify_order_ready: boolean;
  notify_order_delivered: boolean;
  notify_reservation_confirmed: boolean;
  notify_reservation_reminder: boolean;
  created_at?: Date;
  updated_at?: Date;
}

export interface ClientStatistics {
  total_orders: number;
  completed_orders: number;
  active_orders: number;
  total_reservations: number;
  upcoming_reservations: number;
  total_spent: number;
  total_special_orders: number;
  confirmed_special_orders: number;
  pending_special_orders: number;
}

export interface ClientNotification {
  id: number;
  user_id: number;
  type: string;
  title: string;
  message: string;
  reference_id?: number;
  reference_type?: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata: any;
  is_read: boolean;
  read_at?: Date;
  created_at: Date;
}

// ✅ Interface pour la mise à jour du profil
export interface UpdateProfilePayload {
  first_name: string;
  last_name: string;
  phone?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  private apiUrl = `${environment.apiUrl}/client`;
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  private pollingInterval: any = null;
  private readonly POLLING_INTERVAL_MS = 30000;

  constructor(private http: HttpClient) {}

  // ═══════════════════════════════════════════════════════════
  // PROFIL
  // ═══════════════════════════════════════════════════════════

  getProfile(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/profile`).pipe(
      map(response => response.data)
    );
  }

  // ✅ Nouvelle méthode : mettre à jour le profil
  updateProfile(payload: UpdateProfilePayload): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/profile`, payload).pipe(
      map(response => response.data)
    );
  }

  // ═══════════════════════════════════════════════════════════
  // PRÉFÉRENCES DE NOTIFICATION
  // ═══════════════════════════════════════════════════════════

  getNotificationPreferences(): Observable<ClientNotificationPreferences> {
    return this.http.get<any>(`${this.apiUrl}/notification-preferences`).pipe(
      map(response => response.data)
    );
  }

  updateNotificationPreferences(preferences: Partial<ClientNotificationPreferences>): Observable<ClientNotificationPreferences> {
    return this.http.put<any>(`${this.apiUrl}/notification-preferences`, preferences).pipe(
      map(response => response.data)
    );
  }

  // ═══════════════════════════════════════════════════════════
  // COMMANDES
  // ═══════════════════════════════════════════════════════════

  getOrders(filters?: { status?: string; payment_status?: string; limit?: number }): Observable<any[]> {
    let params: any = {};
    if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.payment_status) params.payment_status = filters.payment_status;
      if (filters.limit) params.limit = filters.limit.toString();
    }
    return this.http.get<any>(`${this.apiUrl}/orders`, { params }).pipe(
      map(response => response.data)
    );
  }

  confirmDelivery(orderId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/orders/${orderId}/confirm-delivery`, {});
  }

  // ═══════════════════════════════════════════════════════════
  // RÉSERVATIONS
  // ═══════════════════════════════════════════════════════════

  getReservations(filters?: { status?: string; upcoming?: boolean; limit?: number }): Observable<any[]> {
    let params: any = {};
    if (filters) {
      if (filters.status) params.status = filters.status;
      if (filters.upcoming !== undefined) params.upcoming = filters.upcoming.toString();
      if (filters.limit) params.limit = filters.limit.toString();
    }
    return this.http.get<any>(`${this.apiUrl}/reservations`, { params }).pipe(
      map(response => response.data)
    );
  }

  // ═══════════════════════════════════════════════════════════
  // COMMANDES SPÉCIALES
  // ═══════════════════════════════════════════════════════════

  getSpecialOrders(filters?: { status?: string }): Observable<any[]> {
    let params: any = {};
    if (filters?.status) params.status = filters.status;
    return this.http.get<any>(`${this.apiUrl}/special-orders`, { params }).pipe(
      map(response => response.data)
    );
  }

  // ═══════════════════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════

  getNotifications(options?: { limit?: number; offset?: number; unreadOnly?: boolean }): Observable<any> {
    const params: any = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.unreadOnly) params.unreadOnly = 'true';
    return this.http.get<any>(`${this.apiUrl}/notifications`, { params }).pipe(
      map(response => response.data)
    );
  }

  getUnreadCount(): Observable<number> {
    return this.http.get<any>(`${this.apiUrl}/notifications/unread-count`).pipe(
      map(response => response.data.count)
    );
  }

  refreshUnreadCount(): void {
    this.getUnreadCount().subscribe({
      next: (count: number) => { this.unreadCountSubject.next(count); },
      error: (error) => { console.warn('Impossible de récupérer le compteur de notifications:', error.status); }
    });
  }

  markNotificationAsRead(notificationId: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/notifications/${notificationId}/read`, {}).pipe(
      tap(() => this.refreshUnreadCount())
    );
  }

  markAllNotificationsAsRead(): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/notifications/read-all`, {}).pipe(
      tap(() => this.refreshUnreadCount())
    );
  }

  deleteNotification(notificationId: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/notifications/${notificationId}`).pipe(
      tap(() => this.refreshUnreadCount())
    );
  }

  // ═══════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════

  getNotificationIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'order_confirmed': 'bi bi-check-circle',
      'order_ready': 'bi bi-box-seam',
      'order_delivered': 'bi bi-truck',
      'reservation_confirmed': 'bi bi-calendar-check',
      'reservation_reminder': 'bi bi-bell',
      'order_cancelled': 'bi bi-x-circle',
      'reservation_cancelled': 'bi bi-calendar-x'
    };
    return icons[type] || 'bi bi-bell';
  }

  getNotificationClass(type: string): string {
    const classes: { [key: string]: string } = {
      'order_confirmed': 'notif-success',
      'order_ready': 'notif-primary',
      'order_delivered': 'notif-info',
      'reservation_confirmed': 'notif-success',
      'reservation_reminder': 'notif-warning',
      'order_cancelled': 'notif-danger',
      'reservation_cancelled': 'notif-danger'
    };
    return classes[type] || 'notif-default';
  }

  getOrderStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente', 'confirmed': 'Confirmée', 'preparing': 'En préparation',
      'ready': 'Prête', 'delivered': 'Livrée', 'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  getReservationStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente', 'confirmed': 'Confirmée', 'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  startPolling(): void {
    if (this.pollingInterval) return;
    this.refreshUnreadCount();
    this.pollingInterval = setInterval(() => this.refreshUnreadCount(), this.POLLING_INTERVAL_MS);
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.unreadCountSubject.next(0);
    }
  }
}