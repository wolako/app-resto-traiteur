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
import { BusinessLoginComponent } from './features/auth/business-login/business-login.component';
import { AdminLoginComponent } from './features/auth/admin-login/admin-login.component';
import { SpecialOrderComponent } from './features/special-order/special-order.component';
import { ForgotPasswordComponent } from './features/auth/forgot-password/forgot-password.component';
import { ResetPasswordComponent } from './features/auth/reset-password/reset-password.component';
import { VerifyEmailComponent } from './features/auth/verify-email/verify-email.component';
import { VerificationNeededComponent } from './features/auth/verification-needed/verification-needed.component';
import { ClientProfileComponent } from './features/client-profile/client-profile.component';
import { MenuPageComponent } from './features/menu-page/menu-page.component';
import { PayDepositComponent } from './features/orders/pay-deposit/pay-deposit.component';
import { DriverDashboardComponent } from './features/driver-dashboard/driver-dashboard.component';
import { DriverLoginComponent } from './features/auth/driver-login/driver-login.component';


export const routes: Routes = [
  // ========================================
  // PUBLIC ROUTES
  // ========================================
  
  { 
    path: '', 
    component: HomeComponent,
    title: 'Accueil - RestoTraiteur'
  },
  
  {
    path: 'menu/:id',
    component: MenuPageComponent,
    title: 'Menu - RestoTraiteur'
  },

  // ✅ Pages profil public (accessibles à tous, sans guard)
  {
    path: 'profil/restaurant/:id',
    loadComponent: () =>
      import('./features/restaurant/restaurant-profile/restaurant-profile.component')
        .then(m => m.RestaurantProfileComponent),
    title: 'Profil Restaurant - RestoTraiteur'
  },
  {
    path: 'profil/traiteur/:id',
    loadComponent: () =>
      import('./features/traiteur/traiteur-profile/traiteur-profile.component')
        .then(m => m.TraiteurProfileComponent),
    title: 'Profil Traiteur - RestoTraiteur'
  },
  
  // ========================================
  // AUTH ROUTES
  // ========================================
  
  { 
    path: 'login', 
    component: LoginComponent,
    title: 'Connexion - RestoTraiteur'
  },
  {
    path: 'business/login',
    component: BusinessLoginComponent,
    title: 'Connexion Établissement - RestoTraiteur'
  },
  {
    path: 'driver/login',
    component: DriverLoginComponent,
    title: 'Connexion Livreur - RestoTraiteur'
  },
  { 
    path: 'register', 
    component: RegisterComponent,
    title: 'Inscription - RestoTraiteur'
  },
  {
    path: 'admin/login',
    component: AdminLoginComponent,
    title: 'Connexion Admin - RestoTraiteur'
  },
  {
    path: 'forgot-password',
    component: ForgotPasswordComponent,
    title: 'Mot de passe oublié - RestoTraiteur'
  },
  {
    path: 'reset-password',
    component: ResetPasswordComponent,
    title: 'Réinitialiser le mot de passe - RestoTraiteur'
  },
  {
    path: 'verification-needed',
    component: VerificationNeededComponent,
    title: 'Vérification requise - RestoTraiteur'
  },
  {
    path: 'verify-email',
    component: VerifyEmailComponent,
    title: 'Vérification email - RestoTraiteur'
  },
  
  // ========================================
  // CUSTOMER ROUTES (PUBLIC)
  // ========================================
  
  { 
    path: 'checkout', 
    component: CheckoutComponent,
    title: 'Paiement - RestoTraiteur'
  },
  { 
    path: 'reservation', 
    component: ReservationFormComponent,
    title: 'Réservation - RestoTraiteur'
  },
  {
    path: 'special-order/:id',
    component: SpecialOrderComponent,
    title: 'Commande Spéciale - Traiteur'
  },
  {
    path: 'pay-deposit/:id',
    component: PayDepositComponent,
    title: 'Payer l\'acompte - RestoTraiteur'
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
        title: 'Mon Profil - RestoTraiteur'
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
        title: 'Dashboard Restaurant - RestoTraiteur'
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
        title: 'Dashboard Traiteur - RestoTraiteur'
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
        title: 'Dashboard Admin - RestoTraiteur'
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
// PROTECTED ROUTES - LIVREUR
// ========================================
{
  path: 'driver',
  canActivate: [authGuard, roleGuard],
  data: { role: 'driver' },
  children: [
    {
      path: 'dashboard',
      component: DriverDashboardComponent,
      title: 'Interface Livreur - RestoTraiteur'
    },
    {
      path: '',
      redirectTo: 'dashboard',
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