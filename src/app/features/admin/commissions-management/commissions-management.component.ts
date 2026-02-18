import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';

interface Commission {
  id: number;
  business_id: number;
  business_name: string;
  order_id?: number;
  special_order_id?: number;
  order_number?: number;
  special_order_type?: string;
  order_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'collected' | 'paid' | 'cancelled';
  created_at: string;
  collected_at?: string;
  paid_at?: string;
}

interface CommissionStats {
  total_commissions: number;
  total_amount: number;
  pending_amount: number;
  collected_amount: number;
  paid_amount: number;
  pending_count: number;
  collected_count: number;
  paid_count: number;
}

@Component({
  selector: 'app-commissions-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './commissions-management.component.html',
  styleUrls: ['./commissions-management.component.scss']
})
export class CommissionsManagementComponent implements OnInit {
  commissions: Commission[] = [];
  stats: CommissionStats | null = null;
  loading = false;
  
  // Filters
  selectedStatus = '';
  selectedBusiness = '';
  currentPage = 1;
  totalPages = 1;
  limit = 20;

  // Loading states pour les actions
  updatingCommissionId: number | null = null;

  // Exposer Math au template
  Math = Math;

  constructor(
    private http: HttpClient,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadStats();
    this.loadCommissions();
  }

  loadStats(): void {
    this.http.get<any>(`${environment.apiUrl}/commissions/stats`).subscribe({
      next: (stats) => {
        // Convertir les strings en numbers si nécessaire
        this.stats = {
          total_commissions: Number(stats.total_commissions) || 0,
          total_amount: Number(stats.total_amount) || 0,
          pending_amount: Number(stats.pending_amount) || 0,
          collected_amount: Number(stats.collected_amount) || 0,
          paid_amount: Number(stats.paid_amount) || 0,
          pending_count: Number(stats.pending_count) || 0,
          collected_count: Number(stats.collected_count) || 0,
          paid_count: Number(stats.paid_count) || 0
        };
      },
      error: (err) => {
        console.error('Erreur chargement statistiques:', err);
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger les statistiques des commissions'
        );
      }
    });
  }

  loadCommissions(): void {
    this.loading = true;
    
    const params: any = {
      page: this.currentPage,
      limit: this.limit
    };
    
    if (this.selectedStatus) params.status = this.selectedStatus;
    if (this.selectedBusiness) params.business_id = this.selectedBusiness;

    const queryString = new URLSearchParams(params).toString();

    // ✅ CORRIGÉ : Route sans /admin/
    this.http.get<{ data: { commissions: Commission[], total: number, page: number, limit: number } }>(
      `${environment.apiUrl}/commissions/all?${queryString}`
    ).subscribe({
      next: (response) => {
        // ✅ Adapter à la structure { data: { commissions, total, ... } }
        const data = response.data || response;
        this.commissions = data.commissions || [];
        this.totalPages = Math.ceil((data.total || 0) / this.limit);
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement commissions:', err);
        this.loading = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger les commissions'
        );
      }
    });
  }

  filterByStatus(status: string): void {
    this.selectedStatus = status;
    this.currentPage = 1;
    this.loadCommissions();
  }

  async markAsCollected(commission: Commission): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Collecter la commission',
      `Voulez-vous marquer la commission #${commission.id} (${commission.commission_amount} FCFA) comme collectée ?\n\nRestaurant: ${commission.business_name}`,
      {
        confirmText: 'Oui, collecter',
        cancelText: 'Annuler',
        type: 'info'
      }
    );

    if (!confirmed) return;

    this.updatingCommissionId = commission.id;

    // ✅ CORRIGÉ : Utiliser PATCH au lieu de POST
    this.http.patch(`${environment.apiUrl}/commissions/${commission.id}/collect`, {}).subscribe({
      next: () => {
        this.updatingCommissionId = null;
        this.toastService.showSuccess(
          'Commission collectée',
          `La commission #${commission.id} de ${commission.commission_amount} FCFA a été marquée comme collectée`
        );
        this.loadCommissions();
        this.loadStats();
      },
      error: (err) => {
        console.error('Erreur:', err);
        this.updatingCommissionId = null;
        this.toastService.showError(
          'Erreur de mise à jour',
          err.error?.message || err.error?.error || 'Impossible de marquer la commission comme collectée'
        );
      }
    });
  }

  async markAsPaid(commission: Commission): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Payer la commission',
      `Voulez-vous marquer la commission #${commission.id} (${commission.commission_amount} FCFA) comme payée ?\n\nCette action confirmera le paiement au restaurant "${commission.business_name}".`,
      {
        confirmText: 'Oui, payer',
        cancelText: 'Annuler',
        type: 'success'
      }
    );

    if (!confirmed) return;

    this.updatingCommissionId = commission.id;

    // ✅ CORRIGÉ : Utiliser PATCH au lieu de POST
    this.http.patch(`${environment.apiUrl}/commissions/${commission.id}/pay`, {}).subscribe({
      next: () => {
        this.updatingCommissionId = null;
        this.toastService.showSuccess(
          'Commission payée',
          `La commission #${commission.id} de ${commission.commission_amount} FCFA a été marquée comme payée`
        );
        this.loadCommissions();
        this.loadStats();
      },
      error: (err) => {
        console.error('Erreur:', err);
        this.updatingCommissionId = null;
        this.toastService.showError(
          'Erreur de paiement',
          err.error?.message || err.error?.error || 'Impossible de marquer la commission comme payée'
        );
      }
    });
  }

  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.loadCommissions();
    }
  }

  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.loadCommissions();
    }
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'collected': 'Collectée',
      'paid': 'Payée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  getStatusClass(status: string): string {
    return `status-${status}`;
  }

  isUpdating(commissionId: number): boolean {
    return this.updatingCommissionId === commissionId;
  }
}