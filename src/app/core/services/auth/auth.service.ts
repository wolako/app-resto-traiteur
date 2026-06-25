import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse, LoginRequest, RegisterRequest, User } from '../../models/user.model';
import { environment } from '../../../../environments/environment';
import { NotificationService } from '../notification/notification.service';
import { ChatService } from '../chat/chat.service';

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(
    private http: HttpClient,
    private notificationService: NotificationService,
    private chatService: ChatService
  ) {
    const token = localStorage.getItem('token');
    const user  = localStorage.getItem('user');

    let parsedUser: User | null = null;
    try {
      parsedUser = user ? JSON.parse(user) : null;
    } catch (e) {
      console.warn('User in localStorage is invalid, clearing it.', e);
      localStorage.removeItem('user');
      localStorage.removeItem('token');
    }

    if (token && parsedUser) {
      this.currentUserSubject.next(parsedUser);
      this.notificationService.startPolling();
      this.chatService.connectSocket(token);            
      const business = this.getBusiness();
      if (business?.id) this.chatService.joinBusiness(business.id); 
    }
  }

  login(credentials: LoginRequest): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/auth/login`, credentials).pipe(
      tap(response => {
        const user     = response.data?.user     || response.user;
        const token    = response.data?.token    || response.token;
        const business = response.data?.business || response.business;

        if (token && user) {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
          if (business) {
            localStorage.setItem('business', JSON.stringify(business));
          }
          this.currentUserSubject.next(user);
          this.notificationService.startPolling();
          this.chatService.connectSocket(token);          
          if (business?.id) this.chatService.joinBusiness(business.id);
        }
      })
    );
  }

  adminLogin(credentials: LoginRequest): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/auth/admin/login`, credentials).pipe(
      tap(response => {
        console.log('Admin login response:', response);

        const user     = response.data?.user     || response.user;
        const token    = response.data?.token    || response.token;
        const business = response.data?.business || response.business;

        if (user && user.role === 'superadmin' && token) {
          localStorage.setItem('token', token);
          localStorage.setItem('user', JSON.stringify(user));
          if (business) {
            localStorage.setItem('business', JSON.stringify(business));
          }
          this.currentUserSubject.next(user);
          this.notificationService.startPolling();
          this.chatService.connectSocket(token);          
          if (business?.id) this.chatService.joinBusiness(business.id);
          console.log('User set in BehaviorSubject:', user);
        } else {
          console.error('Invalid admin login response or user is not superadmin');
        }
      })
    );
  }

  isAdmin(): boolean {
    return this.hasRole('superadmin');
  }

  register(userData: RegisterRequest): Observable<any> {
    return this.http.post<any>(`${environment.apiUrl}/auth/register`, userData).pipe(
      tap(response => {
        const user     = response.data?.user || response.user;
        const business = response.data?.business || response.business;

        localStorage.setItem('pendingVerification', JSON.stringify({
          email:         user.email,
          role:          user.role,
          business_name: business?.name,
        }));
        // Pas de startPolling ici — l'utilisateur n'est pas encore connecté
      })
    );
  }

  logout(): void {
    // ✅ Arrêter le polling avant de nettoyer
    this.notificationService.stopPolling();
    this.chatService.disconnectSocket(); 
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('business');
    localStorage.removeItem('pendingVerification');
    this.currentUserSubject.next(null);
  }

  // =============================================
  // RÉINITIALISATION DE MOT DE PASSE
  // =============================================

  requestPasswordReset(email: string): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/auth/password-reset/request`, { email }
    );
  }

  verifyResetToken(token: string): Observable<any> {
    return this.http.get<any>(
      `${environment.apiUrl}/auth/password-reset/verify/${token}`
    );
  }

  resetPassword(token: string, newPassword: string): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/auth/password-reset/reset`, { token, newPassword }
    );
  }

  // =============================================
  // MÉTHODES EXISTANTES
  // =============================================

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getBusiness(): any {
    const business = localStorage.getItem('business');
    if (business && business !== 'undefined') {
      try {
        return JSON.parse(business);
      } catch (e) {
        console.warn('Business in localStorage is invalid', e);
        return null;
      }
    }
    return null;
  }

  isLoggedIn(): boolean {
    return !!this.getToken() && !!this.getCurrentUser();
  }

  hasRole(role: string): boolean {
    const user = this.getCurrentUser();
    return user ? user.role === role : false;
  }

  // =============================================
  // VÉRIFICATION D'EMAIL
  // =============================================

  verifyEmail(token: string): Observable<any> {
    return this.http.get<any>(`${environment.apiUrl}/auth/verify-email/${token}`);
  }

  resendVerificationEmail(email: string): Observable<any> {
    return this.http.post<any>(
      `${environment.apiUrl}/auth/resend-verification`, { email }
    );
  }

  hasPendingVerification(): boolean {
    return !!localStorage.getItem('pendingVerification');
  }

  getPendingVerification(): { email: string; role: string } | null {
    const pending = localStorage.getItem('pendingVerification');
    if (pending) {
      try { return JSON.parse(pending); }
      catch (e) { return null; }
    }
    return null;
  }

  clearPendingVerification(): void {
    localStorage.removeItem('pendingVerification');
  }
}