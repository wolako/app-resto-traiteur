import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

// Routes qui peuvent légitimement retourner 401 sans déclencher de redirection
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

// Pages sur lesquelles on ne redirige jamais vers login
const NO_REDIRECT_PATHS = [
  '/login',
  '/register',
  '/',
  '/profil/',
  '/menu/',
  '/reservation',
  '/special-order',
  '/traiteurs',
  '/restaurants',
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('token');

  const isGuestRoute =
    (req.url.includes('/chat/conversations') && req.method === 'POST') ||
    (req.url.includes('/chat/conversations/') && req.url.includes('/messages') && req.method === 'GET');

  // ✅ Vérifier si l'URL est une route publique qui peut retourner 401
  const isPublicUrl = PUBLIC_URL_PATTERNS.some(pattern => req.url.includes(pattern));

  // ✅ Headers de base
  let headers = req.headers.set('ngrok-skip-browser-warning', 'true');

  if (token && !isGuestRoute) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  const authReq = req.clone({ headers });

  return next(authReq).pipe(
    catchError((error) => {
      if (error.status === 401) {

        if (isGuestRoute) {
          console.error('❌ Erreur 401 sur route invité');
          return throwError(() => error);
        }

        // ✅ Ne rediriger que si :
        // 1. L'utilisateur avait un token (était connecté)
        // 2. La route n'est pas publique
        // 3. On n'est pas déjà sur une page publique
        const currentPath = router.url;
        const isOnPublicPage = NO_REDIRECT_PATHS.some(path =>
          currentPath === path || currentPath.startsWith(path)
        );

        if (token && !isPublicUrl && !isOnPublicPage) {
          console.warn('401 - Session expirée, redirection vers login');
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('business');
          router.navigate(['/login']);
        } else {
          // 401 sans token ou sur page publique : ignorer silencieusement
          console.debug('401 ignoré (pas de session active ou page publique)', req.url);
        }
      }

      return throwError(() => error);
    })
  );
};