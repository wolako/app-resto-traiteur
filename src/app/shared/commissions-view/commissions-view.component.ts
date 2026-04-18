// ═════════════════════════════════════════════════════════════════════════════
// COMMISSIONS-VIEW.COMPONENT.TS - VERSION CORRIGÉE COMPLÈTE
// Remplacer le fichier existant par celui-ci
// ═════════════════════════════════════════════════════════════════════════════

import { Component, OnInit, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ToastService } from '../../core/services/toast/toast.service';
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
  restaurant_amount?: number;
  platform_amount?: number;
  payment_split_completed?: boolean;
  status: 'pending' | 'collected' | 'paid' | 'cancelled';
  created_at: string;
  collected_at?: string;
  paid_at?: string;
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

  commissions: Commission[] = [];
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

    console.log('🔍 [Commissions] Chargement pour business ID:', business.id);

    this.http.get<any>(`${environment.apiUrl}/commissions/business/${business.id}`)
      .subscribe({
        next: (res) => {
          console.log('✅ [Commissions] Réponse API:', res);
          
          // Gérer les différents formats de réponse
          let commissionsData: Commission[] = [];
          let statsData: any = null;

          // Format 1: { success: true, data: { commissions, stats } }
          if (res.success && res.data) {
            commissionsData = res.data.commissions || [];
            statsData = res.data.stats;
          }
          // Format 2: { success: true, commissions, stats }
          else if (res.success) {
            commissionsData = res.commissions || [];
            statsData = res.stats;
          }
          // Format 3: { commissions, stats }
          else {
            commissionsData = res.commissions || res || [];
            statsData = res.stats;
          }

          this.commissions = commissionsData;
          this.stats = statsData || this.computeStats();
          
          console.log(`📊 [Commissions] ${this.commissions.length} commissions chargées`);
          console.log('📊 [Commissions] Stats:', this.stats);
          
          this.loading = false;
        },
        error: (err) => {
          console.error('❌ [Commissions] Erreur:', err);
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
      .filter(c => c.status === 'collected')
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0);

    const paid = this.commissions
      .filter(c => c.status === 'paid')
      .reduce((s, c) => s + Number(c.commission_amount || 0), 0);
    
    return {
      total_pending: pending,
      total_collected: collected + paid,
      count: this.commissions.length
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