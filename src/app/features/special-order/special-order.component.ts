import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute, RouterModule } from '@angular/router';
import { OrderService } from '../../core/services/orders/order.service';
import { BusinessService } from '../../core/services/business/business.service';
import { AuthService } from '../../core/services/auth/auth.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { environment } from '../../../environments/environment';

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

  // ✅ NOUVEAU : États workflow
  step: 'form' | 'waiting_quote' | 'quote_received' | 'payment' | 'confirmed' = 'form';
  specialOrderId: number | null = null;
  quote: any = null;

  // ✅ NOUVEAU : Paiement acompte
  selectedPaymentMethod = '';
  depositFee = 0;
  totalDeposit = 0;
  isSandbox = environment.paymentMode === 'sandbox';

  @ViewChild('successSection') successSection!: ElementRef;

  eventTypes = [
    { value: 'mariage', label: 'Mariage' },
    { value: 'anniversaire', label: 'Anniversaire' },
    { value: 'bapteme', label: 'Baptême' },
    { value: 'entreprise', label: 'Événement d\'entreprise' },
    { value: 'reception', label: 'Réception' },
    { value: 'autre', label: 'Autre' }
  ];

  paymentMethods = [
    { value: 'tmoney', label: 'T-Money', icon: '📱' },
    { value: 'flooz', label: 'Flooz', icon: '💚' },
    { value: 'Mixx By Yas', label: 'Mixx By Yas', icon: '📲' },
    { value: 'card', label: 'Carte bancaire', icon: '💳' },
    { value: 'cod', label: 'Payer chez le traiteur', icon: '💵' }
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
    const defaultName = this.currentUser 
      ? `${this.currentUser.first_name || ''} ${this.currentUser.last_name || ''}`.trim()
      : '';
    const defaultEmail = this.currentUser?.email || '';
    const defaultPhone = this.currentUser?.phone || '';

    this.orderForm = this.fb.group({
      client_name: [defaultName, [Validators.required, Validators.minLength(2)]],
      client_email: [defaultEmail, [Validators.required, Validators.email]],
      client_phone: [defaultPhone, [Validators.required, Validators.pattern(/^[0-9]{8,15}$/)]],
      event_type: ['', Validators.required],
      event_date: ['', Validators.required],
      event_time: ['', Validators.required],
      number_of_guests: ['', [Validators.required, Validators.min(1)]],
      delivery_address: ['', [Validators.required, Validators.minLength(5)]],
      city: ['', [Validators.required, Validators.minLength(2)]],
      menu_preferences: ['', [Validators.required, Validators.minLength(10)]],
      dietary_restrictions: [''],
      special_requests: [''],
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

  /**
   * ✅ ÉTAPE 1 : Envoyer demande initiale
   */
  onSubmit(): void {
    if (this.orderForm.invalid) {
      Object.keys(this.orderForm.controls).forEach(key => {
        this.orderForm.get(key)?.markAsTouched();
      });
      
      this.toastService.showWarning(
        'Formulaire incomplet',
        'Veuillez remplir tous les champs requis'
      );
      return;
    }

    this.loading = true;

    const orderData = {
      business_id: this.traiteur?.id,
      ...this.orderForm.value,
      number_of_guests: parseInt(this.orderForm.value.number_of_guests, 10),
      estimated_budget: this.orderForm.value.estimated_budget ? 
        parseFloat(this.orderForm.value.estimated_budget) : null
    };

    this.orderService.createSpecialOrder(orderData).subscribe({
      next: (response: any) => {
        this.loading = false;
        this.specialOrderId = response.data?.id || response.id;
        this.step = 'waiting_quote';
        
        this.toastService.showSuccess(
          'Demande envoyée !',
          'Le traiteur vous enverra un devis sous 24-48h'
        );
      },
      error: (error) => {
        this.loading = false;
        this.toastService.showError(
          'Erreur d\'envoi',
          error.error?.message || 'Impossible d\'envoyer la demande'
        );
      }
    });
  }

  /**
   * ✅ ÉTAPE 2 : Charger devis (simulé - en réalité, appelé quand traiteur envoie devis)
   * Dans votre cas, ajoutez un endpoint pour récupérer le devis
   */
  loadQuote(): void {
    if (!this.specialOrderId) return;

    this.orderService.getSpecialOrderById(this.specialOrderId).subscribe({
      next: (order: any) => {
        if (order.status === 'quoted') {
          this.quote = {
            quoted_amount: order.quoted_amount,
            deposit_percentage: order.deposit_percentage,
            deposit_amount: order.deposit_amount,
            transport_fee: order.transport_fee || 0,
            final_amount: order.final_amount,
            quote_notes: order.quote_notes
          };
          this.step = 'quote_received';
        }
      },
      error: (error) => {
        console.error('Error loading quote:', error);
      }
    });
  }

  /**
   * ✅ ÉTAPE 3 : Calculer frais acompte
   */
  selectPaymentMethod(method: string): void {
    this.selectedPaymentMethod = method;
    this.calculateDepositFees();
  }

  calculateDepositFees(): void {
    if (!this.quote || !this.selectedPaymentMethod) {
      this.depositFee = 0;
      this.totalDeposit = this.quote?.deposit_amount || 0;
      return;
    }

    // COD : pas de frais
    if (this.selectedPaymentMethod === 'cod') {
      this.depositFee = 0;
      this.totalDeposit = this.quote.deposit_amount;
      return;
    }

    // Carte : 3.5% + 150 FCFA
    if (this.selectedPaymentMethod === 'card') {
      this.depositFee = Math.round((this.quote.deposit_amount * 0.035) + 150);
    } 
    // Mobile money : 2.9% + 100 FCFA
    else {
      this.depositFee = Math.round((this.quote.deposit_amount * 0.029) + 100);
    }

    this.totalDeposit = this.quote.deposit_amount + this.depositFee;
  }

  /**
   * ✅ ÉTAPE 4 : Accepter devis et payer acompte
   */
  acceptQuoteAndPay(): void {
    if (!this.selectedPaymentMethod) {
      this.toastService.showWarning(
        'Mode de paiement requis',
        'Veuillez sélectionner un mode de paiement'
      );
      return;
    }

    this.loading = true;

    this.orderService.acceptSpecialOrderQuote(this.specialOrderId!, {
      deposit_payment_method: this.selectedPaymentMethod
    }).subscribe({
      next: (response: any) => {
        this.loading = false;

        // COD
        if (this.selectedPaymentMethod === 'cod') {
          this.step = 'confirmed';
          this.toastService.showSuccess(
            'Commande confirmée !',
            `Acompte de ${this.totalDeposit.toLocaleString('fr-FR')} FCFA à payer chez le traiteur`
          );
          return;
        }

        // Paiement en ligne
        if (response.payment_url) {
          this.toastService.showInfo(
            'Redirection paiement',
            `Acompte : ${this.totalDeposit.toLocaleString('fr-FR')} FCFA`
          );
          window.location.href = response.payment_url;
        } 
        // Sandbox
        else if (response.sandbox || this.isSandbox) {
          this.step = 'confirmed';
          this.toastService.showSuccess(
            '✅ Paiement accepté (Sandbox) !',
            'Votre commande est confirmée'
          );
        }
      },
      error: (error) => {
        this.loading = false;
        this.toastService.showError(
          'Erreur de paiement',
          error.error?.message || 'Impossible d\'initier le paiement'
        );
      }
    });
  }

  // Helpers
  getFieldError(fieldName: string): string {
    const control = this.orderForm.get(fieldName);
    if (control?.hasError('required')) return 'Ce champ est requis';
    if (control?.hasError('email')) return 'Email invalide';
    if (control?.hasError('pattern')) return 'Format invalide';
    if (control?.hasError('min')) return `Valeur minimale: ${control.errors?.['min']?.min}`;
    if (control?.hasError('minlength')) return `Minimum ${control.errors?.['minlength']?.requiredLength} caractères`;
    return '';
  }

  isFieldInvalid(fieldName: string): boolean {
    const control = this.orderForm.get(fieldName);
    return !!(control && control.invalid && control.touched);
  }

  navigateBack(): void {
    this.router.navigate(['/']);
  }

  makeNewOrder(): void {
    this.step = 'form';
    this.specialOrderId = null;
    this.quote = null;
    this.selectedPaymentMethod = '';
    this.orderForm.reset();
    this.initializeForm();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}