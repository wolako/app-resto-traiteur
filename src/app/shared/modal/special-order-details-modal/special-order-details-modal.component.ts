import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-special-order-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './special-order-details-modal.component.html',
  styleUrl: './special-order-details-modal.component.scss'
})
export class SpecialOrderDetailsModalComponent {
  @Input() specialOrder: any | null = null;
  @Input() show = false;
  @Input() canAccept = true;

  @Output() closed = new EventEmitter<void>();
  @Output() statusChanged = new EventEmitter<{ orderId: number; status: string }>();

  closeModal(): void {
    this.closed.emit();
  }

  confirm(): void {
    if (this.specialOrder?.id) {
      this.statusChanged.emit({ orderId: this.specialOrder.id, status: 'confirmed' });
    }
  }

  cancel(): void {
    if (this.specialOrder?.id) {
      this.statusChanged.emit({ orderId: this.specialOrder.id, status: 'cancelled' });
    }
  }

  getStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      pending:   'alert-warning',
      quoted:    'alert-info',
      confirmed: 'alert-success',
      cancelled: 'alert-danger'
    };
    return classes[status] || 'alert-secondary';
  }

  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      pending:   'En attente',
      quoted:    'Devis envoyé',
      confirmed: 'Confirmée',
      cancelled: 'Annulée'
    };
    return labels[status] || status;
  }

  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      pending:   'bi-clock',
      quoted:    'bi-file-text',
      confirmed: 'bi-check-circle',
      cancelled: 'bi-x-circle'
    };
    return icons[status] || 'bi-circle';
  }

  getEventTypeLabel(eventType: string): string {
    const labels: { [key: string]: string } = {
      mariage:     'Mariage',
      anniversaire:'Anniversaire',
      bapteme:     'Baptême',
      entreprise:  "Événement d'entreprise",
      reception:   'Réception',
      autre:       'Autre'
    };
    return labels[eventType] || eventType;
  }

  getDepositStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      pending:     'En attente',
      cod_pending: 'COD en attente',
      cod_received:'COD reçu',
      paid:        'Payé'
    };
    return labels[status] || status;
  }
}