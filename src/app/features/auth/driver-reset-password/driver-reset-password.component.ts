import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-driver-reset-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './driver-reset-password.component.html',
  styleUrls: ['../driver-login/driver-login.component.scss']
})
export class DriverResetPasswordComponent implements OnInit {
  token = '';
  newPassword = '';
  confirmPassword = '';
  loading = false;
  verifying = true;
  tokenValid = false;
  errorMsg = '';
  success = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private authService: AuthService
  ) {}

  ngOnInit(): void {
    this.token = this.route.snapshot.params['token'];
    if (!this.token) {
      this.verifying = false;
      this.errorMsg = 'Lien invalide';
      return;
    }
    this.authService.verifyResetToken(this.token).subscribe({
      next: () => { this.verifying = false; this.tokenValid = true; },
      error: () => {
        this.verifying = false;
        this.tokenValid = false;
        this.errorMsg = 'Ce lien a expiré ou est invalide. Demandez-en un nouveau.';
      }
    });
  }

  submit(): void {
    if (this.newPassword.length < 6) {
      this.errorMsg = 'Minimum 6 caractères';
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.errorMsg = 'Les mots de passe ne correspondent pas';
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.authService.resetPassword(this.token, this.newPassword).subscribe({
      next: () => {
        this.loading = false;
        this.success = true;
        setTimeout(() => this.router.navigate(['/driver/login'], { queryParams: { reason: 'password_reset' } }), 2000);
      },
      error: (err) => {
        this.loading = false;
        this.errorMsg = err.error?.message || 'Impossible de réinitialiser le mot de passe';
      }
    });
  }
}