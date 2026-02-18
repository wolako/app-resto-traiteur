import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable, catchError, tap } from 'rxjs';
import { Reservation } from '../../models/reservation.model';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class ReservationService {

  constructor(private http: HttpClient) {}

  createReservation(reservation: Omit<Reservation, 'id'>): Observable<Reservation> {
    return this.http.post<any>(`${environment.apiUrl}/reservations`, reservation).pipe(
      map(response => response.data)
    );
  }

  getRestaurantReservations(restaurantId: number): Observable<Reservation[]> {
    return this.http.get<any>(`${environment.apiUrl}/reservations/restaurants/${restaurantId}`).pipe(
      map(response => response.data)
    );
  }

  updateReservationStatus(reservationId: number, status: string): Observable<Reservation> {
    return this.http.patch<any>(`${environment.apiUrl}/reservations/${reservationId}/status`, { status }).pipe(
      map(response => response.data)
    );
  }

  getAvailableTimeSlots(restaurantId: number, date: string): Observable<string[]> {
    console.log('🔍 Fetching slots for restaurant:', restaurantId, 'date:', date);
    
    return this.http.get<any>(`${environment.apiUrl}/reservations/restaurants/${restaurantId}/available-slots`, {
      params: { date }
    }).pipe(
      tap(response => console.log('📥 Raw API response:', response)),
      map(response => {
        // Le backend renvoie { success: true, data: [...] }
        const slots = response.data || [];
        console.log('✅ Extracted slots:', slots);
        return slots;
      }),
      catchError(error => {
        console.error('❌ Error fetching slots:', error);
        throw error;
      })
    );
  }
}