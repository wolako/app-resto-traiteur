import { Component, Input } from '@angular/core';
import { Reservation } from '../../../core/models/reservation.model';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-reservation-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reservation-list.component.html',
  styleUrl: './reservation-list.component.scss'
})
export class ReservationListComponent {
  @Input() reservations: Reservation[] = [];

  getStatusColor(status: string): string {
    const colors: Record<string, string> = {
      pending:   'warning',
      confirmed: 'success',
      cancelled: 'danger'
    };
    return colors[status] || 'secondary';
  }

  getStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending:   'En attente',
      confirmed: 'Confirmée',
      cancelled: 'Annulée'
    };
    return labels[status] || status;
  }
}