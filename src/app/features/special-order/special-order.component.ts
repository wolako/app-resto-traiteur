import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { OrderService } from '../../core/services/orders/order.service';
import { BusinessService } from '../../core/services/business/business.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { ToastService } from '../../core/services/toast/toast.service';

@Component({
  selector: 'app-special-order',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './special-order.component.html',
  styleUrls: ['./special-order.component.scss']
})
export class SpecialOrderComponent implements OnInit {
  orderForm!: FormGroup;
  traiteur: any = null;
  loading = false;
  success = false;
  minDate: string = '';
  isLoggedIn = false;
  currentUser: any = null;

  @ViewChild('successSection') successSection!: ElementRef;

  eventTypes = [
    { value: 'mariage', label: 'Mariage' },
    { value: 'anniversaire', label: 'Anniversaire' },
    { value: 'bapteme', label: 'Baptême' },
    { value: 'entreprise', label: 'Événement d\'entreprise' },
    { value: 'reception', label: 'Réception' },
    { value: 'autre', label: 'Autre' }
  ];

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private route: ActivatedRoute,
    private orderService: OrderService,
    private businessService: BusinessService,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.setMinDate();
    this.checkAuth();
    this.initializeForm();
    this.loadCaterer();
  }

  private setMinDate(): void {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    this.minDate = tomorrow.toISOString().split('T')[0];
  }

  private checkAuth(): void {
    this.isLoggedIn = this.authService.isLoggedIn();
    this.currentUser = this.authService.getCurrentUser();
  }

  private initializeForm(): void {
    // Valeurs par défaut pour éviter les champs vides
    const defaultName = this.currentUser 
      ? `${this.currentUser.first_name || ''} ${this.currentUser.last_name || ''}`.trim()
      : '';
    const defaultEmail = this.currentUser?.email || '';
    const defaultPhone = this.currentUser?.phone || '';

    this.orderForm = this.fb.group({
      // Informations client
      client_name: [defaultName, [Validators.required, Validators.minLength(2)]],
      client_email: [defaultEmail, [Validators.required, Validators.email]],
      client_phone: [defaultPhone, [Validators.required, Validators.pattern(/^[0-9]{8,15}$/)]],
      
      // Détails de la commande spéciale
      event_type: ['', Validators.required],
      event_date: ['', Validators.required],
      event_time: ['', Validators.required],
      number_of_guests: ['', [Validators.required, Validators.min(1)]],
      
      // Adresse de livraison
      delivery_address: ['', [Validators.required, Validators.minLength(5)]],
      city: ['', [Validators.required, Validators.minLength(2)]],
      
      // Détails du repas souhaité
      menu_preferences: ['', [Validators.required, Validators.minLength(10)]],
      dietary_restrictions: [''],
      special_requests: [''],
      
      // Budget estimé (optionnel)
      estimated_budget: ['', Validators.min(0)]
    });
  }

  private loadCaterer(): void {
    const traiteurId = this.route.snapshot.paramMap.get('id');
    if (traiteurId) {
      this.businessService.getBusinesses().subscribe({
        next: (response: any) => {
          const businesses = response.data || response;
          this.traiteur = businesses.find((b: any) => b.id === +traiteurId);
          
          if (!this.traiteur) {
            this.toastService.showError(
              'Traiteur introuvable',
              'Le traiteur demandé n\'a pas été trouvé'
            );
            this.router.navigate(['/']);
          }
        },
        error: (error) => {
          console.error('Error loading caterer:', error);
          this.toastService.showError(
            'Erreur de chargement',
            'Impossible de charger les informations du traiteur'
          );
        }
      });
    }
  }

  onSubmit(): void {
    // Marquer tous les champs comme touchés pour afficher les erreurs
    if (this.orderForm.invalid) {
      Object.keys(this.orderForm.controls).forEach(key => {
        const control = this.orderForm.get(key);
        control?.markAsTouched();
        if (control?.invalid) {
          console.log(`Champ invalide: ${key}`, control.errors);
        }
      });
      
      this.toastService.showWarning(
        'Formulaire incomplet',
        'Veuillez remplir tous les champs requis correctement'
      );
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    this.loading = true;
    this.success = false;

    // Préparer les données avec conversion des types
    const formValue = this.orderForm.value;
    const orderData = {
      business_id: this.traiteur?.id,
      client_name: formValue.client_name?.trim(),
      client_email: formValue.client_email?.trim(),
      client_phone: formValue.client_phone?.trim(),
      event_type: formValue.event_type,
      event_date: formValue.event_date,
      event_time: formValue.event_time,
      number_of_guests: parseInt(formValue.number_of_guests, 10),
      delivery_address: formValue.delivery_address?.trim(),
      city: formValue.city?.trim(),
      menu_preferences: formValue.menu_preferences?.trim(),
      dietary_restrictions: formValue.dietary_restrictions?.trim() || null,
      special_requests: formValue.special_requests?.trim() || null,
      estimated_budget: formValue.estimated_budget ? parseFloat(formValue.estimated_budget) : null
    };

    // Validation supplémentaire
    if (!orderData.business_id) {
      this.loading = false;
      this.toastService.showError(
        'Erreur',
        'Traiteur non trouvé'
      );
      return;
    }

    console.log('📤 Envoi de la commande spéciale:', orderData);

    this.orderService.createSpecialOrder(orderData).subscribe({
      next: (response) => {
        console.log('✅ Commande créée avec succès:', response);
        this.loading = false;
        this.success = true;
        
        this.toastService.showSuccess(
          'Demande envoyée !',
          `Votre demande de commande pour ${orderData.number_of_guests} personnes a été envoyée à ${this.traiteur.name}. Vous serez contacté sous 24-48h.`
        );
        
        // Scroll vers la section de succès
        setTimeout(() => {
          if (this.successSection) {
            this.successSection.nativeElement.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center' 
            });
          }
        }, 100);
      },
      error: (error) => {
        console.error('❌ Erreur création commande:', error);
        this.loading = false;
        
        // Message d'erreur détaillé avec gestion des erreurs Joi
        if (error.error?.errors && Array.isArray(error.error.errors)) {
          // Erreurs de validation Joi
          const errorMessages = error.error.errors.map((e: any) => e.message).join(', ');
          this.toastService.showError(
            'Erreurs de validation',
            errorMessages
          );
        } else if (error.error?.message) {
          let errorMsg = error.error.message;
          if (error.error.missingFields) {
            errorMsg += ` (Champs manquants: ${error.error.missingFields.join(', ')})`;
          }
          this.toastService.showError(
            'Erreur de validation',
            errorMsg
          );
        } else if (error.status === 400) {
          this.toastService.showError(
            'Données invalides',
            'Veuillez vérifier tous les champs du formulaire'
          );
        } else if (error.status === 404) {
          this.toastService.showError(
            'Traiteur introuvable',
            'Le traiteur sélectionné n\'existe plus'
          );
        } else {
          this.toastService.showError(
            'Erreur d\'envoi',
            'Impossible d\'envoyer votre demande. Veuillez réessayer.'
          );
        }
      
        // Scroll vers le haut en cas d'erreur
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  getFieldError(fieldName: string): string {
    const control = this.orderForm.get(fieldName);
    
    if (control?.hasError('required')) {
      return 'Ce champ est requis';
    }
    if (control?.hasError('email')) {
      return 'Email invalide';
    }
    if (control?.hasError('pattern')) {
      return 'Format invalide (8-15 chiffres pour le téléphone)';
    }
    if (control?.hasError('min')) {
      const minValue = control.errors?.['min']?.min;
      return `Valeur minimale: ${minValue}`;
    }
    if (control?.hasError('minlength')) {
      const minLength = control.errors?.['minlength']?.requiredLength;
      return `Minimum ${minLength} caractères requis`;
    }
    
    return '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.orderForm.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }

  navigateBack(): void {
    this.router.navigate(['/']);
  }

  onImageError(event: any): void {
    event.target.src = 'assets/images/default-caterer.jpg';
  }

  makeNewOrder(): void {
    this.success = false;
    this.orderForm.reset();
    this.initializeForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    
    this.toastService.showInfo(
      'Nouveau formulaire',
      'Le formulaire a été réinitialisé pour une nouvelle commande'
    );
  }
}