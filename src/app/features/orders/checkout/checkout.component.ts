// checkout.component.ts — VERSION COMPLÈTE avec champs de saisie par méthode
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
  cart:     any[] = [];
  business: any   = null;
  loading = false;

  isSandbox: boolean = environment.paymentMode === 'sandbox';

  fees = { subtotal: 0, deliveryFee: 0, paymentFee: 0, total: 0 };

  constructor(
    private fb: FormBuilder,
    private orderService: OrderService,
    private paymentService: PaymentService,
    private router: Router,
    private toastService: ToastService
  ) {
    this.checkoutForm = this.fb.group({
      // ── Infos client ──────────────────────────────────────
      client_name:       ['', Validators.required],
      client_phone:      ['', Validators.required],
      client_email:      ['', [Validators.email]],
      notes:             [''],

      // ── Mode paiement ─────────────────────────────────────
      payment_type:      ['', Validators.required],
      payment_method:    [''],

      // ── Champs Mobile Money (Mixx / Flooz) ───────────────
      mobile_phone:      [''],   // numéro mobile money

      // ── Champs carte bancaire ─────────────────────────────
      card_number:       [''],
      card_expiry:       [''],   // MM/AA
      card_cvv:          [''],
      card_holder:       [''],

      // ── Livraison (COD) ───────────────────────────────────
      delivery_address:  [''],
      delivery_distance: [null]
    });

    // Validation conditionnelle selon payment_type
    this.checkoutForm.get('payment_type')?.valueChanges.subscribe(type => {
      this.resetPaymentFields();
      if (type === 'online') {
        this.checkoutForm.get('payment_method')?.setValidators([Validators.required]);
        this.checkoutForm.get('delivery_address')?.clearValidators();
      } else if (type === 'cod') {
        this.checkoutForm.get('payment_method')?.clearValidators();
        this.checkoutForm.get('payment_method')?.setValue('cash');
        this.checkoutForm.get('delivery_address')?.setValidators([Validators.required]);
      }
      this.checkoutForm.get('payment_method')?.updateValueAndValidity();
      this.checkoutForm.get('delivery_address')?.updateValueAndValidity();
      this.calculateFees();
    });

    // Validation conditionnelle selon payment_method
    this.checkoutForm.get('payment_method')?.valueChanges.subscribe(method => {
      this.applyMethodValidators(method);
      this.calculateFees();
    });
  }

  // ── Validation dynamique selon la méthode choisie ────────
  private applyMethodValidators(method: string): void {
    const mobilePhone = this.checkoutForm.get('mobile_phone');
    const cardNumber  = this.checkoutForm.get('card_number');
    const cardExpiry  = this.checkoutForm.get('card_expiry');
    const cardCvv     = this.checkoutForm.get('card_cvv');
    const cardHolder  = this.checkoutForm.get('card_holder');

    // Reset all
    [mobilePhone, cardNumber, cardExpiry, cardCvv, cardHolder].forEach(c => {
      c?.clearValidators();
      c?.updateValueAndValidity();
    });

    if (method === 'Mixx By Yas' || method === 'flooz') {
      mobilePhone?.setValidators([
        Validators.required,
        Validators.pattern(/^(\+228|00228|228)?[0-9]{8}$/)
      ]);
      mobilePhone?.updateValueAndValidity();
    }

    if (method === 'card') {
      cardNumber?.setValidators([Validators.required, Validators.pattern(/^[0-9]{16}$/)]);
      cardExpiry?.setValidators([Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)]);
      cardCvv?.setValidators([Validators.required, Validators.pattern(/^[0-9]{3,4}$/)]);
      cardHolder?.setValidators([Validators.required]);
      [cardNumber, cardExpiry, cardCvv, cardHolder].forEach(c => c?.updateValueAndValidity());
    }
  }

  private resetPaymentFields(): void {
    this.checkoutForm.patchValue({
      payment_method: '',
      mobile_phone:   '',
      card_number:    '',
      card_expiry:    '',
      card_cvv:       '',
      card_holder:    ''
    });
    ['mobile_phone','card_number','card_expiry','card_cvv','card_holder'].forEach(k => {
      this.checkoutForm.get(k)?.clearValidators();
      this.checkoutForm.get(k)?.updateValueAndValidity();
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

    this.cart     = JSON.parse(cartData);
    this.business = JSON.parse(businessData);
    this.calculateFees();
  }

  calculateFees(): void {
    this.fees.subtotal = this.cart.reduce((t, i) => t + (Number(i.subtotal) || 0), 0);

    const type   = this.checkoutForm.get('payment_type')?.value;
    const method = this.checkoutForm.get('payment_method')?.value;
    const dist   = this.checkoutForm.get('delivery_distance')?.value || 0;

    this.fees.deliveryFee = type === 'cod' ? this.calcDeliveryFee(dist) : 0;
    this.fees.paymentFee  = (type === 'online' && method)
      ? this.calculatePaymentFee(this.fees.subtotal, method)
      : 0;
    this.fees.total = this.fees.subtotal + this.fees.deliveryFee + this.fees.paymentFee;
  }

  private calcDeliveryFee(km: number): number {
    if (!km || km <= 0) return 0;
    if (km < 5)  return 500;
    if (km < 10) return 1000;
    if (km < 20) return 1500;
    return 2000;
  }

  calculatePaymentFee(amount: number, method: string): number {
    if (method === 'card')        return Math.round((amount * 0.035) + 150);
    if (method === 'Mixx By Yas' || method === 'flooz')
                                  return Math.round((amount * 0.029) + 100);
    return 0;
  }

  onAddressChange(): void {
    const addr = this.checkoutForm.get('delivery_address')?.value;
    if (addr && addr.length > 5) {
      const dist = Math.min(Math.max(addr.length / 10, 3), 20);
      this.checkoutForm.patchValue({ delivery_distance: dist });
      this.calculateFees();
    }
  }

  // ── Formatage numéro de carte ─────────────────────────────
  formatCardNumber(event: any): void {
    let val = event.target.value.replace(/\D/g, '').substring(0, 16);
    event.target.value = val;
    this.checkoutForm.get('card_number')?.setValue(val, { emitEvent: false });
  }

  formatCardExpiry(event: any): void {
    let val = event.target.value.replace(/\D/g, '').substring(0, 4);
    if (val.length >= 3) val = val.substring(0, 2) + '/' + val.substring(2);
    event.target.value = val;
    this.checkoutForm.get('card_expiry')?.setValue(val, { emitEvent: false });
  }

  selectPaymentType(type: string): void {
    this.checkoutForm.patchValue({ payment_type: type });
  }

  selectPaymentMethod(method: string): void {
    this.checkoutForm.patchValue({ payment_method: method });
  }

  isPaymentTypeSelected(type: string): boolean {
    return this.checkoutForm.get('payment_type')?.value === type;
  }

  isPaymentMethodSelected(method: string): boolean {
    return this.checkoutForm.get('payment_method')?.value === method;
  }

  isOnlinePayment(): boolean {
    return this.checkoutForm.get('payment_type')?.value === 'online';
  }

  isMobileMoney(): boolean {
    const m = this.checkoutForm.get('payment_method')?.value;
    return m === 'Mixx By Yas' || m === 'flooz';
  }

  isCardPayment(): boolean {
    return this.checkoutForm.get('payment_method')?.value === 'card';
  }

  // ── Helpers affichage ─────────────────────────────────────
  getMobileMoneyLabel(): string {
    const m = this.checkoutForm.get('payment_method')?.value;
    if (m === 'Mixx By Yas') return 'T-Money / Togocom';
    if (m === 'flooz')       return 'Flooz / Moov';
    return 'Mobile Money';
  }

  getMobileMoneyPlaceholder(): string {
    const m = this.checkoutForm.get('payment_method')?.value;
    if (m === 'Mixx By Yas') return '+228 9X XX XX XX';
    if (m === 'flooz')       return '+228 7X XX XX XX';
    return '+228 XX XX XX XX';
  }

  getMobileMoneyIcon(): string {
    return this.checkoutForm.get('payment_method')?.value === 'Mixx By Yas' ? '📱' : '💚';
  }

  fieldInvalid(name: string): boolean {
    const c = this.checkoutForm.get(name);
    return !!(c?.invalid && c?.touched);
  }

  onSubmit(): void {
    if (!this.checkoutForm.valid) {
      this.checkoutForm.markAllAsTouched();
      this.toastService.showWarning('Formulaire incomplet', 'Veuillez remplir tous les champs obligatoires.');
      return;
    }
    if (!this.cart.length) {
      this.toastService.showError('Panier vide', 'Votre panier est vide.');
      return;
    }

    this.loading   = true;
    const formVal  = this.checkoutForm.value;

    const orderData: any = {
      business_id:       this.business.id,
      client_name:       formVal.client_name,
      client_phone:      formVal.client_phone,
      client_email:      formVal.client_email,
      payment_type:      formVal.payment_type,
      payment_method:    formVal.payment_method,
      notes:             formVal.notes,
      items:             this.cart,
      subtotal_amount:   this.fees.subtotal,
      delivery_fee:      this.fees.deliveryFee,
      payment_fee:       this.fees.paymentFee,
      total_amount:      this.fees.total,
      delivery_address:  formVal.delivery_address,
      delivery_distance: formVal.delivery_distance,
      // Infos paiement (non stockées en clair côté serveur idéalement)
      payment_phone:     formVal.mobile_phone   || null,
      card_holder:       formVal.card_holder     || null
    };

    this.orderService.createOrder(orderData).subscribe({
      next: (response: any) => {
        const order   = response?.data || response;
        const orderId = order?.id;

        if (!orderId) {
          this.loading = false;
          this.toastService.showError('Erreur', 'Identifiant de commande manquant.');
          return;
        }

        if (formVal.payment_type === 'cod') {
          this.loading = false;
          sessionStorage.removeItem('checkout_cart');
          sessionStorage.removeItem('checkout_business');
          this.toastService.showSuccess('✅ Commande confirmée !',
            `Commande ${orderId} — ${this.fees.total.toLocaleString('fr-FR')} FCFA à la livraison`);
          setTimeout(() => this.router.navigate(['/orders', orderId]), 2000);
          return;
        }

        const paymentData: appPaymentRequest = {
          order_id:       orderId,
          amount:         this.fees.total,
          currency:       'XOF',
          payment_method: formVal.payment_method,
          customer_name:  formVal.client_name,
          customer_phone: formVal.mobile_phone || formVal.client_phone,
          customer_email: formVal.client_email
        };

        this.paymentService.initiatePayment(paymentData).subscribe({
          next: (payRes: any) => {
            sessionStorage.removeItem('checkout_cart');
            sessionStorage.removeItem('checkout_business');

            if (payRes.sandbox === true || this.isSandbox) {
              this.loading = false;
              this.toastService.showSuccess('✅ Paiement accepté !',
                `Commande ${orderId} confirmée — ${this.fees.total.toLocaleString('fr-FR')} FCFA`);
              setTimeout(() => this.router.navigate(['/']), 2500);
              return;
            }

            if (payRes.checkout_url) {
              this.toastService.showSuccess('Commande créée', 'Redirection vers paiement...');
              setTimeout(() => { window.location.href = payRes.checkout_url; }, 1000);
            } else {
              this.loading = false;
              this.toastService.showError('Erreur', 'URL de paiement manquante.');
            }
          },
          error: (err: any) => {
            this.loading = false;
            this.toastService.showError('Erreur de paiement', err.error?.message || 'Impossible d\'initier le paiement.');
          }
        });
      },
      error: (err: any) => {
        this.loading = false;
        this.toastService.showError('Erreur de commande', err.error?.message || 'Impossible de créer la commande.');
      }
    });
  }

  onImageError(event: any): void { event.target.style.display = 'none'; }
}