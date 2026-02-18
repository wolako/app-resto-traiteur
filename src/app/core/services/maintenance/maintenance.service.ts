import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  end_time: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class MaintenanceService {
  private apiUrl = `${environment.apiUrl}/settings`;
  
  // Observable pour le statut de maintenance
  private maintenanceStatusSubject = new BehaviorSubject<MaintenanceStatus>({
    enabled: false,
    message: '',
    end_time: null
  });
  
  public maintenanceStatus$ = this.maintenanceStatusSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initMaintenanceCheck();
  }

  /**
   * Initialiser la vérification périodique du mode maintenance
   * Vérifie toutes les 30 secondes
   */
  private initMaintenanceCheck(): void {
    // Vérification initiale
    this.checkMaintenanceStatus();

    // Vérification toutes les 30 secondes
    interval(30000).subscribe(() => {
      this.checkMaintenanceStatus();
    });
  }

  /**
   * Vérifier le statut de maintenance
   */
  checkMaintenanceStatus(): void {
    this.http.get<MaintenanceStatus>(`${this.apiUrl}/maintenance/status`)
      .subscribe({
        next: (status) => {
          this.maintenanceStatusSubject.next(status);
        },
        error: (err) => {
          console.error('Erreur vérification maintenance:', err);
        }
      });
  }

  /**
   * Obtenir le statut actuel de maintenance
   */
  getMaintenanceStatus(): Observable<MaintenanceStatus> {
    return this.http.get<MaintenanceStatus>(`${this.apiUrl}/maintenance/status`);
  }

  /**
   * Activer/Désactiver le mode maintenance (admin seulement)
   */
  toggleMaintenance(enabled: boolean, message?: string, endTime?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/maintenance/toggle`, {
      enabled,
      message,
      end_time: endTime
    });
  }

  /**
   * Vérifier si l'utilisateur est un super admin
   */
  isUserAdmin(): boolean {
    const userStr = localStorage.getItem('user');
    if (!userStr) return false;
    
    try {
      const user = JSON.parse(userStr);
      return user.role === 'superadmin';
    } catch {
      return false;
    }
  }
}