import { Routes } from '@angular/router';
import { HomeComponent } from './features/home/home.component';
import { AdminDashboardComponent } from './features/admin/admin-dashboard/admin-dashboard.component';
import { RestaurantDashboardComponent } from './features/restaurant/restaurant-dashboard/restaurant-dashboard.component';
import { roleGuard } from './core/guards/role/role.guard';
import { authGuard } from './core/guards/auth/auth.guard';
import { TraiteurDashboardComponent } from './features/traiteur/traiteur-dashboard/traiteur-dashboard.component';
import { ReservationFormComponent } from './features/reservations/reservation-form/reservation-form.component';
import { CheckoutComponent } from './features/orders/checkout/checkout.component';
import { RegisterComponent } from './features/auth/register/register.component';
import { LoginComponent } from './features/auth/login/login.component';
import { AdminLoginComponent } from './features/auth/admin-login/admin-login.component';
import { SpecialOrderComponent } from './features/special-order/special-order.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';
import { VerifyEmailComponent } from './features/auth/verify-email/verify-email.component';
import { VerificationNeededComponent } from './features/auth/verification-needed/verification-needed.component';
import { ClientProfileComponent } from './features/client-profile/client-profile.component';

export const routes: Routes = [
  // ========================================
  // PUBLIC ROUTES
  // ========================================
  
  { 
    path: '', 
    component: HomeComponent,
    title: 'Accueil - Restaurant App'
  },
  
  // ========================================
  // AUTH ROUTES
  // ========================================
  
  { 
    path: 'login', 
    component: LoginComponent,
    title: 'Connexion - app_resto-traiteur'
  },
  { 
    path: 'register', 
    component: RegisterComponent,
    title: 'Inscription - app_resto-traiteur'
  },
  
  {
    path: 'admin/login',
    component: AdminLoginComponent,
    title: 'Connexion Admin - app_resto-traiteur'
  },

  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    title: 'Mot de passe oublié - app_resto-traiteur'
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    title: 'Réinitialiser le mot de passe - app_resto-traiteur'
  },
  
  {
    path: 'verification-needed',
    component: VerificationNeededComponent,
    title: 'Vérification requise - app_resto-traiteur'
  },
  {
    path: 'verify-email',
    component: VerifyEmailComponent,
    title: 'Vérification email - app_resto-traiteur'
  },
  
  // ========================================
  // CUSTOMER ROUTES (PUBLIC)
  // ========================================
  
  { 
    path: 'checkout', 
    component: CheckoutComponent,
    title: 'Paiement - app_resto-traiteur'
  },
  { 
    path: 'reservation', 
    component: ReservationFormComponent,
    title: 'Réservation - app_resto-traiteur'
  },
  {
    path: 'special-order/:id',
    component: SpecialOrderComponent,
    title: 'Commande Spéciale - Traiteur'
  },

  // ========================================
  // PROTECTED ROUTES - CLIENT
  // ========================================
  
  {
    path: 'client',
    canActivate: [authGuard, roleGuard],
    data: { role: 'client' },
    children: [
      {
        path: 'profile',
        component: ClientProfileComponent,
        title: 'Mon Profil - app_resto-traiteur'
      },
      {
        path: '',
        redirectTo: 'profile',
        pathMatch: 'full'
      }
    ]
  },

  // ========================================
  // PROTECTED ROUTES - RESTAURANT
  // ========================================
  
  {
    path: 'restaurant',
    canActivate: [authGuard, roleGuard],
    data: { role: 'restaurant' },
    children: [
      {
        path: 'dashboard',
        component: RestaurantDashboardComponent,
        title: 'Dashboard Restaurant - app_resto-traiteur'
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // ========================================
  // PROTECTED ROUTES - TRAITEUR
  // ========================================
  
  {
    path: 'traiteur',
    canActivate: [authGuard, roleGuard],
    data: { role: 'traiteur' },
    children: [
      {
        path: 'dashboard',
        component: TraiteurDashboardComponent,
        title: 'Dashboard Traiteur - app_resto-traiteur'
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // ========================================
  // PROTECTED ROUTES - ADMIN
  // ========================================
  
  {
    path: 'admin',
    canActivate: [authGuard, roleGuard],
    data: { role: 'superadmin' },
    children: [
      {
        path: 'dashboard',
        component: AdminDashboardComponent,
        title: 'Dashboard Admin - app_resto-traiteur'
      },
      {
        path: 'plans',
        loadComponent: () => import('./features/admin/plans-management/plans-management.component')
          .then(m => m.PlansManagementComponent),
        title: 'Gestion des Plans - Admin'
      },
      {
        path: 'commissions',
        loadComponent: () => import('./features/admin/commissions-management/commissions-management.component')
          .then(m => m.CommissionsManagementComponent),
        title: 'Gestion des Commissions - Admin'
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/admin/platform-settings/platform-settings.component')
            .then(m => m.PlatformSettingsComponent),
        title: 'Paramètres de la Plateforme - Admin'
      },
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      }
    ]
  },

  // ========================================
  // PAGES INFORMATIVES
  // ========================================

  {
    path: 'about',
    loadComponent: () => import('./features/about/about.component')
      .then(m => m.AboutComponent),
    title: 'À Propos - RestoTraiteur'
  },
  {
    path: 'faq',
    loadComponent: () => import('./features/faq/faq.component')
      .then(m => m.FaqComponent),
    title: 'FAQ - RestoTraiteur'
  },
  {
    path: 'contact',
    loadComponent: () => import('./features/contact/contact.component')
      .then(m => m.ContactComponent),
    title: 'Contact - RestoTraiteur'
  },

  // ========================================
  // PAGES LÉGALES
  // ========================================

  {
    path: 'legal',
    children: [
      {
        path: 'mentions-legales',
        loadComponent: () => import('./features/legal/legal-notice/legal-notice.component')
          .then(m => m.LegalNoticeComponent),
        title: 'Mentions Légales - RestoTraiteur'
      },
      {
        path: 'politique-confidentialite',
        loadComponent: () => import('./features/legal/privacy-policy/privacy-policy.component')
          .then(m => m.PrivacyPolicyComponent),
        title: 'Politique de Confidentialité - RestoTraiteur'
      },
      {
        path: 'conditions-utilisation',
        loadComponent: () => import('./features/legal/terms-of-service/terms-of-service.component')
          .then(m => m.TermsOfServiceComponent),
        title: 'Conditions d\'Utilisation - RestoTraiteur'
      },
      {
        path: 'conditions-vente',
        loadComponent: () => import('./features/legal/terms-of-sale/terms-of-sale.component')
          .then(m => m.TermsOfSaleComponent),
        title: 'Conditions de Vente - RestoTraiteur'
      },
      {
        path: '',
        redirectTo: 'mentions-legales',
        pathMatch: 'full'
      }
    ]
  },

  // ========================================
  // FALLBACK ROUTE - 404
  // ========================================
  
  { 
    path: '**', 
    redirectTo: '',
    pathMatch: 'full'
  }
];