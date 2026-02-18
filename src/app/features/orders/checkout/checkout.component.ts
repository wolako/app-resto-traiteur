import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { OrderService } from '../../../core/services/orders/order.service';
import { PaymentService } from '../../../core/services/payments/payment.service';
import { Order } from '../../../core/models/order.model';
import { appPaymentRequest } from '../../../core/models/payment.model';
import { ToastService } from '../../../core/services/toast/toast.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnInit {
  checkoutForm: FormGroup;
  cart: any[] = [];
  business: any = null;
  totalAmount: number = 0;
  loading = false;

  isSandbox: boolean = environment.paymentMode === 'sandbox';

  readonly PAYMENT_METHODS = [
    { value: 'Mixx By Yas', label: 'Mixx By Yas',   description: 'T-Money / Flooz via Mixx By Yas', emoji: '📱' },
    { value: 'flooz',        label: 'Flooz',          description: 'Paiement mobile Flooz',           emoji: '💚' },
    { value: 'card',         label: 'Carte bancaire', description: 'Visa / Mastercard via CinetPay',  emoji: '💳' }
  ];

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private paymentService: PaymentService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.checkoutForm = this.fb.group({
      client_name:    ['', Validators.required],
      client_phone:   ['', Validators.required],
      client_email:   ['', [Validators.email]],
      notes:          [''],
      payment_method: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    const cartData     = sessionStorage.getItem('checkout_cart');
    const businessData = sessionStorage.getItem('checkout_business');

    if (!cartData || !businessData) {
      this.toastService.showWarning('Panier vide', 'Veuillez d\'abord ajouter des articles.');
      this.router.navigate(['/']);
      return;
    }

    this.cart        = JSON.parse(cartData);
    this.business    = JSON.parse(businessData);
    this.totalAmount = this.cart.reduce((total, item) => total + (Number(item.subtotal) || 0), 0);
  }

  selectPaymentMethod(method: string): void {
    this.checkoutForm.patchValue({ payment_method: method });
  }

  isPaymentSelected(method: string): boolean {
    return this.checkoutForm.get('payment_method')?.value === method;
  }

  onSubmit(): void {
    if (!this.checkoutForm.valid) {
      this.toastService.showWarning('Formulaire incomplet', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (this.cart.length === 0) {
      this.toastService.showError('Panier vide', 'Votre panier est vide.');
      return;
    }

    this.loading = true;
    const formVal = this.checkoutForm.value;

    const orderData: Omit<Order, 'id'> = {
      business_id:    this.business.id,
      client_name:    formVal.client_name,
      client_phone:   formVal.client_phone,
      client_email:   formVal.client_email,
      total_amount:   this.totalAmount,
      status:         'pending',
      payment_status: 'pending',
      payment_method: formVal.payment_method,
      notes:          formVal.notes,
      items:          this.cart
    };

    this.orderService.createOrder(orderData).subscribe({
      next: (response: any) => {
        // ✅ FIX BUG 1 : Le backend répond { success, data: { id, ... } }
        //    L'ancien code faisait order.id! mais order = response entier
        //    → order_id était undefined → erreur 400 "order_id is required"
        const order   = response?.data || response;
        const orderId = order?.id;

        if (!orderId) {
          this.loading = false;
          console.error('[Checkout] Réponse createOrder inattendue :', response);
          this.toastService.showError('Erreur', 'Identifiant de commande manquant. Veuillez réessayer.');
          return;
        }

        const paymentData: appPaymentRequest = {
          order_id:       orderId,          // ← correctement extrait maintenant
          amount:         this.totalAmount,
          currency:       'XOF',
          payment_method: formVal.payment_method,
          customer_name:  formVal.client_name,
          customer_phone: formVal.client_phone,
          customer_email: formVal.client_email
        };

        this.paymentService.initiatePayment(paymentData).subscribe({
          next: (paymentResponse: any) => {
            sessionStorage.removeItem('checkout_cart');
            sessionStorage.removeItem('checkout_business');

            // ── SANDBOX : succès immédiat, pas de redirection ──
            if (paymentResponse.sandbox === true || this.isSandbox) {
              this.loading = false;
              this.toastService.showSuccess(
                '✅ Paiement accepté !',
                `Commande #${orderId} confirmée — ${this.totalAmount.toLocaleString('fr-FR')} FCFA`
              );
              setTimeout(() => this.router.navigate(['/']), 2500);
              return;
            }

            // ── PRODUCTION : redirection vers CinetPay ─────────
            if (paymentResponse.checkout_url) {
              this.toastService.showSuccess('Commande créée', 'Redirection vers la page de paiement...');
              setTimeout(() => {
                window.location.href = paymentResponse.checkout_url;
              }, 1000);
            } else {
              this.loading = false;
              this.toastService.showError('Erreur de paiement', 'URL de paiement manquante. Veuillez réessayer.');
            }
          },
          error: (error: any) => {
            this.loading = false;
            this.toastService.showError(
              'Erreur de paiement',
              error.error?.message || 'Impossible d\'initier le paiement. Veuillez réessayer.'
            );
          }
        });
      },
      error: (error: any) => {
        this.loading = false;
        this.toastService.showError(
          'Erreur de commande',
          error.error?.message || 'Impossible de créer votre commande. Veuillez réessayer.'
        );
      }
    });
  }

  onImageError(event: any): void {
    event.target.style.display = 'none';
  }
}