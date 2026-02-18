import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-verification-needed',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './verification-needed.component.html',
  styleUrl: './verification-needed.component.scss'
})
export class VerificationNeededComponent implements OnInit {
  email = '';
  role = '';
  resending = false;
  resendSuccess = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    // Récupérer l'email depuis les query params ou le localStorage pendingVerification
    this.route.queryParams.subscribe(params => {
      this.email = params['email'] || '';
      this.role = params['role'] || '';
    });

    if (!this.email) {
      const pending = this.authService.getPendingVerification();
      this.email = pending?.email || '';
      this.role = pending?.role || '';
    }

    if (!this.email) {
      this.router.navigate(['/']);
    }
  }

  resendEmail(): void {
    if (!this.email) return;

    this.resending = true;
    this.resendSuccess = false;

    this.authService.resendVerificationEmail(this.email).subscribe({
      next: () => {
        this.resending = false;
        this.resendSuccess = true;
        
        setTimeout(() => {
          this.resendSuccess = false;
        }, 5000);
      },
      error: (error) => {
        console.error('Error resending email:', error);
        this.resending = false;
        alert('Erreur lors de l\'envoi de l\'email. Veuillez réessayer.');
      }
    });
  }

  // CORRECTION: Rediriger vers login, pas vers dashboard
  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}