// features/auth/driver-login/driver-login.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-driver-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './driver-login.component.html',
  styleUrls: ['./driver-login.component.scss']
})
export class DriverLoginComponent implements OnInit {
  phone    = '';
  password = '';
  loading  = false;
  errorMsg = '';
  showPassword = false;
  sessionExpiredMessage = false;
  
  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    // Si déjà connecté en tant que livreur → rediriger directement
    const user = this.authService.getCurrentUser();
    if (user?.role === 'driver') {
      this.router.navigate(['/driver/dashboard']);
    }
  }

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['reason'] === 'session_expired') {
        this.sessionExpiredMessage = true;
      }
    });
  }

  login(): void {
    if (!this.phone.trim() || !this.password.trim()) {
      this.errorMsg = 'Veuillez renseigner votre numéro de téléphone et votre mot de passe';
      return;
    }

    this.loading  = true;
    this.errorMsg = '';

    // Utilise l'endpoint existant avec phone
    this.authService.login({ phone: this.phone.trim(), password: this.password } as any).subscribe({
      next: (res: any) => {
        this.loading = false;
        const user = res.data?.user || res.user;

        if (user?.role !== 'driver') {
          // Déconnecter si ce n'est pas un livreur
          this.authService.logout();
          this.errorMsg = 'Ce portail est réservé aux livreurs. Utilisez la page de connexion principale.';
          return;
        }

        this.router.navigate(['/driver/dashboard']);
      },
      error: (err: any) => {
        this.loading = false;
        const msg = err.error?.message || err.error?.error || '';
        if (msg.toLowerCase().includes('mot de passe') || msg.toLowerCase().includes('password')) {
          this.errorMsg = 'Numéro ou mot de passe incorrect';
        } else if (msg.toLowerCase().includes('désactivé') || msg.toLowerCase().includes('disabled')) {
          this.errorMsg = 'Votre compte a été désactivé. Contactez votre établissement.';
        } else {
          this.errorMsg = 'Connexion impossible. Vérifiez vos identifiants.';
        }
      }
    });
  }
}