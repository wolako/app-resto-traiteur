// admin-login.component.ts
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { LoginRequest } from '../../../core/models/user.model';

@Component({
  selector: 'app-admin-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './admin-login.component.html',
  styleUrls: ['./admin-login.component.scss']
})
export class AdminLoginComponent implements OnInit {
  loginForm!: FormGroup;
  hidePassword = true;
  loading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Vérifier si l'admin est déjà connecté
    if (this.authService.isLoggedIn() && this.authService.isAdmin()) {
      this.router.navigate(['/admin/dashboard']);
      return;
    }

    this.initializeForm();
  }

  initializeForm(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }

  togglePasswordVisibility(): void {
    this.hidePassword = !this.hidePassword;
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched(this.loginForm);
      return;
    }

    this.loading = true;
    this.errorMessage = '';

    const credentials: LoginRequest = {
      email: this.loginForm.value.email,
      password: this.loginForm.value.password
    };

    console.log('=== SUBMIT LOGIN ===');
    console.log('Credentials:', credentials);

    this.authService.adminLogin(credentials).subscribe({
      next: (response: any) => {
        console.log('=== COMPONENT RECEIVED RESPONSE ===');
        console.log('Response:', response);
        
        this.loading = false;
        
        // La réponse peut être dans response.data ou directement dans response
        const user = response.data?.user || response.user;
        
        console.log('User role:', user?.role);
        console.log('Is superadmin?', user?.role === 'superadmin');
        console.log('AuthService isLoggedIn:', this.authService.isLoggedIn());
        console.log('AuthService isAdmin:', this.authService.isAdmin());
        
        // Vérifier que l'utilisateur est bien un superadmin
        if (user && user.role === 'superadmin') {
          console.log('✅ Navigating to /admin/dashboard');
          
          // Utiliser navigateByUrl pour forcer la navigation
          this.router.navigateByUrl('/admin/dashboard').then(
            (success) => {
              console.log('Navigation success:', success);
              if (!success) {
                console.error('❌ Navigation failed!');
                // Vérifier les guards
                console.log('Checking guards...');
                console.log('isLoggedIn:', this.authService.isLoggedIn());
                console.log('getCurrentUser:', this.authService.getCurrentUser());
                console.log('hasRole(superadmin):', this.authService.hasRole('superadmin'));
              }
            },
            (error) => {
              console.error('❌ Navigation error:', error);
            }
          );
        } else {
          console.error('❌ User is not superadmin');
          this.errorMessage = 'Accès refusé. Cette page est réservée aux administrateurs.';
          this.authService.logout();
        }
      },
      error: (error) => {
        console.error('=== LOGIN ERROR ===');
        console.error('Error:', error);
        console.error('Status:', error.status);
        console.error('Message:', error.error?.message);
        
        this.loading = false;
        
        if (error.status === 401) {
          this.errorMessage = 'Email ou mot de passe incorrect';
        } else if (error.status === 403) {
          this.errorMessage = 'Accès non autorisé. Vous n\'êtes pas administrateur.';
        } else if (error.error?.message) {
          this.errorMessage = error.error.message;
        } else {
          this.errorMessage = 'Une erreur est survenue. Veuillez réessayer.';
        }
      }
    });
  }

  private markFormGroupTouched(formGroup: FormGroup): void {
    Object.keys(formGroup.controls).forEach(key => {
      const control = formGroup.get(key);
      control?.markAsTouched();

      if (control instanceof FormGroup) {
        this.markFormGroupTouched(control);
      }
    });
  }

  getErrorMessage(fieldName: string): string {
    const control = this.loginForm.get(fieldName);
    
    if (control?.hasError('required')) {
      return 'Ce champ est requis';
    }
    
    if (control?.hasError('email')) {
      return 'Email invalide';
    }
    
    if (control?.hasError('minlength')) {
      return 'Le mot de passe doit contenir au moins 6 caractères';
    }
    
    return '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.loginForm.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }
}