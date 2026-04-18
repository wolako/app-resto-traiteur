import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface AnalyticsOverview {
  period: number;
  business_type?: string;
  total_page_views: number;
  total_menu_clicks: number;
  total_item_clicks: number;
  total_orders_started: number;
  total_orders_completed: number;
  total_reservations_started: number;
  total_reservations_completed: number;
  total_sessions: number;
  order_conversion_rate: number;
  reservation_conversion_rate: number;
  real_orders_count?: number;
  real_special_orders_count?: number;
  real_reservations_count?: number;
}

export interface PopularItem {
  menu_item_id: number;
  item_name: string;
  price: number;
  menu_name: string;
  total_clicks: number;
  total_orders: number;
  conversion_rate: number;
}

export interface TimelinePoint {
  period: string;
  page_views: number;
  menu_clicks: number;
  item_clicks: number;
  orders_completed: number;
  reservations_completed: number;
  unique_sessions: number;
  special_orders_count?: number;
}

export interface ConversionPoint {
  date: string;
  page_views: number;
  orders_started: number;
  orders_completed: number;
  reservations_started: number;
  reservations_completed: number;
  unique_sessions: number;
  order_conversion_rate: number;
  reservation_conversion_rate: number;
  special_orders_count?: number;
}

@Injectable({ providedIn: 'root' })
export class AnalyticsService {
  private apiUrl = `${environment.apiUrl}/analytics`;
  private sessionId: string;

  constructor(private http: HttpClient) {
    this.sessionId = this.getOrCreateSessionId();
  }

  private getOrCreateSessionId(): string {
    let sessionId = localStorage.getItem('analytics_session_id');
    if (!sessionId) {
      sessionId = 'sess_' + Math.random().toString(36).substring(2) + Date.now().toString(36);
      localStorage.setItem('analytics_session_id', sessionId);
    }
    return sessionId;
  }

  getSessionId(): string { return this.sessionId; }

  getBusinessOverview(businessId: number, period = 30): Observable<AnalyticsOverview> {
    const params = new HttpParams().set('period', period.toString());
    return this.http
      .get<any>(`${this.apiUrl}/business/${businessId}/overview`, { params })
      .pipe(map(res => res?.data ?? res));
  }

  getPopularItems(businessId: number, period = 30, limit = 10): Observable<PopularItem[]> {
    const params = new HttpParams()
      .set('period', period.toString())
      .set('limit', limit.toString());
    return this.http
      .get<any>(`${this.apiUrl}/business/${businessId}/popular-items`, { params })
      .pipe(map(res => res?.data ?? res ?? []));
  }

  getConversionRate(businessId: number, period = 30): Observable<ConversionPoint[]> {
    const params = new HttpParams().set('period', period.toString());
    return this.http
      .get<any>(`${this.apiUrl}/business/${businessId}/conversion`, { params })
      .pipe(map(res => res?.data ?? res ?? []));
  }

  getTimeline(
    businessId: number,
    period = 30,
    granularity: 'day' | 'week' | 'month' = 'day'
  ): Observable<TimelinePoint[]> {
    const params = new HttpParams()
      .set('period', period.toString())
      .set('granularity', granularity);
    return this.http
      .get<any>(`${this.apiUrl}/business/${businessId}/timeline`, { params })
      .pipe(map(res => res?.data ?? res ?? []));
  }

  getGlobalStats(period = 30): Observable<any> {
    const params = new HttpParams().set('period', period.toString());
    return this.http.get<any>(`${this.apiUrl}/admin/global`, { params });
  }

  // ════════════════════════════════════════════════════════
  // Tracking — tous fire-and-forget (erreurs silencieuses)
  // ════════════════════════════════════════════════════════

  /**
   * ✅ NOUVEAU : Vue de page profil public
   * À appeler depuis le composant de profil public dès le chargement
   */
  trackPageView(businessId: number): void {
    this.track('page_view', businessId);
  }

  trackItemClick(businessId: number, menuItemId: number, menuId?: number): void {
    this.track('item_click', businessId, { menu_id: menuId, menu_item_id: menuItemId });
  }

  trackMenuClick(businessId: number, menuId: number): void {
    this.track('menu_click', businessId, { menu_id: menuId });
  }

  /**
   * ✅ NOUVEAU : Démarrage de commande (avant paiement)
   */
  trackOrderStarted(businessId: number): void {
    this.track('order_started', businessId);
  }

  /**
   * ✅ NOUVEAU : Démarrage de réservation
   */
  trackReservationStarted(businessId: number): void {
    this.track('reservation_started', businessId);
  }

  /**
   * Méthode interne commune — envoie l'événement en fire-and-forget
   */
  private track(
    eventType: string,
    businessId: number,
    extra: { menu_id?: number; menu_item_id?: number } = {}
  ): void {
    this.http.post(
      `${this.apiUrl}/track`,
      {
        event_type:   eventType,
        business_id:  businessId,
        menu_id:      extra.menu_id      ?? null,
        menu_item_id: extra.menu_item_id ?? null,
      },
      { headers: { 'X-Session-Id': this.sessionId } }
    ).subscribe({ error: () => {} });
  }
}