import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  console.log('=== AUTH GUARD ===');
  console.log('Checking route:', state.url);
  console.log('isLoggedIn:', authService.isLoggedIn());
  console.log('getCurrentUser:', authService.getCurrentUser());

  if (authService.isLoggedIn()) {
    console.log('✅ Auth guard passed');
    return true;
  }

  console.log('❌ Auth guard failed, redirecting to /login');
  router.navigate(['/login']);
  return false;
};