import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './verify-email.component.html',
  styleUrl: './verify-email.component.scss'
})
export class VerifyEmailComponent implements OnInit {
  loading = true;
  success = false;
  errorMessage = '';
  token = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
      if (this.token) {
        this.verifyEmail();
      } else {
        this.loading = false;
        this.errorMessage = 'Token de vérification manquant';
      }
    });
  }

  verifyEmail(): void {
    this.authService.verifyEmail(this.token).subscribe({
      next: (response) => {
        this.loading = false;
        this.success = true;
        
        // CORRECTION: Rediriger vers login après un délai
        setTimeout(() => {
          this.router.navigate(['/login'], {
            queryParams: { 
              emailVerified: true,
              email: response.data?.email 
            }
          });
        }, 3000); // Rediriger après 3 secondes
      },
      error: (error) => {
        this.loading = false;
        this.success = false;
        // CORRECTION: Meilleure gestion des erreurs
        if (error.status === 400) {
          this.errorMessage = error.error?.message || 'Token invalide ou expiré';
        } else if (error.status === 500) {
          this.errorMessage = 'Erreur serveur. Veuillez réessayer plus tard.';
        } else {
          this.errorMessage = error.error?.message || 'Erreur lors de la vérification de l\'email';
        }
        console.error('Email verification error:', error);
      }
    });
  }

  resendVerification(): void {
    const user = this.authService.getCurrentUser();
    if (user?.email) {
      this.authService.resendVerificationEmail(user.email).subscribe({
        next: () => {
          alert('Un nouvel email de vérification a été envoyé.');
        },
        error: (error) => {
          console.error('Resend verification error:', error);
          alert('Erreur lors de l\'envoi de l\'email. Veuillez réessayer.');
        }
      });
    } else {
      this.router.navigate(['/login']);
    }
  }

  // CORRECTION: Nouvelle méthode pour rediriger immédiatement
  redirectToLogin(): void {
    this.router.navigate(['/login'], {
      queryParams: { emailVerified: true }
    });
  }
}