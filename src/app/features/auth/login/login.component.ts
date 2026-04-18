import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent implements OnInit {
  loginForm!: FormGroup;
  loading = false;
  error = '';
  showPassword = false;
  loginMode: 'email' | 'phone' = 'email';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      identifier: ['', [Validators.required, this.identifierValidator.bind(this)]],
      password:   ['', Validators.required]
    });
  }

  private identifierValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;
    if (this.loginMode === 'email') {
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? null : { invalidEmail: true };
    }
    return /^\+?\d{8,15}$/.test(value.replace(/\s/g, '')) ? null : { invalidPhone: true };
  }

  switchMode(mode: 'email' | 'phone'): void {
    this.loginMode = mode;
    this.loginForm.get('identifier')?.setValue('');
    this.loginForm.get('identifier')?.updateValueAndValidity();
    this.error = '';
  }

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      Object.keys(this.loginForm.controls).forEach(key =>
        this.loginForm.get(key)?.markAsTouched()
      );
      return;
    }

    this.loading = true;
    this.error = '';

    const identifier = this.loginForm.value.identifier.trim();
    const credentials = {
      password: this.loginForm.value.password,
      ...(this.loginMode === 'email'
        ? { email: identifier }
        : { phone: identifier.replace(/\s/g, '') })
    };

    this.authService.login(credentials).subscribe({
      next: (response) => {
        const user = response.data?.user || response.user;
        const role = user?.role;

        // ── Rôles non autorisés sur cette page ───────────────────
        // Les établissements (restaurant / traiteur) et les superadmins
        // ont leur propre page de connexion dédiée.

        if (role === 'superadmin') {
          this.loading = false;
          this.authService.logout();
          this.error = 'Accès refusé. Les administrateurs doivent utiliser la page de connexion dédiée.';
          setTimeout(() => this.router.navigate(['/admin/login']), 2000);
          return;
        }

        if (role === 'restaurant' || role === 'traiteur') {
          this.loading = false;
          this.authService.logout();
          this.error = 'Cette page est réservée aux clients. Les établissements doivent utiliser la connexion partenaire.';
          setTimeout(() => this.router.navigate(['/business/login']), 2500);
          return;
        }

        // ── Seuls les clients sont autorisés ──────────────────────
        this.loading = false;
        if (role === 'client') {
          this.router.navigate(['/client/profile']);
        } else {
          this.router.navigate(['/']);
        }
      },
      error: (error) => {
        this.loading = false;
        if (error.status === 401) {
          this.error = this.loginMode === 'email'
            ? 'Email ou mot de passe incorrect'
            : 'Numéro de téléphone ou mot de passe incorrect';
        } else {
          this.error = error.error?.message || 'Une erreur est survenue. Veuillez réessayer.';
        }
      }
    });
  }
}