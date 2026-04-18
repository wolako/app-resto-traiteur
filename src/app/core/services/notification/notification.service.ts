import { Injectable, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subscription, interval } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NotificationService implements OnDestroy {
  private apiUrl = `${environment.apiUrl}/notifications`;
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  private pollingSubscription: Subscription | null = null;

  constructor(private http: HttpClient) {
    // ✅ Ne démarrer le polling que si connecté
    if (this.isLoggedIn()) {
      this.startPolling();
    }
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  // ✅ Vérifie si l'utilisateur est connecté
  private isLoggedIn(): boolean {
    return !!localStorage.getItem('token');
  }

  // ✅ Démarrer le polling (à appeler après login)
  startPolling(): void {
    if (this.pollingSubscription) return; // Déjà en cours
    if (!this.isLoggedIn()) return;       // Pas connecté

    // Appel immédiat au démarrage
    this.refreshUnreadCount();

    // Puis toutes les 30 secondes
    this.pollingSubscription = interval(30000).subscribe(() => {
      if (this.isLoggedIn()) {
        this.refreshUnreadCount();
      } else {
        // Token disparu en cours de route → arrêter
        this.stopPolling();
      }
    });
  }

  // ✅ Arrêter le polling (à appeler après logout)
  stopPolling(): void {
    if (this.pollingSubscription) {
      this.pollingSubscription.unsubscribe();
      this.pollingSubscription = null;
    }
    this.unreadCountSubject.next(0);
  }

  getNotifications(options?: {
    limit?: number;
    offset?: number;
    unreadOnly?: boolean;
  }): Observable<any> {
    const params: any = {};
    if (options?.limit)      params.limit      = options.limit.toString();
    if (options?.offset)     params.offset     = options.offset.toString();
    if (options?.unreadOnly) params.unreadOnly = 'true';

    return this.http.get<any>(this.apiUrl, { params });
  }

  getUnreadCount(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/unread-count`);
  }

  refreshUnreadCount(): void {
    // ✅ Guard : ne jamais appeler si pas connecté
    if (!this.isLoggedIn()) {
      this.unreadCountSubject.next(0);
      return;
    }

    this.getUnreadCount().subscribe({
      next: (response: any) => {
        const count = response.data?.count ?? 0;
        this.unreadCountSubject.next(count);
      },
      error: () => {
        // Silencieux — l'intercepteur gère déjà le 401
      },
    });
  }

  markAsRead(notificationId: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/${notificationId}/read`, {});
  }

  markAllAsRead(): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/read-all`, {});
  }

  getNotificationIcon(type: string): string {
    const icons: Record<string, string> = {
      new_order:              'bi-cart-plus',
      new_reservation:        'bi-calendar-check',
      payment_success:        'bi-check-circle',
      payment_failed:         'bi-x-circle',
      delivery_confirmed:     'bi-truck',
      order_cancelled:        'bi-x-octagon',
      reservation_cancelled:  'bi-calendar-x',
    };
    return icons[type] ?? 'bi-bell';
  }

  getNotificationClass(type: string): string {
    const classes: Record<string, string> = {
      new_order:              'text-primary',
      new_reservation:        'text-success',
      payment_success:        'text-success',
      payment_failed:         'text-danger',
      delivery_confirmed:     'text-info',
      order_cancelled:        'text-warning',
      reservation_cancelled:  'text-warning',
    };
    return classes[type] ?? 'text-secondary';
  }

  getPriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      low:    'Faible',
      normal: 'Normal',
      high:   'Élevée',
      urgent: 'Urgente',
    };
    return labels[priority] ?? 'Normal';
  }
}