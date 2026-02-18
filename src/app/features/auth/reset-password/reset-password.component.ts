import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss'
})
export class ResetPasswordComponent implements OnInit {
  resetPasswordForm!: FormGroup;
  loading = false;
  error = '';
  success = '';
  token: string = '';
  tokenValid = false;
  checkingToken = true;
  userEmail = '';
  showPassword = false;
  showConfirmPassword = false;
  passwordReset = false;

  // Critères de validation du mot de passe
  passwordCriteria = {
    minLength: false,
    hasUpperCase: false,
    hasLowerCase: false,
    hasNumber: false,
    hasSpecialChar: false
  };

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    // Récupérer le token de l'URL
    this.route.queryParams.subscribe(params => {
      this.token = params['token'];
      
      if (!this.token) {
        this.error = 'Token manquant. Veuillez utiliser le lien reçu par email.';
        this.checkingToken = false;
        return;
      }

      // Vérifier la validité du token
      this.verifyToken();
    });

    // Initialiser le formulaire avec des validateurs renforcés
    this.resetPasswordForm = this.fb.group({
      newPassword: ['', [
        Validators.required, 
        Validators.minLength(8),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', [Validators.required]]
    }, { 
      validators: this.passwordMatchValidator 
    });

    // Surveiller les changements du mot de passe pour mettre à jour les critères
    this.resetPasswordForm.get('newPassword')?.valueChanges.subscribe(password => {
      this.updatePasswordCriteria(password);
    });
  }

  // Validateur de force du mot de passe
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    
    if (!value) {
      return null;
    }

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value);
    const isValidLength = value.length >= 8;

    const passwordValid = hasUpperCase && hasLowerCase && hasNumber && hasSpecialChar && isValidLength;

    if (!passwordValid) {
      return {
        passwordStrength: {
          hasUpperCase,
          hasLowerCase,
          hasNumber,
          hasSpecialChar,
          isValidLength
        }
      };
    }

    return null;
  }

  // Mettre à jour les critères d'affichage
  updatePasswordCriteria(password: string): void {
    this.passwordCriteria = {
      minLength: password?.length >= 8 || false,
      hasUpperCase: /[A-Z]/.test(password || ''),
      hasLowerCase: /[a-z]/.test(password || ''),
      hasNumber: /[0-9]/.test(password || ''),
      hasSpecialChar: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password || '')
    };
  }

  // Vérifier si tous les critères sont remplis
  get isPasswordStrong(): boolean {
    return Object.values(this.passwordCriteria).every(criterion => criterion === true);
  }

  verifyToken(): void {
    this.authService.verifyResetToken(this.token).subscribe({
      next: (response) => {
        this.tokenValid = true;
        this.checkingToken = false;
        this.userEmail = response.data?.email || '';
        console.log('Token valide pour:', this.userEmail);
      },
      error: (error) => {
        this.tokenValid = false;
        this.checkingToken = false;
        console.error('Token verification error:', error);
        
        if (error.error?.message) {
          this.error = error.error.message;
        } else {
          this.error = 'Le lien de réinitialisation est invalide ou a expiré.';
        }
      }
    });
  }

  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const newPassword = control.get('newPassword');
    const confirmPassword = control.get('confirmPassword');

    if (!newPassword || !confirmPassword) {
      return null;
    }

    return newPassword.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  togglePasswordVisibility(field: 'password' | 'confirm'): void {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  onSubmit(): void {
    if (this.resetPasswordForm.valid && this.tokenValid && this.isPasswordStrong) {
      this.loading = true;
      this.error = '';
      this.success = '';

      const newPassword = this.resetPasswordForm.value.newPassword;

      this.authService.resetPassword(this.token, newPassword).subscribe({
        next: (response) => {
          this.loading = false;
          this.passwordReset = true;
          this.success = response.message || 'Mot de passe réinitialisé avec succès';
          this.resetPasswordForm.reset();
          
          // Rediriger vers la page de connexion après 3 secondes
          setTimeout(() => {
            this.router.navigate(['/login'], {
              queryParams: { passwordReset: 'true' }
            });
          }, 3000);
        },
        error: (error) => {
          this.loading = false;
          console.error('Reset password error:', error);
          
          if (error.error?.message) {
            this.error = error.error.message;
          } else {
            this.error = 'Une erreur est survenue. Veuillez réessayer.';
          }
        }
      });
    } else {
      // Marquer tous les champs comme touchés pour afficher les erreurs
      Object.keys(this.resetPasswordForm.controls).forEach(key => {
        this.resetPasswordForm.get(key)?.markAsTouched();
      });
      
      // Si le mot de passe n'est pas assez fort
      if (!this.isPasswordStrong) {
        this.error = 'Veuillez respecter tous les critères de sécurité du mot de passe.';
      }
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }

  requestNewLink(): void {
    this.router.navigate(['/forgot-password']);
  }

  // Méthodes pour l'affichage de la force du mot de passe
  getPasswordStrengthPercentage(): number {
    const criteria = this.passwordCriteria;
    const totalCriteria = Object.keys(criteria).length;
    const metCriteria = Object.values(criteria).filter(Boolean).length;
    return (metCriteria / totalCriteria) * 100;
  }

  getPasswordStrengthClass(): string {
    const percentage = this.getPasswordStrengthPercentage();
    if (percentage <= 40) return 'weak';
    if (percentage <= 70) return 'medium';
    return 'strong';
  }

  getPasswordStrengthText(): string {
    const strengthClass = this.getPasswordStrengthClass();
    switch (strengthClass) {
      case 'weak': return 'Faible';
      case 'medium': return 'Moyen';
      case 'strong': return 'Fort';
      default: return 'Faible';
    }
  }
  
}