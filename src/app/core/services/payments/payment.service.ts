import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';
import { appPayment, appPaymentRequest, appPaymentResponse } from '../../models/payment.model';

@Injectable({
  providedIn: 'root'
})
export class PaymentService {

  // true quand paymentMode = 'sandbox' dans environment.ts
  readonly isSandbox = environment.paymentMode === 'sandbox';

  constructor(private http: HttpClient) {}

  /**
   * Initie un paiement.
   * - Sandbox : le backend répond avec status='paid' et sandbox=true, pas de redirection.
   * - Live    : le backend renvoie checkout_url → on redirige vers CinetPay.
   */
  initiatePayment(paymentData: appPaymentRequest): Observable<appPaymentResponse> {
    return this.http.post<appPaymentResponse>(
      `${environment.apiUrl}/payments/initiate`,
      paymentData
    ).pipe(
      tap((response: any) => {
        if (response?.data?.sandbox) {
          // SANDBOX : paiement déjà accepté côté backend, aucune redirection
          console.log('[SANDBOX] Paiement accepté immédiatement, pas de redirection CinetPay.');
        } else if (response?.data?.checkout_url) {
          // LIVE : rediriger vers la page de paiement CinetPay
          window.location.href = response.data.checkout_url;
        }
      })
    );
  }

  /**
   * Récupère le statut d'un paiement.
   * En sandbox, le backend renvoie directement le statut en base sans appeler CinetPay.
   */
  getPaymentStatus(paymentId: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/payments/verify/${paymentId}`);
  }

  getPayment(paymentId: string): Observable<appPayment> {
    return this.http.get<appPayment>(`${environment.apiUrl}/payments/${paymentId}`);
  }

  getBusinessPayments(businessId: number): Observable<appPayment[]> {
    return this.http.get<appPayment[]>(`${environment.apiUrl}/businesses/${businessId}/payments`);
  }

  getAllPayments(): Observable<appPayment[]> {
    return this.http.get<appPayment[]>(`${environment.apiUrl}/payments`);
  }
}