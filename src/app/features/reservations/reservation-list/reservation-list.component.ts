import { Component, Input } from '@angular/core';
import { Reservation } from '../../../core/models/reservation.model';
import { CommonModule, DatePipe } from '@angular/common';

@Component({
  selector: 'app-reservation-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './reservation-list.component.html',
  styleUrl: './reservation-list.component.scss'
})
export class ReservationListComponent {
  @Input() reservations: Reservation[] = [];

  getStatusColor(status: string): string {
    const colors: any = {
      pending: 'warning',
      confirmed: 'success',
      cancelled: 'danger'
    };
    return colors[status] || 'secondary';
  }
}
