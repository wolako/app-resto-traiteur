import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from '../../../../environments/environment';

export interface AppSetting {
  id: number;
  key: string;
  value: string;
  value_type: 'string' | 'number' | 'boolean' | 'json';
  category: string;
  description: string;
  is_public: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class SettingsService {
  private apiUrl = `${environment.apiUrl}/settings`;
  private settingsSubject = new BehaviorSubject<AppSetting[]>([]);
  public settings$ = this.settingsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadPublicSettings();
  }

  loadPublicSettings(): void {
    this.http.get<AppSetting[]>(`${this.apiUrl}/public`).subscribe({
      next: settings => this.settingsSubject.next(settings),
      error: err => console.warn('Impossible de charger les paramètres publics:', err)
    });
  }

  getAllSettings(): Observable<AppSetting[]> {
    return this.http.get<AppSetting[]>(this.apiUrl);
  }

  getSettingByKey(key: string): Observable<AppSetting> {
    return this.http.get<AppSetting>(`${this.apiUrl}/${key}`);
  }

  getSettingsByCategory(category: string): Observable<AppSetting[]> {
    return this.http.get<AppSetting[]>(`${this.apiUrl}/category/${category}`);
  }

  updateSetting(key: string, value: any): Observable<AppSetting> {
    return this.http.put<AppSetting>(`${this.apiUrl}/${key}`, { value }).pipe(
      tap(() => this.loadPublicSettings()) // ✅ déjà correct
    );
  }

  createSetting(setting: Partial<AppSetting>): Observable<AppSetting> {
    return this.http.post<AppSetting>(this.apiUrl, setting).pipe(
      tap(() => this.loadPublicSettings()) // ✅ AJOUT
    );
  }

  deleteSetting(key: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/${key}`).pipe(
      tap(() => this.loadPublicSettings()) // ✅ AJOUT
    );
  }

  // Helpers pour récupérer des valeurs typées
  getSetting(key: string, defaultValue: any = null): any {
    const settings = this.settingsSubject.value;
    const setting = settings.find(s => s.key === key);
    if (!setting) return defaultValue; // ✅ AJOUT du defaultValue

    switch (setting.value_type) {
      case 'number':  return parseFloat(setting.value);
      case 'boolean': return setting.value === 'true';
      case 'json':
        try { return JSON.parse(setting.value); } catch { return defaultValue; }
      default: return setting.value;
    }
  }
}