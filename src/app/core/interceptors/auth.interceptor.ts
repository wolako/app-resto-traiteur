// core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

const PUBLIC_URL_PATTERNS = [
  '/notifications/unread-count',
  '/notifications',
  '/chat/conversations',
  '/chat/messages',
  '/public/',
  '/analytics/track',
  '/businesses/public',
  '/reviews/public',
];

const NO_REDIRECT_PATHS = [
  '/login',
  '/business/login',
  '/admin/login',
  '/driver/login',
  '/register',
  '/',
  '/profil/',
  '/menu/',
  '/reservation',
  '/special-order',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  const isGuestRoute =
    (req.url.includes('/chat/conversations') && req.method === 'POST') ||
    (req.url.includes('/chat/conversations/') && req.url.includes('/messages') && req.method === 'GET');

  const isPublicUrl = PUBLIC_URL_PATTERNS.some(pattern => req.url.includes(pattern));

  let headers = req.headers.set('ngrok-skip-browser-warning', 'true');

  if (token && !isGuestRoute) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const authReq = req.clone({ headers });

  return next(authReq).pipe(
    catchError((error) => {
      if (error.status === 401) {

        if (isGuestRoute) {
          return throwError(() => error);
        }

        const currentPath = router.url;
        const isOnPublicPage = NO_REDIRECT_PATHS.some(path =>
          currentPath === path || currentPath.startsWith(path)
        );

        if (token && !isPublicUrl && !isOnPublicPage) {
          console.warn('401 - Session expirée');

          // ✅ Lire le rôle AVANT de nettoyer le localStorage
          let redirectPath = '/login';
          try {
            const user = JSON.parse(localStorage.getItem('user') || '{}');
            const role = user?.role;

            if (role === 'restaurant' || role === 'traiteur') {
              redirectPath = '/business/login';
            } else if (role === 'superadmin') {
              redirectPath = '/admin/login';
            } else if (role === 'driver') {
              redirectPath = '/driver/login';
            } else {
              redirectPath = '/login';
            }
          } catch {
            redirectPath = '/login';
          }

          // Nettoyer APRÈS avoir lu le rôle
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('business');

          router.navigate([redirectPath], {
            queryParams: { reason: 'session_expired' }
          });
        } else {
          console.debug('401 ignoré (pas de session active ou page publique)', req.url);
        }
      }

      return throwError(() => error);
    })
  );
};