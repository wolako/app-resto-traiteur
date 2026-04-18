import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-order-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './order-details-modal.component.html',
  styleUrl: './order-details-modal.component.scss'
})
export class OrderDetailsModalComponent {
  @Input() order: any | null = null;
  @Input() show = false;
  @Input() loading = false;
  @Output() closed = new EventEmitter<void>();
  @Output() statusChanged = new EventEmitter<{ orderId: number; status: string }>();

  closeModal(): void {
    this.closed.emit();
  }

  changeStatus(status: string): void {
    if (this.order?.id) {
      this.statusChanged.emit({ orderId: this.order.id, status });
    }
  }

  getOrderStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      pending:   'bg-warning',
      confirmed: 'bg-info',
      preparing: 'bg-primary',
      ready:     'bg-success',
      delivered: 'bg-dark',
      cancelled: 'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getOrderStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      pending:   'En attente',
      confirmed: 'Confirmée',
      preparing: 'En préparation',
      ready:     'Prête',
      delivered: 'Livrée',
      cancelled: 'Annulée'
    };
    return labels[status] || status;
  }

  getPaymentStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      success: 'bg-success',
      paid:    'bg-success',
      pending: 'bg-warning',
      failed:  'bg-danger'
    };
    return classes[status] || 'bg-secondary';
  }

  getPaymentStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      success: 'Réussi',
      paid:    'Payé',
      pending: 'En attente',
      failed:  'Échoué'
    };
    return labels[status] || status;
  }
}