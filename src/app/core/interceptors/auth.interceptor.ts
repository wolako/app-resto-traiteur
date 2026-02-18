// src/app/core/interceptors/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('token');
  
  // ✅ NE PAS AJOUTER LE TOKEN POUR LES ROUTES INVITÉS
  const isGuestRoute = 
    (req.url.includes('/chat/conversations') && req.method === 'POST') || // Créer conversation
    (req.url.includes('/chat/conversations/') && req.url.includes('/messages') && req.method === 'GET'); // Charger messages (pour invité)
  
  // Clone la requête et ajoute le token si disponible ET si pas une route invité
  let authReq = req;
  if (token && !isGuestRoute) {
    authReq = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }
  
  // Gestion des erreurs
  return next(authReq).pipe(
    catchError((error) => {
      // ✅ NE PAS REDIRIGER POUR LES ROUTES INVITÉS
      // Si erreur 401 (non autorisé) ET ce n'est pas une route invité
      if (error.status === 401 && !isGuestRoute) {
        console.warn('401 - Redirection vers login');
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('business');
        router.navigate(['/login']);
      }
      
      // Si erreur 401 sur route invité, juste logger sans rediriger
      if (error.status === 401 && isGuestRoute) {
        console.error('❌ Erreur 401 sur route invité - Le backend refuse les invités');
      }
      
      // Si erreur 403 (forbidden), rediriger vers l'accueil
      if (error.status === 403) {
        router.navigate(['/']);
      }
      
      return throwError(() => error);
    })
  );
};