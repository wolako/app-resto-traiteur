import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';

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
  showPassword = false; // Nouvelle variable pour contrôler la visibilité

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required]
    });
  }

  // Nouvelle méthode pour basculer la visibilité du mot de passe
  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  onSubmit(): void {
    if (this.loginForm.valid) {
      this.loading = true;
      this.error = '';
      
      console.log('Login attempt with:', this.loginForm.value); // Debug
      
      this.authService.login(this.loginForm.value).subscribe({
        next: (response) => {
          console.log('Login response:', response); // Debug
          
          // Gérer les deux structures de réponse possibles
          const user = response.data?.user || response.user;
          const role = user?.role;
          
          console.log('User role:', role); // Debug
          
          // Bloquer les superadmins sur le login public
          if (role === 'superadmin') {
            this.loading = false;
            this.authService.logout();
            this.error = 'Accès refusé. Les administrateurs doivent utiliser la page de connexion dédiée.';
            
            setTimeout(() => {
              this.router.navigate(['/admin/login']);
            }, 2000);
            return;
          }
          
          this.loading = false;
          
          // Redirection basée sur le rôle
          console.log('Redirecting based on role:', role); // Debug
          
          switch (role) {
            case 'restaurant':
              console.log('Navigating to restaurant dashboard'); // Debug
              this.router.navigate(['/restaurant/dashboard']);
              break;
            case 'traiteur':
              console.log('Navigating to traiteur dashboard'); // Debug
              this.router.navigate(['/traiteur/dashboard']);
              break;
            case 'client':
              console.log('Navigating to home'); // Debug
              this.router.navigate(['/client/profile']);
              break;
            default:
              console.log('Default navigation to home'); // Debug
              this.router.navigate(['/']);
          }
        },
        error: (error) => {
          console.error('Login error:', error); // Debug
          this.loading = false;
          
          if (error.status === 401) {
            this.error = 'Email ou mot de passe incorrect';
          } else if (error.error?.message) {
            this.error = error.error.message;
          } else {
            this.error = 'Une erreur est survenue. Veuillez réessayer.';
          }
        }
      });
    } else {
      // Marquer les champs comme touchés pour afficher les erreurs
      Object.keys(this.loginForm.controls).forEach(key => {
        this.loginForm.get(key)?.markAsTouched();
      });
    }
  }
}