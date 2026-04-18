import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Order } from '../../models/order.model';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class OrderService {

  constructor(private http: HttpClient) {}

  createOrder(order: Omit<Order, 'id'>): Observable<Order> {
    return this.http.post<Order>(`${environment.apiUrl}/orders`, order);
  }

  getBusinessOrders(businessId: number): Observable<Order[]> {
    return this.http.get<Order[]>(`${environment.apiUrl}/orders/businesses/${businessId}`);
  }

  getOrder(orderId: number): Observable<Order> {
    return this.http.get<Order>(`${environment.apiUrl}/orders/${orderId}`);
  }

  updateOrderStatus(orderId: number, status: string): Observable<Order> {
    return this.http.patch<Order>(`${environment.apiUrl}/orders/${orderId}/status`, { status });
  }

  getOrderStatistics(businessId?: number): Observable<any> {
    const url = businessId
      ? `${environment.apiUrl}/orders/statistics?business_id=${businessId}`
      : `${environment.apiUrl}/orders/statistics`;
    return this.http.get<any>(url);
  }

  createSpecialOrder(orderData: any): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/orders/special`, orderData);
  }

  getSpecialOrders(businessId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/orders/businesses/${businessId}/special-orders`);
  }

  getSpecialOrderById(orderId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/orders/special/${orderId}`);
  }

  updateSpecialOrderStatus(orderId: number, status: string): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/orders/special/${orderId}/status`, { status });
  }

  getOrderDetails(orderId: number): Observable<any> {
    return this.http.get(`${environment.apiUrl}/orders/${orderId}`);
  }

  acceptSpecialOrderQuote(specialOrderId: number, data: { deposit_payment_method: string }): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/orders/special/${specialOrderId}/accept-quote`, data);
  }

  // ✅ AJOUT MANQUANT — envoi du devis par le traiteur
  sendSpecialOrderQuote(specialOrderId: number, quoteData: {
    quoted_amount: number;
    deposit_percentage: number;
    transport_fee?: number;
    quote_notes?: string;
  }): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/orders/special/${specialOrderId}/send-quote`,
      quoteData
    );
  }
}