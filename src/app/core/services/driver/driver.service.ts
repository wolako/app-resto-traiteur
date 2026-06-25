// core/services/driver/driver.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { Driver, CreateDriverDto } from '../../models/driver.model';

@Injectable({ providedIn: 'root' })
export class DriverService {

  constructor(private http: HttpClient) {}

  // ── ÉTABLISSEMENT / ADMIN ────────────────────────────────

  /** Créer un livreur */
  createDriver(data: CreateDriverDto): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/drivers`, data);
  }

  /** Livreurs d'un établissement */
  getBusinessDrivers(businessId: number): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/drivers/business/${businessId}`);
  }

  /** Tous les livreurs (admin) */
  getAllDrivers(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/drivers`);
  }

  /** Modifier un livreur */
  updateDriver(id: number, data: Partial<Driver>): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/${id}`, data);
  }

  /** Désactiver un livreur */
  deleteDriver(id: number): Observable<any> {
    return this.http.delete<any>(`${environment.apiUrl}/drivers/${id}`);
  }

  /** Assigner un livreur à une commande */
  assignDriver(orderId: number, driverId: number): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/drivers/orders/${orderId}/assign`,
      { driver_id: driverId }
    );
  }

  /** Retirer le livreur d'une commande */
  unassignDriver(orderId: number): Observable<any> {
    return this.http.delete<any>(`${environment.apiUrl}/drivers/orders/${orderId}/assign`);
  }

  // ── LIVREUR (interface mobile) ────────────────────────────

  /** Mes commandes actives */
  getMyOrders(): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/drivers/me/orders`);
  }

  /** Toggle online/offline */
  toggleStatus(): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/me/status`, {});
  }

  /** Confirmer récupération */
  pickup(orderId: number): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/me/orders/${orderId}/pickup`, {});
  }

  /** Confirmer livraison */
  deliver(orderId: number, data?: { notes?: string; proof_photo_url?: string }): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/me/orders/${orderId}/deliver`, data || {});
  }

  /** Accepter une commande assignée */
  accept(orderId: number): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/me/orders/${orderId}/accept`, {});
  }

  /** Signaler échec — ✅ envoyer 'reason' (correspondance avec controller) */
  fail(orderId: number, reason: string): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/me/orders/${orderId}/fail`, { reason });
  }

  /** Changer mot de passe */
  changePassword(new_password: string): Observable<any> {
    return this.http.patch<any>(`${environment.apiUrl}/drivers/me/change-password`, { new_password });
  }

  refuse(orderId: number, reason?: string): Observable<any> {
    return this.http.patch<any>(
      `${environment.apiUrl}/drivers/me/orders/${orderId}/refuse`,
      { reason }
    );
  }
  
}