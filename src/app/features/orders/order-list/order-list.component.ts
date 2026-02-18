import { Component, Input } from '@angular/core';
import { Order } from '../../../core/models/order.model';
import { CommonModule, DatePipe } from '@angular/common';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss'
})
export class OrderListComponent {
  @Input() orders: Order[] = [];

  getStatusColor(status: string): string {
    const colors: any = {
      pending: 'warning',
      confirmed: 'info',
      ready: 'success'
    };
    return colors[status] || 'secondary';
  }
}
