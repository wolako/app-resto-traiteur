// checkout.component.ts
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

  // GPS state
  gpsLoading = false;
  gpsCoords: { lat: number; lng: number } | null = null;
  gpsError: string | null = null;

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

      // ── Méthode de paiement unique (4 valeurs) ────────────
      // 'mixx' | 'flooz' | 'card' | 'cod'
      payment_method:    ['', Validators.required],

      // ── Champs Mobile Money ───────────────────────────────
      mobile_phone: [''],

      // ── Champs carte bancaire ─────────────────────────────
      card_number:  [''],
      card_expiry:  [''],
      card_cvv:     [''],
      card_holder:  [''],

      // ── Livraison (COD + optionnel autres) ────────────────
      wants_delivery:   [false],     // checkbox "je veux la livraison"
      delivery_address: [''],
      delivery_lat:     [null],
      delivery_lng:     [null],
    });

    // Validation dynamique selon la méthode
    this.checkoutForm.get('payment_method')?.valueChanges.subscribe(method => {
      this.clearPaymentValidators();
      this.applyMethodValidators(method);
      this.calculateFees();
    });

    // Validation adresse si livraison demandée
    this.checkoutForm.get('wants_delivery')?.valueChanges.subscribe(wants => {
      const addr = this.checkoutForm.get('delivery_address');
      if (wants) {
        addr?.setValidators([Validators.required]);
      } else {
        addr?.clearValidators();
        this.gpsCoords = null;
        this.gpsError = null;
      }
      addr?.updateValueAndValidity();
      this.calculateFees();
    });
  }

  private clearPaymentValidators(): void {
    ['mobile_phone', 'card_number', 'card_expiry', 'card_cvv', 'card_holder'].forEach(k => {
      this.checkoutForm.get(k)?.clearValidators();
      this.checkoutForm.get(k)?.updateValueAndValidity();
    });
  }

  private applyMethodValidators(method: string): void {
    if (method === 'mixx' || method === 'flooz') {
      this.checkoutForm.get('mobile_phone')?.setValidators([
        Validators.required,
        Validators.pattern(/^(\+228|00228|228)?[0-9]{8}$/)
      ]);
      this.checkoutForm.get('mobile_phone')?.updateValueAndValidity();
    }

    if (method === 'card') {
      this.checkoutForm.get('card_number')?.setValidators([Validators.required, Validators.pattern(/^[0-9]{16}$/)]);
      this.checkoutForm.get('card_expiry')?.setValidators([Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/([0-9]{2})$/)]);
      this.checkoutForm.get('card_cvv')?.setValidators([Validators.required, Validators.pattern(/^[0-9]{3,4}$/)]);
      this.checkoutForm.get('card_holder')?.setValidators([Validators.required]);
      ['card_number', 'card_expiry', 'card_cvv', 'card_holder'].forEach(k =>
        this.checkoutForm.get(k)?.updateValueAndValidity()
      );
    }
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

    const method  = this.checkoutForm.get('payment_method')?.value;
    const wants   = this.checkoutForm.get('wants_delivery')?.value;

    // Livraison si COD ou si checkbox cochée
    this.fees.deliveryFee = (method === 'cod' || wants)
      ? 500 // frais fixes — à affiner selon la distance GPS si disponible
      : 0;

    this.fees.paymentFee = (method && method !== 'cod')
      ? this.calculatePaymentFee(this.fees.subtotal, method)
      : 0;

    this.fees.total = this.fees.subtotal + this.fees.deliveryFee + this.fees.paymentFee;
  }

  calculatePaymentFee(amount: number, method: string): number {
    if (method === 'card')  return Math.round((amount * 0.035) + 150);
    if (method === 'mixx' || method === 'flooz')
      return Math.round((amount * 0.029) + 100);
    return 0;
  }

  // ── Sélection méthode ────────────────────────────────────
  selectMethod(method: string): void {
    // Réinitialiser les champs de paiement avant de changer
    this.checkoutForm.patchValue({
      payment_method: method,
      mobile_phone:   '',
      card_number:    '',
      card_expiry:    '',
      card_cvv:       '',
      card_holder:    ''
    });
    // Si COD, cocher automatiquement la livraison
    if (method === 'cod') {
      this.checkoutForm.patchValue({ wants_delivery: true });
    }
  }

  isMethodSelected(method: string): boolean {
    return this.checkoutForm.get('payment_method')?.value === method;
  }

  isMobileMoney(): boolean {
    const m = this.checkoutForm.get('payment_method')?.value;
    return m === 'mixx' || m === 'flooz';
  }

  isCardPayment(): boolean {
    return this.checkoutForm.get('payment_method')?.value === 'card';
  }

  isCOD(): boolean {
    return this.checkoutForm.get('payment_method')?.value === 'cod';
  }

  wantsDelivery(): boolean {
    return !!this.checkoutForm.get('wants_delivery')?.value;
  }

  // ── Géolocalisation GPS ───────────────────────────────────
  requestGPS(): void {
    if (!navigator.geolocation) {
      this.gpsError = 'La géolocalisation n\'est pas supportée par votre navigateur.';
      return;
    }

    this.gpsLoading = true;
    this.gpsError   = null;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.gpsLoading = false;
        this.gpsCoords  = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.checkoutForm.patchValue({
          delivery_lat: pos.coords.latitude,
          delivery_lng: pos.coords.longitude,
        });
        // Pré-remplir l'adresse avec les coordonnées
        const addrCtrl = this.checkoutForm.get('delivery_address');
        if (!addrCtrl?.value) {
          addrCtrl?.patchValue(`${pos.coords.latitude.toFixed(6)}, ${pos.coords.longitude.toFixed(6)}`);
        }
        this.toastService.showSuccess('Position capturée !', 'Le livreur pourra vous localiser.');
      },
      (err) => {
        this.gpsLoading = false;
        switch (err.code) {
          case err.PERMISSION_DENIED:
            this.gpsError = 'Accès à la localisation refusé. Autorisez-la dans les paramètres.';
            break;
          case err.POSITION_UNAVAILABLE:
            this.gpsError = 'Position non disponible. Réessayez.';
            break;
          default:
            this.gpsError = 'Impossible d\'obtenir votre position.';
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  clearGPS(): void {
    this.gpsCoords = null;
    this.gpsError  = null;
    this.checkoutForm.patchValue({ delivery_lat: null, delivery_lng: null });
  }

  // ── Formatage carte ───────────────────────────────────────
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

  // ── Labels / helpers ──────────────────────────────────────
  getMobileMoneyPlaceholder(): string {
    const m = this.checkoutForm.get('payment_method')?.value;
    return m === 'mixx' ? '+228 9X XX XX XX' : '+228 7X XX XX XX';
  }

  getMobileMoneyLabel(): string {
    const m = this.checkoutForm.get('payment_method')?.value;
    return m === 'mixx' ? 'Mixx By Yas (Yas / Togocom)' : 'Flooz (Moov Africa)';
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

    this.loading  = true;
    const v       = this.checkoutForm.value;
    const isCOD   = v.payment_method === 'cod';

    const orderData: any = {
      business_id:       this.business.id,
      client_name:       v.client_name,
      client_phone:      v.client_phone,
      client_email:      v.client_email,
      payment_type:      isCOD ? 'cod' : 'online',
      payment_method:    v.payment_method,
      notes:             v.notes,
      items:             this.cart,
      subtotal_amount:   this.fees.subtotal,
      delivery_fee:      this.fees.deliveryFee,
      payment_fee:       this.fees.paymentFee,
      total_amount:      this.fees.total,
      wants_delivery:    v.wants_delivery,
      delivery_address:  v.delivery_address,
      delivery_lat:      v.delivery_lat,
      delivery_lng:      v.delivery_lng,
      payment_phone:     v.mobile_phone   || null,
      card_holder:       v.card_holder    || null,
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

        if (isCOD) {
          this.loading = false;
          sessionStorage.removeItem('checkout_cart');
          sessionStorage.removeItem('checkout_business');
          this.toastService.showSuccess('✅ Commande confirmée !',
            `Commande #${orderId} — ${this.fees.total.toLocaleString('fr-FR')} FCFA à la livraison`);
          setTimeout(() => this.router.navigate(['/orders', orderId]), 2000);
          return;
        }

        const paymentData: appPaymentRequest = {
          order_id:       orderId,
          amount:         this.fees.total,
          currency:       'XOF',
          payment_method: v.payment_method,
          customer_name:  v.client_name,
          customer_phone: v.mobile_phone || v.client_phone,
          customer_email: v.client_email
        };

        this.paymentService.initiatePayment(paymentData).subscribe({
          next: (payRes: any) => {
            sessionStorage.removeItem('checkout_cart');
            sessionStorage.removeItem('checkout_business');

            if (payRes.sandbox === true || this.isSandbox) {
              this.loading = false;
              this.toastService.showSuccess('✅ Paiement accepté !',
                `Commande #${orderId} confirmée — ${this.fees.total.toLocaleString('fr-FR')} FCFA`);
              setTimeout(() => this.router.navigate(['/']), 2500);
              return;
            }

            if (payRes.checkout_url) {
              this.toastService.showSuccess('Commande créée', 'Redirection vers le paiement...');
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