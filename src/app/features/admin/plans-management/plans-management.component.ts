import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';

interface SubscriptionPlan {
  id?: number;
  name: string;
  display_name: string;
  description: string;
  price: number;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_photos: number;
  can_accept_online_orders: boolean;
  can_accept_reservations: boolean;
  can_accept_special_orders: boolean;
  priority_support: boolean;
  analytics_access: boolean;
  custom_branding: boolean;
  api_access: boolean;
  commission_rate: number;
  is_active: boolean;
  sort_order: number;
}

@Component({
  selector: 'app-plans-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './plans-management.component.html',
  styleUrls: ['./plans-management.component.scss']
})
export class PlansManagementComponent implements OnInit {
  plans: SubscriptionPlan[] = [];
  selectedPlan: SubscriptionPlan | null = null;
  showModal = false;
  isEditing = false;
  loading = false;
  savingPlan = false;

  newPlan: SubscriptionPlan = this.getEmptyPlan();

  constructor(
    private http: HttpClient,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadPlans();
  }

  getEmptyPlan(): SubscriptionPlan {
    return {
      name: '',
      display_name: '',
      description: '',
      price: 0,
      billing_period: 'monthly',
      max_menu_items: null,
      max_orders_per_month: null,
      max_photos: 5,
      can_accept_online_orders: true,
      can_accept_reservations: true,
      can_accept_special_orders: true,
      priority_support: false,
      analytics_access: false,
      custom_branding: false,
      api_access: false,
      commission_rate: 5.0,
      is_active: true,
      sort_order: 0
    };
  }

  loadPlans(): void {
    this.loading = true;
    this.http.get<SubscriptionPlan[]>(`${environment.apiUrl}/subscriptions/plans`).subscribe({
      next: (plans) => {
        this.plans = plans.sort((a, b) => a.sort_order - b.sort_order);
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement plans:', err);
        this.loading = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger les plans d\'abonnement'
        );
      }
    });
  }

  openCreateModal(): void {
    this.newPlan = this.getEmptyPlan();
    this.isEditing = false;
    this.showModal = true;
  }

  openEditModal(plan: SubscriptionPlan): void {
    this.newPlan = { ...plan };
    this.isEditing = true;
    this.showModal = true;
  }

  closeModal(): void {
    this.showModal = false;
    this.newPlan = this.getEmptyPlan();
  }

  async savePlan(): Promise<void> {
    if (!this.validatePlan()) {
      this.toastService.showWarning(
        'Formulaire incomplet',
        'Veuillez remplir tous les champs obligatoires (nom, nom d\'affichage, prix, période de facturation)'
      );
      return;
    }

    this.savingPlan = true;

    if (this.isEditing && this.newPlan.id) {
      // Update
      this.http.put<SubscriptionPlan>(
        `${environment.apiUrl}/admin/subscription-plans/${this.newPlan.id}`,
        this.newPlan
      ).subscribe({
        next: () => {
          this.loadPlans();
          this.closeModal();
          this.savingPlan = false;
          this.toastService.showSuccess(
            'Plan mis à jour',
            `Le plan "${this.newPlan.display_name}" a été mis à jour avec succès`
          );
        },
        error: (err) => {
          console.error('Erreur mise à jour plan:', err);
          this.savingPlan = false;
          this.toastService.showError(
            'Erreur de mise à jour',
            err.error?.error || 'Impossible de mettre à jour le plan'
          );
        }
      });
    } else {
      // Create
      this.http.post<SubscriptionPlan>(
        `${environment.apiUrl}/admin/subscription-plans`,
        this.newPlan
      ).subscribe({
        next: () => {
          this.loadPlans();
          this.closeModal();
          this.savingPlan = false;
          this.toastService.showSuccess(
            'Plan créé',
            `Le plan "${this.newPlan.display_name}" a été créé avec succès`
          );
        },
        error: (err) => {
          console.error('Erreur création plan:', err);
          this.savingPlan = false;
          this.toastService.showError(
            'Erreur de création',
            err.error?.error || 'Impossible de créer le plan'
          );
        }
      });
    }
  }

  validatePlan(): boolean {
    return !!(
      this.newPlan.name &&
      this.newPlan.display_name &&
      this.newPlan.billing_period &&
      this.newPlan.price >= 0 &&
      this.newPlan.commission_rate >= 0
    );
  }

  async togglePlanStatus(plan: SubscriptionPlan): Promise<void> {
    const action = plan.is_active ? 'désactiver' : 'activer';
    const confirmed = await this.confirmationService.confirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} le plan`,
      `Voulez-vous ${action} le plan "${plan.display_name}" ?\n\n${plan.is_active ? 'Les utilisateurs ne pourront plus souscrire à ce plan.' : 'Le plan sera à nouveau disponible pour les utilisateurs.'}`,
      {
        confirmText: `Oui, ${action}`,
        cancelText: 'Annuler',
        type: plan.is_active ? 'warning' : 'success'
      }
    );

    if (!confirmed) return;

    this.http.put(
      `${environment.apiUrl}/admin/subscription-plans/${plan.id}`,
      { ...plan, is_active: !plan.is_active }
    ).subscribe({
      next: () => {
        this.loadPlans();
        this.toastService.showSuccess(
          'Statut mis à jour',
          `Le plan "${plan.display_name}" a été ${plan.is_active ? 'désactivé' : 'activé'}`
        );
      },
      error: (err) => {
        console.error('Erreur mise à jour statut:', err);
        this.toastService.showError(
          'Erreur de mise à jour',
          err.error?.error || 'Impossible de mettre à jour le statut du plan'
        );
      }
    });
  }

  getBillingPeriodLabel(period: string): string {
    const labels: { [key: string]: string } = {
      monthly: 'par mois',
      yearly: 'par an',
      lifetime: 'à vie'
    };
    return labels[period] || period;
  }

  async deletePlan(plan: SubscriptionPlan): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Supprimer le plan',
      `Êtes-vous sûr de vouloir SUPPRIMER le plan "${plan.display_name}" ?\n\nAttention : Cette action est irréversible et affectera tous les utilisateurs actuellement abonnés à ce plan.`,
      {
        confirmText: 'Oui, supprimer',
        cancelText: 'Non, annuler',
        type: 'danger'
      }
    );

    if (!confirmed) return;

    this.http.delete(`${environment.apiUrl}/admin/subscription-plans/${plan.id}`).subscribe({
      next: () => {
        this.loadPlans();
        this.toastService.showSuccess(
          'Plan supprimé',
          `Le plan "${plan.display_name}" a été supprimé avec succès`
        );
      },
      error: (err) => {
        console.error('Erreur suppression plan:', err);
        this.toastService.showError(
          'Erreur de suppression',
          err.error?.error || 'Impossible de supprimer le plan. Il est peut-être utilisé par des utilisateurs.'
        );
      }
    });
  }
}