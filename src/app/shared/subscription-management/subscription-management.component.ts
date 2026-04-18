import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth/auth.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../core/services/confirmation-modal/confirmation-modal.service';
import { CommissionRatePipe } from '../pipes/commission-rate/commission-rate.pipe';
import { SubscriptionService } from '../../core/services/subscriptions/subscription.service';

interface SubscriptionPlan {
  id: number;
  name: string;
  display_name: string;
  description: string;
  price: number;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_reservations_per_month: number | null;
  max_special_orders_per_month: number | null;
  max_photos: number;
  priority_support: boolean;
  analytics_access: boolean;
  custom_branding: boolean;
  commission_rate: number;
}

interface CurrentSubscription {
  id: number;
  plan_id: number;
  status: string;
  start_date: string;
  end_date: string | null;
  plan_name: string;
  display_name: string;
  commission_rate: number;
  billing_period: string;
}

interface UsageStats {
  limits: { menu_items: number | null; orders_per_month: number | null; reservations_per_month: number | null; special_orders_per_month: number | null; photos: number; };
  usage:  { menu_items: number; orders_this_month: number; reservations_this_month: number; special_orders_this_month: number; photos: number; };
}

type PaymentMethod = 'mixx' | 'flooz' | 'card';

@Component({
  selector: 'app-subscription-management',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, CommissionRatePipe],
  templateUrl: './subscription-management.component.html',
  styleUrls: ['./subscription-management.component.scss']
})
export class SubscriptionManagementComponent implements OnInit, OnDestroy {

  plans:        SubscriptionPlan[] = [];
  monthlyPlans: SubscriptionPlan[] = [];
  yearlyPlans:  SubscriptionPlan[] = [];
  currentSubscription: CurrentSubscription | null = null;
  usageStats:   UsageStats | null = null;
  loading       = false;
  selectedBillingPeriod: 'monthly' | 'yearly' = 'monthly';

  readonly isSandbox = environment.paymentMode === 'sandbox';

  // ── Modal offre annuelle ──────────────────────────────────
  showYearlyOfferModal  = false;
  proposedMonthlyPlan:  SubscriptionPlan | null = null;
  proposedYearlyPlan:   SubscriptionPlan | null = null;

  // ── Modal paiement ────────────────────────────────────────
  showPaymentModal   = false;
  pendingPlan:       SubscriptionPlan | null = null;
  selectedMethod:    PaymentMethod = 'mixx';
  paymentProcessing  = false;
  paymentSuccess     = false;

  // Formulaires
  cardForm!:   FormGroup;
  mobileForm!: FormGroup;

  constructor(
    private fb:                  FormBuilder,
    private http:                HttpClient,
    private route:               ActivatedRoute,
    private router:              Router,
    private authService:         AuthService,
    private toastService:        ToastService,
    private confirmationService: ConfirmationModalService,
    private subscriptionService: SubscriptionService
  ) {}

  ngOnInit(): void {
    this.buildForms();
    this.loadPlans();
    this.loadCurrentSubscription();
    this.loadUsageStats();
  }

  ngOnDestroy(): void {}

  // ─────────────────────────────────────────────────────────
  // FORMULAIRES
  // ─────────────────────────────────────────────────────────

  private buildForms(): void {
    this.cardForm = this.fb.group({
      holder_name: ['', [Validators.required, Validators.minLength(3)]],
      card_number: ['', [Validators.required]],
      expiry:      ['', [Validators.required, Validators.pattern(/^(0[1-9]|1[0-2])\/\d{2}$/)]],
      cvv:         ['', [Validators.required, Validators.pattern(/^\d{3,4}$/)]],
    });
    this.mobileForm = this.fb.group({
      phone: ['', [Validators.required, Validators.pattern(/^\d{8,9}$/)]],
    });
  }

  formatCardNumber(event: Event): void {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '').substring(0, 16);
    v = v.replace(/(.{4})/g, '$1 ').trim();
    this.cardForm.get('card_number')?.setValue(v, { emitEvent: false });
    input.value = v;
  }

  formatExpiry(event: Event): void {
    const input = event.target as HTMLInputElement;
    let v = input.value.replace(/\D/g, '').substring(0, 4);
    if (v.length >= 3) v = v.substring(0, 2) + '/' + v.substring(2);
    this.cardForm.get('expiry')?.setValue(v, { emitEvent: false });
    input.value = v;
  }

  // ─────────────────────────────────────────────────────────
  // CHARGEMENT
  // ─────────────────────────────────────────────────────────

  loadPlans(): void {
    this.http.get<SubscriptionPlan[]>(`${environment.apiUrl}/subscriptions/plans`).subscribe({
      next: (plans) => {
        this.plans        = plans;
        this.monthlyPlans = plans.filter(p => p.billing_period === 'monthly' || p.billing_period === 'lifetime');
        this.yearlyPlans  = plans.filter(p => p.billing_period === 'yearly'  || p.billing_period === 'lifetime');
      },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les plans'),
    });
  }

  loadCurrentSubscription(): void {
    this.http.get<CurrentSubscription>(`${environment.apiUrl}/subscriptions/current`).subscribe({
      next:  (s) => { this.currentSubscription = s; if (s.billing_period === 'yearly') this.selectedBillingPeriod = 'yearly'; },
      error: () => {},
    });
  }

  loadUsageStats(): void {
    this.http.get<UsageStats>(`${environment.apiUrl}/subscriptions/usage`).subscribe({
      next:  (s) => { this.usageStats = s; },
      error: () => {},
    });
  }

  // ─────────────────────────────────────────────────────────
  // SOUSCRIPTION
  // ─────────────────────────────────────────────────────────

  async subscribe(planId: number): Promise<void> {
    const plan = this.plans.find(p => p.id === planId);
    if (!plan) return;

    if (Number(plan.price) === 0) { await this.subscribeFree(plan); return; }

    // Plan mensuel → proposer annuel
    if (plan.billing_period === 'monthly') {
      const yearly = this.findYearlyEquivalent(plan);
      if (yearly) {
        this.proposedMonthlyPlan  = plan;
        this.proposedYearlyPlan   = yearly;
        this.showYearlyOfferModal = true;
        return;
      }
    }

    this.openPaymentModal(plan);
  }

  private async subscribeFree(plan: SubscriptionPlan): Promise<void> {
    const ok = await this.confirmationService.confirm(
      'Souscrire au plan gratuit',
      `Passer au plan "${plan.display_name}" ?`,
      { confirmText: 'Confirmer', cancelText: 'Annuler', type: 'info' }
    );
    if (!ok) return;
    this.loading = true;
    this.http.post(`${environment.apiUrl}/subscriptions/subscribe`, { plan_id: plan.id }).subscribe({
      next:  () => { this.toastService.showSuccess('Plan activé', `Plan ${plan.display_name} activé !`); this.loadCurrentSubscription(); this.loadUsageStats(); this.loading = false; },
      error: (e) => { this.toastService.showError('Erreur', e.error?.message || 'Erreur'); this.loading = false; },
    });
  }

  // ─────────────────────────────────────────────────────────
  // MODAL PAIEMENT
  // ─────────────────────────────────────────────────────────

  openPaymentModal(plan: SubscriptionPlan): void {
    this.pendingPlan      = plan;
    this.selectedMethod   = 'mixx';
    this.paymentSuccess   = false;
    this.paymentProcessing = false;
    this.cardForm.reset();
    this.mobileForm.reset();
    this.showPaymentModal = true;
  }

  closePaymentModal(): void {
    if (this.paymentProcessing) return; // bloquer fermeture pendant traitement
    this.showPaymentModal = false;
    this.pendingPlan      = null;
    this.paymentSuccess   = false;
  }

  selectMethod(m: PaymentMethod): void {
    this.selectedMethod = m;
    this.cardForm.reset();
    this.mobileForm.reset();
  }

  get currentFormValid(): boolean {
    return this.selectedMethod === 'card' ? this.cardForm.valid : this.mobileForm.valid;
  }

  async submitPayment(): Promise<void> {
    if (!this.pendingPlan) return;

    // Marquer les champs comme touchés pour afficher les erreurs
    if (this.selectedMethod === 'card') this.cardForm.markAllAsTouched();
    else this.mobileForm.markAllAsTouched();

    if (!this.currentFormValid) return;

    const body: any = {
      plan_id:        this.pendingPlan.id,
      payment_method: this.selectedMethod,
    };

    if (this.selectedMethod === 'card') {
      body.card_holder = this.cardForm.value.holder_name;
      body.card_number = this.cardForm.value.card_number?.replace(/\s/g, '');
      body.card_expiry = this.cardForm.value.expiry;
      body.card_cvv    = this.cardForm.value.cvv;
    } else {
      body.phone = this.mobileForm.value.phone;
    }

    this.paymentProcessing = true;

    this.http.post<any>(`${environment.apiUrl}/subscriptions/pay`, body).subscribe({
      next: (res) => {
        this.paymentProcessing = false;

        if (res.sandbox || (res.success && !res.payment_url)) {
          // Sandbox ou activation directe → succès visuel puis fermeture
          this.paymentSuccess = true;
          setTimeout(() => {
            this.closePaymentModal();
            this.toastService.showSuccess(
              '🎉 Abonnement activé !',
              `Plan ${res.plan_name || this.pendingPlan?.display_name} maintenant actif.`
            );
            this.loadCurrentSubscription();
            this.loadUsageStats();
          }, 1800);
        } else if (res.payment_url) {
          // Live CinetPay → redirection
          window.location.href = res.payment_url;
        }
      },
      error: (err) => {
        this.paymentProcessing = false;
        const msg = err.error?.error || err.error?.message || 'Paiement échoué. Vérifiez vos informations.';
        this.toastService.showError('Paiement échoué', msg);
      },
    });
  }

  // ─────────────────────────────────────────────────────────
  // MODAL OFFRE ANNUELLE
  // ─────────────────────────────────────────────────────────

  acceptYearlyOffer(): void {
    this.showYearlyOfferModal = false;
    if (this.proposedYearlyPlan) this.openPaymentModal(this.proposedYearlyPlan);
    this.proposedMonthlyPlan = this.proposedYearlyPlan = null;
  }

  declineYearlyOffer(): void {
    this.showYearlyOfferModal = false;
    if (this.proposedMonthlyPlan) this.openPaymentModal(this.proposedMonthlyPlan);
    this.proposedMonthlyPlan = this.proposedYearlyPlan = null;
  }

  closeYearlyOfferModal(): void {
    this.showYearlyOfferModal = false;
    this.proposedMonthlyPlan  = this.proposedYearlyPlan = null;
  }

  // ─────────────────────────────────────────────────────────
  // ANNULATION
  // ─────────────────────────────────────────────────────────

  async cancelSubscription(): Promise<void> {
    const ok = await this.confirmationService.confirm(
      'Annuler l\'abonnement',
      'Vous serez rétrogradé au plan gratuit à la fin de votre période.',
      { confirmText: 'Oui, annuler', cancelText: 'Non, conserver', type: 'danger' }
    );
    if (!ok) return;
    this.loading = true;
    this.http.post(`${environment.apiUrl}/subscriptions/cancel`, {}).subscribe({
      next:  () => { this.toastService.showSuccess('Annulé', 'Abonnement annulé.'); this.loadCurrentSubscription(); this.loadUsageStats(); this.loading = false; },
      error: (e) => { this.toastService.showError('Erreur', e.error?.error || 'Erreur'); this.loading = false; },
    });
  }

  // ─────────────────────────────────────────────────────────
  // HELPERS
  // ─────────────────────────────────────────────────────────

  getDisplayedPlans(): SubscriptionPlan[] { return this.selectedBillingPeriod === 'monthly' ? this.monthlyPlans : this.yearlyPlans; }
  toggleBillingPeriod(p: 'monthly' | 'yearly'): void { this.selectedBillingPeriod = p; }
  isCurrentPlan(id: number): boolean { return this.currentSubscription?.plan_id === id; }

  canUpgrade(plan: SubscriptionPlan): boolean {
    if (!this.currentSubscription) return true;
    if (this.currentSubscription.billing_period === plan.billing_period)
      return Number(plan.price) > this.getPlanPrice(this.currentSubscription.plan_id);
    return true;
  }

  getPlanPrice(id: number): number { return Number(this.plans.find(p => p.id === id)?.price ?? 0); }

  findYearlyEquivalent(plan: SubscriptionPlan): SubscriptionPlan | null {
    return this.yearlyPlans.find(p => p.name === plan.name + '_yearly' || p.name.replace('_yearly','') === plan.name) || null;
  }

  calculateYearlySavings(mp: SubscriptionPlan, yp: SubscriptionPlan): number { return (Number(mp.price) * 12) - Number(yp.price); }
  calculateSavingsPercentage(mp: SubscriptionPlan, yp: SubscriptionPlan): number {
    return Math.round((this.calculateYearlySavings(mp, yp) / (Number(mp.price) * 12)) * 100);
  }
  getYearlySavings(p: SubscriptionPlan): number {
    if (p.billing_period !== 'yearly') return 0;
    const mp = this.monthlyPlans.find(m => m.name === p.name.replace('_yearly',''));
    return mp ? (Number(mp.price) * 12) - Number(p.price) : 0;
  }
  getSavingsPercentage(p: SubscriptionPlan): number {
    const s = this.getYearlySavings(p);
    if (!s) return 0;
    const mp = this.monthlyPlans.find(m => m.name === p.name.replace('_yearly',''));
    return mp ? Math.round((s / (Number(mp.price) * 12)) * 100) : 0;
  }

  getUsagePercentage(used: number, limit: number | null): number {
    return !limit ? 0 : Math.min((used / limit) * 100, 100);
  }
  getUsageClass(pct: number): string { return pct >= 90 ? 'danger' : pct >= 70 ? 'warning' : 'success'; }
  getBillingLabel(p: string): string { return ({ monthly: 'par mois', yearly: 'par an', lifetime: 'à vie' } as any)[p] ?? p; }

  getBusinessType(): string | null { return this.authService.getBusiness()?.type || null; }
  shouldShowReservations():  boolean { return this.getBusinessType() === 'restaurant'; }
  shouldShowSpecialOrders(): boolean { return this.getBusinessType() === 'traiteur'; }

  getCtaLabel(plan: SubscriptionPlan): string {
    if (Number(plan.price) === 0) return this.currentSubscription ? 'Passer au gratuit' : 'Commencer gratuitement';
    const amount = Number(plan.price).toLocaleString('fr-FR');
    return this.currentSubscription ? `Changer — ${amount} FCFA` : `Souscrire — ${amount} FCFA`;
  }
}