// subscription-management.component.ts - AVEC AFFICHAGE DE TOUTES LES LIMITES

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { AuthService } from '../../core/services/auth/auth.service';
import { ToastService } from '../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../core/services/confirmation-modal/confirmation-modal.service';
import { CommissionRatePipe } from '../pipes/commission-rate/commission-rate.pipe';

interface SubscriptionPlan {
  id: number;
  name: string;
  display_name: string;
  description: string;
  price: number;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_reservations_per_month: number | null;  // ✅ AJOUTÉ
  max_special_orders_per_month: number | null; // ✅ AJOUTÉ
  max_photos: number;
  can_accept_online_orders: boolean;
  can_accept_reservations: boolean;
  can_accept_special_orders: boolean;
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
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_reservations_per_month: number | null;  // ✅ AJOUTÉ
  max_special_orders_per_month: number | null; // ✅ AJOUTÉ
  max_photos: number;
  billing_period: string;
}

interface UsageStats {
  subscription: {
    plan_name: string;
    status: string;
    end_date: string | null;
  };
  limits: {
    menu_items: number | null;
    orders_per_month: number | null;
    reservations_per_month: number | null;  // ✅ AJOUTÉ
    special_orders_per_month: number | null; // ✅ AJOUTÉ
    photos: number;
  };
  usage: {
    menu_items: number;
    orders_this_month: number;
    reservations_this_month: number;  // ✅ AJOUTÉ
    special_orders_this_month: number; // ✅ AJOUTÉ
    photos: number;
  };
}

@Component({
  selector: 'app-subscription-management',
  standalone: true,
  imports: [CommonModule, CommissionRatePipe],
  templateUrl: './subscription-management.component.html',
  styleUrls: ['./subscription-management.component.scss']
})
export class SubscriptionManagementComponent implements OnInit {
  plans: SubscriptionPlan[] = [];
  monthlyPlans: SubscriptionPlan[] = [];
  yearlyPlans: SubscriptionPlan[] = [];
  currentSubscription: CurrentSubscription | null = null;
  usageStats: UsageStats | null = null;
  loading = false;
  selectedBillingPeriod: 'monthly' | 'yearly' = 'monthly';
  
  showYearlyOfferModal = false;
  proposedMonthlyPlan: SubscriptionPlan | null = null;
  proposedYearlyPlan: SubscriptionPlan | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadPlans();
    this.loadCurrentSubscription();
    this.loadUsageStats();
  }

  loadPlans(): void {
    this.http.get<SubscriptionPlan[]>(`${environment.apiUrl}/subscriptions/plans`)
      .subscribe({
        next: (plans) => {
          this.plans = plans;
          this.monthlyPlans = plans.filter(p => p.billing_period === 'monthly' || p.billing_period === 'lifetime');
          this.yearlyPlans = plans.filter(p => p.billing_period === 'yearly' || p.billing_period === 'lifetime');
        },
        error: (err) => {
          console.error('Erreur chargement plans:', err);
          this.toastService.showError(
            'Erreur de chargement',
            'Impossible de charger les plans d\'abonnement'
          );
        }
      });
  }

  loadCurrentSubscription(): void {
    this.http.get<CurrentSubscription>(`${environment.apiUrl}/subscriptions/current`)
      .subscribe({
        next: (subscription) => {
          this.currentSubscription = subscription;
          if (subscription.billing_period === 'yearly') {
            this.selectedBillingPeriod = 'yearly';
          }
        },
        error: (err) => {
          console.error('Erreur chargement abonnement:', err);
        }
      });
  }

  loadUsageStats(): void {
    this.http.get<UsageStats>(`${environment.apiUrl}/subscriptions/usage`)
      .subscribe({
        next: (stats) => {
          this.usageStats = stats;
        },
        error: (err) => {
          console.error('Erreur chargement statistiques:', err);
        }
      });
  }

  getDisplayedPlans(): SubscriptionPlan[] {
    return this.selectedBillingPeriod === 'monthly' ? this.monthlyPlans : this.yearlyPlans;
  }

  toggleBillingPeriod(period: 'monthly' | 'yearly'): void {
    this.selectedBillingPeriod = period;
  }

  findYearlyEquivalent(monthlyPlan: SubscriptionPlan): SubscriptionPlan | null {
    return this.yearlyPlans.find(p => 
      p.name === monthlyPlan.name + '_yearly' || 
      (p.name.replace('_yearly', '') === monthlyPlan.name)
    ) || null;
  }

  calculateYearlySavings(monthlyPlan: SubscriptionPlan, yearlyPlan: SubscriptionPlan): number {
    const yearlyEquivalentCost = monthlyPlan.price * 12;
    return yearlyEquivalentCost - yearlyPlan.price;
  }

  calculateSavingsPercentage(monthlyPlan: SubscriptionPlan, yearlyPlan: SubscriptionPlan): number {
    const savings = this.calculateYearlySavings(monthlyPlan, yearlyPlan);
    const yearlyEquivalentCost = monthlyPlan.price * 12;
    return Math.round((savings / yearlyEquivalentCost) * 100);
  }

  async subscribe(planId: number): Promise<void> {
    const plan = this.plans.find(p => p.id === planId);
    
    if (!plan) {
      this.toastService.showError('Erreur', 'Plan introuvable');
      return;
    }

    if (plan.billing_period === 'monthly' && 
        plan.price > 0 && 
        this.selectedBillingPeriod === 'monthly') {
      
      const yearlyEquivalent = this.findYearlyEquivalent(plan);
      
      if (yearlyEquivalent) {
        this.proposedMonthlyPlan = plan;
        this.proposedYearlyPlan = yearlyEquivalent;
        this.showYearlyOfferModal = true;
        return;
      }
    }

    await this.confirmAndSubscribe(planId);
  }

  async confirmAndSubscribe(planId: number): Promise<void> {
    const plan = this.plans.find(p => p.id === planId);
    const planName = plan?.display_name || 'ce plan';

    const confirmed = await this.confirmationService.confirm(
      'Confirmer l\'abonnement',
      `Êtes-vous sûr de vouloir souscrire au plan ${planName} ?`,
      {
        confirmText: 'Oui, souscrire',
        cancelText: 'Annuler',
        type: 'info'
      }
    );

    if (!confirmed) return;

    this.loading = true;

    this.http.post(`${environment.apiUrl}/subscriptions/subscribe`, { 
      plan_id: planId,
      simulate_payment: true
    })
      .subscribe({
        next: (response: any) => {
          this.toastService.showSuccess(
            'Abonnement activé',
            `Vous êtes maintenant abonné au plan ${planName} !`
          );
          this.loadCurrentSubscription();
          this.loadUsageStats();
          this.loading = false;
        },
        error: (err) => {
          console.error('Erreur souscription:', err);
          this.toastService.showError(
            'Erreur de souscription',
            err.error?.message || err.error?.error || 'Impossible de souscrire à ce plan. Veuillez réessayer.'
          );
          this.loading = false;
        }
      });
  }

  async acceptYearlyOffer(): Promise<void> {
    this.showYearlyOfferModal = false;
    
    if (this.proposedYearlyPlan) {
      await this.confirmAndSubscribe(this.proposedYearlyPlan.id);
    }
    
    this.proposedMonthlyPlan = null;
    this.proposedYearlyPlan = null;
  }

  async declineYearlyOffer(): Promise<void> {
    this.showYearlyOfferModal = false;
    
    if (this.proposedMonthlyPlan) {
      await this.confirmAndSubscribe(this.proposedMonthlyPlan.id);
    }
    
    this.proposedMonthlyPlan = null;
    this.proposedYearlyPlan = null;
  }

  closeYearlyOfferModal(): void {
    this.showYearlyOfferModal = false;
    this.proposedMonthlyPlan = null;
    this.proposedYearlyPlan = null;
  }

  async upgrade(planId: number): Promise<void> {
    const plan = this.plans.find(p => p.id === planId);
    const planName = plan?.display_name || 'ce plan';

    const confirmed = await this.confirmationService.confirm(
      'Changer de plan',
      `Êtes-vous sûr de vouloir passer au plan ${planName} ?`,
      {
        confirmText: 'Oui, changer',
        cancelText: 'Annuler',
        type: 'warning'
      }
    );

    if (!confirmed) return;

    this.loading = true;

    this.http.post(`${environment.apiUrl}/subscriptions/upgrade`, { 
      plan_id: planId,
      simulate_payment: true
    })
      .subscribe({
        next: (response: any) => {
          this.toastService.showSuccess(
            'Plan mis à jour',
            `Votre plan a été changé pour ${planName} avec succès !`
          );
          this.loadCurrentSubscription();
          this.loadUsageStats();
          this.loading = false;
        },
        error: (err) => {
          console.error('Erreur upgrade:', err);
          this.toastService.showError(
            'Erreur de mise à jour',
            err.error?.message || err.error?.error || 'Impossible de changer de plan. Veuillez réessayer.'
          );
          this.loading = false;
        }
      });
  }

  async cancelSubscription(): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Annuler l\'abonnement',
      'Êtes-vous sûr de vouloir annuler votre abonnement ? Vous serez rétrogradé au plan gratuit à la fin de votre période de facturation.',
      {
        confirmText: 'Oui, annuler',
        cancelText: 'Non, conserver',
        type: 'danger'
      }
    );

    if (!confirmed) return;

    this.loading = true;

    this.http.post(`${environment.apiUrl}/subscriptions/cancel`, {})
      .subscribe({
        next: () => {
          this.toastService.showSuccess(
            'Abonnement annulé',
            'Votre abonnement a été annulé. Vous repassez au plan gratuit.'
          );
          this.loadCurrentSubscription();
          this.loadUsageStats();
          this.loading = false;
        },
        error: (err) => {
          console.error('Erreur annulation:', err);
          this.toastService.showError(
            'Erreur d\'annulation',
            err.error?.error || 'Impossible d\'annuler votre abonnement. Veuillez réessayer.'
          );
          this.loading = false;
        }
      });
  }

  getBillingPeriodLabel(period: string): string {
    const labels: { [key: string]: string } = {
      'monthly': 'par mois',
      'yearly': 'par an',
      'lifetime': 'à vie'
    };
    return labels[period] || period;
  }

  getYearlySavings(plan: SubscriptionPlan): number {
    if (plan.billing_period !== 'yearly') return 0;
    
    const monthlyPlan = this.monthlyPlans.find(p => p.name === plan.name.replace('_yearly', ''));
    if (!monthlyPlan) return 0;
    
    const yearlyEquivalent = monthlyPlan.price * 12;
    return yearlyEquivalent - plan.price;
  }

  getSavingsPercentage(plan: SubscriptionPlan): number {
    const savings = this.getYearlySavings(plan);
    if (savings === 0) return 0;
    
    const monthlyPlan = this.monthlyPlans.find(p => p.name === plan.name.replace('_yearly', ''));
    if (!monthlyPlan) return 0;
    
    const yearlyEquivalent = monthlyPlan.price * 12;
    return Math.round((savings / yearlyEquivalent) * 100);
  }

  getUsagePercentage(used: number, limit: number | null): number {
    if (!limit) return 0;
    return Math.min((used / limit) * 100, 100);
  }

  getUsageClass(percentage: number): string {
    if (percentage >= 90) return 'danger';
    if (percentage >= 70) return 'warning';
    return 'success';
  }

  isCurrentPlan(planId: number): boolean {
    return this.currentSubscription?.plan_id === planId;
  }

  canUpgrade(plan: SubscriptionPlan): boolean {
    if (!this.currentSubscription) return true;
    
    if (this.currentSubscription.billing_period === plan.billing_period) {
      return plan.price > this.getPlanPrice(this.currentSubscription.plan_id);
    }
    
    return true;
  }

  getPlanPrice(planId: number): number {
    const plan = this.plans.find(p => p.id === planId);
    return plan?.price || 0;
  }

  // ✅ NOUVEAU : Déterminer le type d'établissement pour afficher les bonnes limites
  getBusinessType(): 'restaurant' | 'traiteur' | null {
    const business = this.authService.getBusiness();
    return business?.type as 'restaurant' | 'traiteur' || null;
  }

  // ✅ NOUVEAU : Vérifier si on doit afficher les réservations (restaurants uniquement)
  shouldShowReservations(): boolean {
    return this.getBusinessType() === 'restaurant';
  }

  // ✅ NOUVEAU : Vérifier si on doit afficher les commandes spéciales (traiteurs uniquement)
  shouldShowSpecialOrders(): boolean {
    return this.getBusinessType() === 'traiteur';
  }
}