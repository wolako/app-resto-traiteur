import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, throwError, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface SubscriptionLimits {
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_photos: number;
  can_accept_online_orders: boolean;
  can_accept_reservations: boolean;
  can_accept_special_orders: boolean;
  current_menu_items?: number;
  current_orders?: number;
  current_photos?: number;
}

export interface LimitCheckResponse {
  canProceed: boolean;
  error?: string;
  limit?: number;
  current?: number;
  upgradeRequired?: boolean;
  featureRequired?: string;
}

@Injectable({
  providedIn: 'root'
})
export class SubscriptionLimitsService {

  constructor(private http: HttpClient) {}

  /**
   * Récupérer les limites et l'utilisation actuelle
   */
  getCurrentLimits(): Observable<SubscriptionLimits> {
    return this.http.get<any>(`${environment.apiUrl}/subscriptions/usage`)
      .pipe(
        map(response => {
          const limits = response.limits || {};
          const usage = response.usage || {};
          
          return {
            max_menu_items: limits.menu_items,
            max_orders_per_month: limits.orders_per_month,
            max_photos: limits.photos,
            can_accept_online_orders: limits.can_accept_online_orders || false,
            can_accept_reservations: limits.can_accept_reservations || false,
            can_accept_special_orders: limits.can_accept_special_orders || false,
            current_menu_items: usage.menu_items || 0,
            current_orders: usage.orders_this_month || 0,
            current_photos: usage.photos || 0
          };
        }),
        catchError(this.handleError)
      );
  }

  /**
   * Vérifier si on peut ajouter un article de menu
   */
  canAddMenuItem(): Observable<LimitCheckResponse> {
    return this.getCurrentLimits().pipe(
      map(limits => {
        if (limits.max_menu_items === null) {
          return { canProceed: true };
        }

        if ((limits.current_menu_items || 0) >= limits.max_menu_items) {
          return {
            canProceed: false,
            error: `Limite d'articles de menu atteinte (${limits.max_menu_items}). Passez à un plan supérieur.`,
            limit: limits.max_menu_items,
            current: limits.current_menu_items,
            upgradeRequired: true
          };
        }

        return { canProceed: true };
      })
    );
  }

  /**
   * Vérifier si on peut ajouter une photo
   */
  canAddPhoto(): Observable<LimitCheckResponse> {
    return this.getCurrentLimits().pipe(
      map(limits => {
        if ((limits.current_photos || 0) >= limits.max_photos) {
          return {
            canProceed: false,
            error: `Limite de photos atteinte (${limits.max_photos}). Passez à un plan supérieur.`,
            limit: limits.max_photos,
            current: limits.current_photos,
            upgradeRequired: true
          };
        }

        return { canProceed: true };
      })
    );
  }

  /**
   * Vérifier si les commandes en ligne sont autorisées
   */
  canAcceptOnlineOrders(): Observable<LimitCheckResponse> {
    return this.getCurrentLimits().pipe(
      map(limits => {
        if (!limits.can_accept_online_orders) {
          return {
            canProceed: false,
            error: 'Votre plan ne permet pas les commandes en ligne. Passez au plan Standard ou supérieur.',
            upgradeRequired: true,
            featureRequired: 'can_accept_online_orders'
          };
        }

        return { canProceed: true };
      })
    );
  }

  /**
   * Vérifier si les réservations sont autorisées
   */
  canAcceptReservations(): Observable<LimitCheckResponse> {
    return this.getCurrentLimits().pipe(
      map(limits => {
        if (!limits.can_accept_reservations) {
          return {
            canProceed: false,
            error: 'Votre plan ne permet pas les réservations. Passez au plan Premium.',
            upgradeRequired: true,
            featureRequired: 'can_accept_reservations'
          };
        }

        return { canProceed: true };
      })
    );
  }

  /**
   * Vérifier si les commandes spéciales sont autorisées
   */
  canAcceptSpecialOrders(): Observable<LimitCheckResponse> {
    return this.getCurrentLimits().pipe(
      map(limits => {
        if (!limits.can_accept_special_orders) {
          return {
            canProceed: false,
            error: 'Votre plan ne permet pas les commandes spéciales. Passez au plan Premium.',
            upgradeRequired: true,
            featureRequired: 'can_accept_special_orders'
          };
        }

        return { canProceed: true };
      })
    );
  }

  /**
   * Vérifier si on peut accepter plus de commandes ce mois
   */
  canAcceptMoreOrders(): Observable<LimitCheckResponse> {
    return this.getCurrentLimits().pipe(
      map(limits => {
        if (limits.max_orders_per_month === null) {
          return { canProceed: true };
        }

        if ((limits.current_orders || 0) >= limits.max_orders_per_month) {
          return {
            canProceed: false,
            error: `Limite de commandes mensuelle atteinte (${limits.max_orders_per_month}). Passez à un plan supérieur.`,
            limit: limits.max_orders_per_month,
            current: limits.current_orders,
            upgradeRequired: true
          };
        }

        return { canProceed: true };
      })
    );
  }

  /**
   * Gérer les erreurs HTTP liées aux limites
   */
  handleLimitError(error: HttpErrorResponse): string {
    if (error.status === 403 && error.error) {
      if (error.error.upgrade_required) {
        return error.error.error || 'Limite atteinte. Veuillez passer à un plan supérieur.';
      }
      return error.error.error || 'Fonctionnalité non disponible avec votre plan actuel.';
    }
    return 'Une erreur est survenue.';
  }

  private handleError(error: HttpErrorResponse) {
    console.error('Erreur SubscriptionLimitsService:', error);
    return throwError(() => error);
  }
}