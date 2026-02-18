import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface SubscriptionPlan {
  id: number;
  name: string;
  display_name: string;
  description: string;
  price: number;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_photos: number;
  can_accept_online_orders: boolean;
  can_accept_reservations: boolean;
  can_accept_special_orders: boolean;
  priority_support: boolean;
  analytics_access: boolean;
  custom_branding: boolean;
  commission_rate: number;
}

export interface BusinessSubscription {
  id: number;
  business_id: number;
  plan_id: number;
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  start_date: string;
  end_date: string;
  next_billing_date: string;
  auto_renew: boolean;
  plan_name: string;
  display_name: string;
  commission_rate: number;
}

@Injectable({
  providedIn: 'root'
})
export class SubscriptionService {
  private apiUrl = `${environment.apiUrl}/subscriptions`;

  constructor(private http: HttpClient) {}

  getPlans(): Observable<SubscriptionPlan[]> {
    return this.http.get<SubscriptionPlan[]>(`${this.apiUrl}/plans`);
  }

  getCurrentSubscription(): Observable<BusinessSubscription> {
    return this.http.get<BusinessSubscription>(`${this.apiUrl}/current`);
  }

  subscribe(planId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/subscribe`, { plan_id: planId });
  }

  upgrade(planId: number): Observable<any> {
    return this.http.post(`${this.apiUrl}/upgrade`, { plan_id: planId });
  }

  cancel(): Observable<any> {
    return this.http.post(`${this.apiUrl}/cancel`, {});
  }

  getUsageStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/usage`);
  }

  // 🆕 Méthodes pour l'admin dashboard
  getSubscriptionStats(): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/stats`);
  }

  getPlatformCommissionStats(period: string = 'month'): Observable<any> {
    return this.http.get(`${this.apiUrl}/admin/commissions`, {
      params: { period }
    });
  }
}