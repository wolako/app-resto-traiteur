import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast/toast.service';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-pay-deposit',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pay-deposit.component.html',
  styleUrls: ['./pay-deposit.component.scss']
})
export class PayDepositComponent implements OnInit {
  
  orderId: number | null = null;
  order: any = null;
  loading = true;
  paying = false;
  
  selectedMethod: string = 'Mixx By Yas';
  
  Math = Math;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private http: HttpClient,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      this.orderId = parseInt(params['id']);
      if (this.orderId) {
        this.loadOrder();
      }
    });
  }

  loadOrder(): void {
    this.loading = true;
    this.http.get(`${environment.apiUrl}/orders/special/${this.orderId}`).subscribe({
      next: (response: any) => {
        this.order = response.data || response;
        this.loading = false;

        // Vérifier si devis existe
        if (!this.order.quoted_amount) {
          this.toastService.showError('Erreur', 'Aucun devis disponible pour cette commande');
          this.router.navigate(['/']);
        }

        // Vérifier si déjà payé
        if (this.order.deposit_status === 'paid') {
          this.toastService.showInfo('Déjà payé', 'L\'acompte a déjà été payé pour cette commande');
        }
      },
      error: (error) => {
        this.loading = false;
        this.toastService.showError('Erreur', 'Impossible de charger le devis');
        this.router.navigate(['/']);
      }
    });
  }

  payDeposit(): void {
    if (!this.orderId || !this.selectedMethod) return;

    this.paying = true;

    this.http.post(
      `${environment.apiUrl}/orders/special/${this.orderId}/accept-quote`,
      {
        deposit_payment_method: this.selectedMethod
      }
    ).subscribe({
      next: (response: any) => {
        this.paying = false;

        if (response.payment_url) {
          // Redirection vers CinetPay
          window.location.href = response.payment_url;
        } else if (response.sandbox) {
          // Mode sandbox
          this.toastService.showSuccess(
            'Paiement sandbox accepté',
            'L\'acompte a été enregistré (mode test)'
          );
          setTimeout(() => this.loadOrder(), 2000);
        } else if (response.payment_info?.type === 'cod') {
          // COD
          this.toastService.showSuccess(
            'Commande confirmée',
            'Acompte à payer chez le traiteur'
          );
          setTimeout(() => this.router.navigate(['/']), 2000);
        } else {
          this.toastService.showSuccess('Paiement initié', 'Veuillez suivre les instructions');
        }
      },
      error: (error) => {
        this.paying = false;
        this.toastService.showError(
          'Erreur',
          error.error?.error || 'Impossible d\'initier le paiement'
        );
      }
    });
  }

  formatAmount(amount: number): string {
    return Math.round(amount).toLocaleString('fr-FR');
  }

  getEventTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      mariage: '💍 Mariage',
      anniversaire: '🎂 Anniversaire',
      bapteme: '👶 Baptême',
      entreprise: '🏢 Événement d\'entreprise',
      reception: '🎉 Réception',
      autre: '🎪 Autre'
    };
    return labels[type] || type;
  }
}