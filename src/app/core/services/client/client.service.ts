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

@Injectable({
  providedIn: 'root'
})
export class ClientService {
  private apiUrl = `${environment.apiUrl}/client`;
  private unreadCountSubject = new BehaviorSubject<number>(0);
  public unreadCount$ = this.unreadCountSubject.asObservable();

  // ✅ Ajout des propriétés pour le polling
  private pollingInterval: any = null;
  private readonly POLLING_INTERVAL_MS = 30000; // 30 secondes
  
  constructor(private http: HttpClient) {
    // // Polling toutes les 30 secondes pour mettre à jour le compteur
    // interval(30000).subscribe(() => {
    //   this.refreshUnreadCount();
    // });
  }

  // =============================================
  // PROFIL
  // =============================================

  /**
   * Obtenir le profil complet du client
   */
  getProfile(): Observable<any> {
    return this.http.get<any>(`${this.apiUrl}/profile`).pipe(
      map(response => {
        console.log('📊 Raw profile response:', response); // DEBUG
        return response.data;
      })
    );
  }

  // =============================================
  // PRÉFÉRENCES DE NOTIFICATION
  // =============================================

  /**
   * Obtenir les préférences de notification
   */
  getNotificationPreferences(): Observable<ClientNotificationPreferences> {
    return this.http.get<any>(`${this.apiUrl}/notification-preferences`).pipe(
      map(response => response.data)
    );
  }

  /**
   * Mettre à jour les préférences de notification
   */
  updateNotificationPreferences(preferences: Partial<ClientNotificationPreferences>): Observable<ClientNotificationPreferences> {
    return this.http.put<any>(`${this.apiUrl}/notification-preferences`, preferences).pipe(
      map(response => response.data)
    );
  }

  // =============================================
  // COMMANDES
  // =============================================

  /**
   * Obtenir les commandes du client
   */
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

  /**
   * Confirmer la livraison d'une commande
   */
  confirmDelivery(orderId: number): Observable<any> {
    return this.http.post<any>(`${this.apiUrl}/orders/${orderId}/confirm-delivery`, {});
  }

  // =============================================
  // RÉSERVATIONS
  // =============================================

  /**
   * Obtenir les réservations du client
   */
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

  // =============================================
  // COMMANDES SPÉCIALES
  // =============================================

  /**
   * Obtenir les commandes spéciales du client
   */
  getSpecialOrders(filters?: { status?: string }): Observable<any[]> {
    let params: any = {};
    if (filters?.status) {
      params.status = filters.status;
    }

    return this.http.get<any>(`${this.apiUrl}/special-orders`, { params }).pipe(
      map(response => response.data)
    );
  }

  // =============================================
  // NOTIFICATIONS
  // =============================================

  /**
   * Obtenir les notifications du client
   */
  getNotifications(options?: { limit?: number; offset?: number; unreadOnly?: boolean }): Observable<any> {
    const params: any = {};
    if (options?.limit) params.limit = options.limit.toString();
    if (options?.offset) params.offset = options.offset.toString();
    if (options?.unreadOnly) params.unreadOnly = 'true';

    return this.http.get<any>(`${this.apiUrl}/notifications`, { params }).pipe(
      map(response => response.data)
    );
  }

  /**
   * Obtenir le nombre de notifications non lues
   */
  getUnreadCount(): Observable<number> {
    return this.http.get<any>(`${this.apiUrl}/notifications/unread-count`).pipe(
      map(response => response.data.count)
    );
  }

  /**
   * Rafraîchir le compteur de notifications non lues
   */
  refreshUnreadCount(): void {
    this.getUnreadCount().subscribe({
      next: (count: number) => {
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
  markNotificationAsRead(notificationId: number): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/notifications/${notificationId}/read`, {}).pipe(
      tap(() => this.refreshUnreadCount())
    );
  }

  /**
   * Marquer toutes les notifications comme lues
   */
  markAllNotificationsAsRead(): Observable<any> {
    return this.http.put<any>(`${this.apiUrl}/notifications/read-all`, {}).pipe(
      tap(() => this.refreshUnreadCount())
    );
  }

  /**
   * Supprimer une notification
   */
  deleteNotification(notificationId: number): Observable<any> {
    return this.http.delete<any>(`${this.apiUrl}/notifications/${notificationId}`).pipe(
      tap(() => this.refreshUnreadCount())
    );
  }

  // =============================================
  // UTILITAIRES
  // =============================================

  /**
   * Obtenir l'icône selon le type de notification
   */
  getNotificationIcon(type: string): string {
    const icons: { [key: string]: string } = {
      'order_confirmed': 'bi-check-circle',
      'order_ready': 'bi-box-seam',
      'order_delivered': 'bi-truck',
      'reservation_confirmed': 'bi-calendar-check',
      'reservation_reminder': 'bi-bell',
      'order_cancelled': 'bi-x-circle',
      'reservation_cancelled': 'bi-calendar-x'
    };
    return icons[type] || 'bi-bell';
  }

  /**
   * Obtenir la classe CSS selon le type de notification
   */
  getNotificationClass(type: string): string {
    const classes: { [key: string]: string } = {
      'order_confirmed': 'text-success',
      'order_ready': 'text-primary',
      'order_delivered': 'text-info',
      'reservation_confirmed': 'text-success',
      'reservation_reminder': 'text-warning',
      'order_cancelled': 'text-danger',
      'reservation_cancelled': 'text-danger'
    };
    return classes[type] || 'text-secondary';
  }

  /**
   * Formater le statut de commande
   */
  getOrderStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'confirmed': 'Confirmée',
      'preparing': 'En préparation',
      'ready': 'Prête',
      'delivered': 'Livrée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  /**
   * Formater le statut de réservation
   */
  getReservationStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'confirmed': 'Confirmée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  // ✅ AJOUT : Démarrer le polling
  startPolling(): void {
    // Éviter de créer plusieurs timers
    if (this.pollingInterval) {
      return;
    }

    // Premier rafraîchissement immédiat
    this.refreshUnreadCount();

    // Polling toutes les 30 secondes
    this.pollingInterval = setInterval(() => {
      this.refreshUnreadCount();
    }, this.POLLING_INTERVAL_MS);

    console.log('✅ Polling des notifications démarré');
  }

  // ✅ AJOUT : Arrêter le polling
  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
      this.unreadCountSubject.next(0);
      console.log('🛑 Polling des notifications arrêté');
    }
  }

}