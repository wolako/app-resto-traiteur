import { inject } from '@angular/core';
import { CanActivateFn, Router, ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from '../../services/auth/auth.service';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const expectedRole = route.data['role'];
  const user = authService.getCurrentUser();

  console.log('=== ROLE GUARD ===');
  console.log('Expected role:', expectedRole);
  console.log('Current user:', user);
  console.log('User role:', user?.role);
  console.log('Match?', user?.role === expectedRole);

  // Si pas d'utilisateur, rediriger vers login
  if (!user) {
    console.log('❌ No user, redirecting to login');
    router.navigate(['/login']);
    return false;
  }

  // Si le rôle correspond, autoriser l'accès
  if (user.role === expectedRole) {
    console.log('✅ Role guard passed');
    return true;
  }

  // CORRECTION : Si le rôle ne correspond pas, rediriger vers la page appropriée
  // selon le rôle de l'utilisateur connecté (pas selon le rôle attendu)
  console.log('❌ Role guard failed - Wrong role');
  console.log('→ Redirecting user to their appropriate dashboard');

  switch (user.role) {
    case 'client':
      console.log('→ Redirecting to /client/profile');
      router.navigate(['/client/profile']);
      break;
    case 'restaurant':
      console.log('→ Redirecting to /restaurant/dashboard');
      router.navigate(['/restaurant/dashboard']);
      break;
    case 'traiteur':
      console.log('→ Redirecting to /traiteur/dashboard');
      router.navigate(['/traiteur/dashboard']);
      break;
    case 'superadmin':
      console.log('→ Redirecting to /admin/dashboard');
      router.navigate(['/admin/dashboard']);
      break;
    default:
      console.log('→ Unknown role, redirecting to home');
      router.navigate(['/']);
  }

  return false;
};