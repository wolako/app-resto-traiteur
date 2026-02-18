import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Reservation } from '../../../core/models/reservation.model';

@Component({
  selector: 'app-reservation-details-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reservation-details-modal.component.html',
  styleUrl: './reservation-details-modal.component.scss'
})
export class ReservationDetailsModalComponent {
  @Input() reservation: Reservation | null = null;
  @Input() show = false;
  @Output() closed = new EventEmitter<void>();

  closeModal(): void {
    this.closed.emit();
  }

  getReservationStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'confirmed': 'Confirmée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }
}