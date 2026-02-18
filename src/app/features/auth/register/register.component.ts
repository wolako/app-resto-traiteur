import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.scss']
})
export class RegisterComponent implements OnInit {
  registerForm!: FormGroup;
  loading = false;
  error = '';
  showBusinessFields = false;
  showPassword = false;
  showConfirmPassword = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.initializeForm();
  }

  private initializeForm(): void {
    this.registerForm = this.fb.group({
      first_name: ['', Validators.required],
      last_name: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phone: [''],
      password: ['', [
        Validators.required, 
        Validators.minLength(8),
        this.passwordStrengthValidator
      ]],
      confirmPassword: ['', Validators.required],
      role: ['', Validators.required],
      business_name: ['']
    }, { validators: this.passwordMatchValidator });
  }

  // Validateur personnalisé pour la force du mot de passe
  passwordStrengthValidator(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    if (!value) return null;

    const hasUpperCase = /[A-Z]/.test(value);
    const hasLowerCase = /[a-z]/.test(value);
    const hasNumeric = /[0-9]/.test(value);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value);

    const passwordValid = hasUpperCase && hasLowerCase && hasNumeric && hasSpecialChar;

    return !passwordValid ? { passwordStrength: true } : null;
  }

  // Validateur pour vérifier que les mots de passe correspondent
  passwordMatchValidator(form: AbstractControl): ValidationErrors | null {
    const password = form.get('password');
    const confirmPassword = form.get('confirmPassword');

    if (!password || !confirmPassword) return null;

    return password.value === confirmPassword.value ? null : { passwordMismatch: true };
  }

  // Méthodes pour vérifier les exigences du mot de passe
  hasMinLength(): boolean {
    const password = this.registerForm.get('password')?.value;
    return password ? password.length >= 8 : false;
  }

  hasUpperCase(): boolean {
    const password = this.registerForm.get('password')?.value;
    return password ? /[A-Z]/.test(password) : false;
  }

  hasLowerCase(): boolean {
    const password = this.registerForm.get('password')?.value;
    return password ? /[a-z]/.test(password) : false;
  }

  hasNumber(): boolean {
    const password = this.registerForm.get('password')?.value;
    return password ? /[0-9]/.test(password) : false;
  }

  hasSpecialChar(): boolean {
    const password = this.registerForm.get('password')?.value;
    return password ? /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) : false;
  }

  togglePasswordVisibility(field: 'password' | 'confirmPassword'): void {
    if (field === 'password') {
      this.showPassword = !this.showPassword;
    } else {
      this.showConfirmPassword = !this.showConfirmPassword;
    }
  }

  selectRole(role: string): void {
    console.log('Role sélectionné:', role); // Debug
    this.registerForm.patchValue({ role });
    
    // Afficher les champs business pour restaurant ET traiteur
    this.showBusinessFields = (role === 'restaurant' || role === 'traiteur');
    
    console.log('showBusinessFields:', this.showBusinessFields); // Debug
    
    if (this.showBusinessFields) {
      this.registerForm.get('business_name')?.setValidators(Validators.required);
    } else {
      this.registerForm.get('business_name')?.clearValidators();
      this.registerForm.get('business_name')?.setValue(''); // Réinitialiser la valeur
    }
    this.registerForm.get('business_name')?.updateValueAndValidity();
  }

  onSubmit(): void {
    if (this.registerForm.valid) {
      this.loading = true;
      this.error = '';
      
      const formData = { ...this.registerForm.value };
      delete formData.confirmPassword;
      
      if (formData.role === 'client') {
        delete formData.business_name;
        delete formData.business_type;
      } else if (formData.role === 'traiteur') {
        formData.business_type = 'traiteur';
        if (!formData.business_name || formData.business_name.trim() === '') {
          this.error = 'Le nom de l\'établissement est requis pour les traiteurs.';
          this.loading = false;
          return;
        }
      } else if (formData.role === 'restaurant') {
        formData.business_type = 'restaurant';
        if (!formData.business_name || formData.business_name.trim() === '') {
          this.error = 'Le nom de l\'établissement est requis pour les restaurants.';
          this.loading = false;
          return;
        }
      }
      
      this.authService.register(formData).subscribe({
        next: (response) => {
          this.loading = false;
          
          const user = response.data?.user || response.user;
          const role = user.role;
          const requiresEmailVerification = response.data?.requiresEmailVerification;
          
          // Si vérification email requise, rediriger vers la page de vérification
          if (requiresEmailVerification) {
            this.router.navigate(['/verification-needed'], {
              queryParams: {
                email: user.email,
                role: role
              }
            });
            return;
          }
          
          // Sinon, redirection normale selon le rôle
          switch (role) {
            case 'restaurant':
              this.router.navigate(['/restaurant/dashboard']);
              break;
            case 'traiteur':
              this.router.navigate(['/traiteur/dashboard']);
              break;
            case 'client':
              this.router.navigate(['/']);
              break;
            default:
              this.router.navigate(['/']);
          }
        },
        error: (error) => {
          this.loading = false;
          
          if (error.status === 409) {
            this.error = 'Cette adresse email est déjà utilisée. Veuillez vous connecter ou utiliser une autre adresse.';
          } else if (error.status === 400 && error.error?.errors) {
            const errorMessages = error.error.errors.map((e: any) => e.message).join(', ');
            this.error = `Erreur de validation : ${errorMessages}`;
          } else {
            this.error = error.error?.message || 'Erreur lors de l\'inscription. Veuillez réessayer.';
          }
        }
      });
    } else {
      Object.keys(this.registerForm.controls).forEach(key => {
        this.registerForm.get(key)?.markAsTouched();
      });
      
      this.error = 'Veuillez remplir tous les champs requis correctement.';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }
}