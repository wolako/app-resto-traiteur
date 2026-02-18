import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private apiUrl = `${environment.apiUrl}/notifications`;
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  constructor(private http: HttpClient) {
    // Polling toutes les 30 secondes pour mettre à jour le compteur
    interval(30000).subscribe(() => {
      this.refreshUnreadCount();
    });
  }

  /**
   * Récupérer les notifications
   */
  getNotifications(options?: { limit?: number; offset?: number; unreadOnly?: boolean }): Observable<any> {
    const params: any = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.unreadOnly) params.unreadOnly = 'true';

    return this.http.get<any>(this.apiUrl, { params });
  }

  /**
   * Récupérer le nombre de notifications non lues
   */
  getUnreadCount(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/unread-count`);
  }

  /**
   * Rafraîchir le compteur de notifications non lues
   */
  refreshUnreadCount(): void {
    this.getUnreadCount().subscribe({
      next: (response: any) => {
        const count = response.data?.count || 0;
        this.unreadCountSubject.next(count);
      },
      error: (error) => {
        console.error('Error fetching unread count:', error);
      }
    });
  }

  /**
   * Marquer une notification comme lue
   */
  markAsRead(notificationId: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${notificationId}/read`, {});
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  markAllAsRead(): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/read-all`, {});
  }

  /**
   * Obtenir l'icône selon le type de notification
   */
  getNotificationIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'new_order': 'bi-cart-plus',
      'new_reservation': 'bi-calendar-check',
      'payment_success': 'bi-check-circle',
      'payment_failed': 'bi-x-circle',
      'delivery_confirmed': 'bi-truck',
      'order_cancelled': 'bi-x-octagon',
      'reservation_cancelled': 'bi-calendar-x'
    };
    return icons[type] || 'bi-bell';
  }

  /**
   * Obtenir la classe CSS selon le type de notification
   */
  getNotificationClass(type: string): string {
    const classes: { [key: string]: string } = {
      'new_order': 'text-primary',
      'new_reservation': 'text-success',
      'payment_success': 'text-success',
      'payment_failed': 'text-danger',
      'delivery_confirmed': 'text-info',
      'order_cancelled': 'text-warning',
      'reservation_cancelled': 'text-warning'
    };
    return classes[type] || 'text-secondary';
  }

  /**
   * Obtenir la priorité en texte
   */
  getPriorityLabel(priority: string): string {
    const labels: { [key: string]: string } = {
      'low': 'Faible',
      'normal': 'Normal',
      'high': 'Élevée',
      'urgent': 'Urgente'
    };
    return labels[priority] || 'Normal';
  }
}