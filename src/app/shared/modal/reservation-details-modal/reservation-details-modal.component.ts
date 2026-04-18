import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-reservation-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reservation-details-modal.component.html',
  styleUrl: './reservation-details-modal.component.scss'
})
export class ReservationDetailsModalComponent {
  @Input() reservation: any | null = null;
  @Input() show = false;
  @Input() loading = false;
  @Output() closed = new EventEmitter<void>();
  @Output() statusChanged = new EventEmitter<{ reservationId: number; status: string }>();

  closeModal(): void {
    this.closed.emit();
  }

  changeStatus(status: string): void {
    if (this.reservation?.id) {
      this.statusChanged.emit({ reservationId: this.reservation.id, status });
    }
  }

  getReservationStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      pending:   'En attente',
      confirmed: 'Confirmée',
      cancelled: 'Annulée'
    };
    return labels[status] || status;
  }
}