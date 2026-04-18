import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { environment } from '../../../../environments/environment';

export interface MaintenanceStatus {
  enabled: boolean;
  message: string;
  end_time: string | null;
}

@Injectable({ providedIn: 'root' })
export class MaintenanceService {
  private apiUrl = `${environment.apiUrl}/settings`;

  private maintenanceStatusSubject = new BehaviorSubject<MaintenanceStatus>({
    enabled:  false,
    message:  '',
    end_time: null,
  });

  public maintenanceStatus$ = this.maintenanceStatusSubject.asObservable();

  constructor(private http: HttpClient) {
    this.initMaintenanceCheck();
  }

  private initMaintenanceCheck(): void {
    this.checkMaintenanceStatus();
    // ✅ Polling toutes les 30s (le serveur répond avec Cache-Control: max-age=15)
    // Angular HttpClient respecte ce cache → moins de requêtes réelles à la DB
    interval(30000).subscribe(() => this.checkMaintenanceStatus());
  }

  checkMaintenanceStatus(): void {
    // ✅ Ajout de Cache-Control: no-cache sur la REQUÊTE pour forcer un rafraîchissement
    // quand c'est vraiment nécessaire (ex: après un toggle maintenance par l'admin)
    this.http
      .get<MaintenanceStatus>(`${this.apiUrl}/maintenance/status`)
      .subscribe({
        next:  (status) => this.maintenanceStatusSubject.next(status),
        error: (err)    => console.error('Erreur vérification maintenance:', err),
      });
  }

  getMaintenanceStatus(): Observable<MaintenanceStatus> {
    return this.http.get<MaintenanceStatus>(`${this.apiUrl}/maintenance/status`);
  }

  toggleMaintenance(enabled: boolean, message?: string, endTime?: string): Observable<any> {
    return this.http.post(`${this.apiUrl}/maintenance/toggle`, {
      enabled,
      message,
      end_time: endTime,
    });
  }

  isUserAdmin(): boolean {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      const user = JSON.parse(userStr);
      return user?.role === 'superadmin';
    } catch {
      return false;
    }
  }
}