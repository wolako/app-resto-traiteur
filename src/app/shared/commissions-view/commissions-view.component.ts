import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../core/services/toast/toast.service';  // ✅ AJOUTER
import { AuthService } from '../../core/services/auth/auth.service';

interface Commission {
  id: number;
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

interface CommissionTotals {
  total_count: string;
  total_amount: string;
}

interface CommissionStats {
  total: number;
  pending: number;
  collected: number;
  paid: number;
  totalAmount: number;
  pendingAmount: number;
  collectedAmount: number;
  paidAmount: number;
}

@Component({
  selector: 'app-commissions-view',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './commissions-view.component.html',
  styleUrls: ['./commissions-view.component.scss']
})
export class CommissionsViewComponent implements OnInit {
  @Input() pageTitle = 'Mes Commissions';
  @Input() businessType = 'restaurant';

  commissions: any[] = [];
  stats: any = null;
  loading = false;
  error: string | null = null;

  constructor(
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.loadCommissions();
  }

  loadCommissions(): void {
    const business = this.authService.getBusiness();
    if (!business?.id) {
      this.error = 'Impossible de récupérer votre établissement.';
      return;
    }

    this.loading = true;
    this.error = null;

    this.http.get<any>(`${environment.apiUrl}/commissions/business/${business.id}`)
      .subscribe({
        next: (res) => {
          // ✅ Le backend renvoie directement { commissions, totals, stats }
          this.commissions = res.commissions || [];
          this.stats = res.stats || this.computeStats();
          this.loading = false;
        },
        error: (err) => {
          console.error('Erreur chargement commissions:', err);
          // Fallback : essayer /commissions/my
          this.loadCommissionsFallback();
        }
      });
  }

  private loadCommissionsFallback(): void {
    this.http.get<any>(`${environment.apiUrl}/commissions/my`)
      .subscribe({
        next: (res) => {
          const data = res.data ?? res;
          this.commissions = data.commissions ?? data ?? [];
          this.stats = data.stats ?? this.computeStats();
          this.loading = false;
        },
        error: () => {
          this.loading = false;
          this.error = 'Impossible de charger les commissions.';
          this.toastService.showError('Erreur', 'Impossible de charger les commissions');
        }
      });
  }

  private computeStats(): any {
    const pending = this.commissions
      .filter(c => c.status === 'pending')
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0);
    const collected = this.commissions
      .filter(c => c.status === 'collected' || c.status === 'paid')
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0);
    return {
      total_pending:   pending,
      total_collected: collected,
      count:           this.commissions.length
    };
  }

  getTotalAmount(): number {
    return this.commissions.reduce((s, c) => s + Number(c.commission_amount || 0), 0);
  }

  getStatusLabel(status: string): string {
    const labels: { [k: string]: string } = {
      pending:   'En attente',
      collected: 'Collectée',
      paid:      'Payée',
      cancelled: 'Annulée'
    };
    return labels[status] || status;
  }

  formatMontant(n: any): string {
    return Math.round(Number(n || 0)).toLocaleString('fr-FR');
  }
}
