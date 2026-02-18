import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast/toast.service';
import { HttpClient } from '@angular/common/http';

interface SupportTicket {
  id: number;
  subject: string;
  message: string;
  status: string;
  priority: string;
  is_premium: boolean;
  response: string | null;
  created_at: string;
  responded_at: string | null;
}

@Component({
  selector: 'app-support-ticket',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './support-ticket.component.html',
  styleUrl: './support-ticket.component.scss'
})
export class SupportTicketComponent implements OnInit {
  ticketForm: FormGroup;
  tickets: SupportTicket[] = [];
  loading = false;
  isPremium = false;

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private toastService: ToastService
  ) {
    this.ticketForm = this.fb.group({
      subject: ['', [Validators.required, Validators.maxLength(255)]],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  ngOnInit(): void {
    this.checkPremiumStatus();
    this.loadTickets();
  }

  checkPremiumStatus(): void {
    this.http.get<any>(`${environment.apiUrl}/subscriptions/current`)
      .subscribe({
        next: (sub) => {
          this.isPremium = sub?.priority_support || false;
        },
        error: (err) => console.error('Erreur vérification Premium:', err)
      });
  }

  loadTickets(): void {
    this.http.get<any>(`${environment.apiUrl}/support/my-tickets`)
      .subscribe({
        next: (res) => {
          this.tickets = res.data || [];
        },
        error: (err) => {
          console.error('Erreur chargement tickets:', err);
          this.toastService.showError('Erreur', 'Impossible de charger les tickets');
        }
      });
  }

  createTicket(): void {
    if (this.ticketForm.invalid) return;

    this.loading = true;
    this.http.post(`${environment.apiUrl}/support`, this.ticketForm.value)
      .subscribe({
        next: (res: any) => {
          this.ticketForm.reset();
          this.loadTickets();
          this.loading = false;
          this.toastService.showSuccess('Ticket créé', res.message);
        },
        error: (err) => {
          this.loading = false;
          this.toastService.showError('Erreur', err.error?.error || 'Impossible de créer le ticket');
        }
      });
  }

  getStatusLabel(status: string): string {
    const labels: any = {
      'open': 'Ouvert',
      'in_progress': 'En cours',
      'resolved': 'Résolu',
      'closed': 'Fermé'
    };
    return labels[status] || status;
  }
}
