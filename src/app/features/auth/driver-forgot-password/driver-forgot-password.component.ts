import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-driver-forgot-password',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './driver-forgot-password.component.html',
  styleUrls: ['../driver-login/driver-login.component.scss']
})
export class DriverForgotPasswordComponent {
  email = '';
  loading = false;
  sent = false;
  errorMsg = '';

  constructor(private authService: AuthService, private router: Router) {}

  submit(): void {
    if (!this.email.trim()) {
      this.errorMsg = 'Veuillez renseigner votre adresse email';
      return;
    }
    this.loading = true;
    this.errorMsg = '';
    this.authService.requestPasswordReset(this.email.trim()).subscribe({
      next: () => {
        this.loading = false;
        this.sent = true; // toujours succès générique (sécurité — ne révèle pas si l'email existe)
      },
      error: () => {
        this.loading = false;
        this.sent = true; // même comportement même en cas d'erreur réseau côté affichage
      }
    });
  }
}