import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

@Component({
  selector: 'app-business-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './business-login.component.html',
  styleUrl: './business-login.component.scss'
})
export class BusinessLoginComponent implements OnInit {
  loginForm!: FormGroup;
  loading = false;
  error = '';
  showPassword = false;
  sessionExpiredMessage = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['reason'] === 'session_expired') {
        this.sessionExpiredMessage = true;
      }
    });
    
    // Rediriger si déjà connecté en tant qu'établissement
    const user = this.authService.getCurrentUser();
    if (user?.role === 'restaurant') {
      this.router.navigate(['/restaurant/dashboard']);
      return;
    }
    if (user?.role === 'traiteur') {
      this.router.navigate(['/traiteur/dashboard']);
      return;
    }

    this.loginForm = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      this.error = '';

      this.authService.login(this.loginForm.value).subscribe({
        next: (response) => {
          const user = response.data?.user || response.user;
          const role = user?.role;

          // Bloquer les clients et admins sur cette interface
          if (role === 'client') {
            this.loading = false;
            this.authService.logout();
            this.error = 'Ce compte client n\'est pas autorisé ici. Utilisez la connexion client.';
            return;
          }

          if (role === 'superadmin') {
            this.loading = false;
            this.authService.logout();
            this.error = 'Les administrateurs doivent utiliser la page de connexion dédiée.';
            setTimeout(() => this.router.navigate(['/admin/login']), 2000);
            return;
          }

          this.loading = false;

          switch (role) {
            case 'restaurant':
              this.router.navigate(['/restaurant/dashboard']);
              break;
            case 'traiteur':
              this.router.navigate(['/traiteur/dashboard']);
              break;
            default:
              this.router.navigate(['/']);
          }
        },
        error: (error) => {
          this.loading = false;
          if (error.status === 401) {
            this.error = 'Email ou mot de passe incorrect';
          } else if (error.status === 403) {
            this.error = 'Votre compte est désactivé. Contactez le support.';
          } else {
            this.error = error.error?.message || 'Une erreur est survenue. Veuillez réessayer.';
          }
        }
      });
    } else {
      Object.keys(this.loginForm.controls).forEach(key =>
        this.loginForm.get(key)?.markAsTouched()
      );
    }
  }
}