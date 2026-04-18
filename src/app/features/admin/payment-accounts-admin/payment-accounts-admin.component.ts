import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';

interface PaymentAccountRow {
  id: number;
  business_id: number;
  business_name: string;
  business_type: string;
  owner_email: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_phone: string;
  preferred_payout_method: string;
  mixx_number?: string;
  flooz_number?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  bank_iban?: string;
  legal_name: string;
  business_type_legal: string;
  business_registration_number?: string;
  cinetpay_site_id?: string;
  cinetpay_sub_merchant_id?: string;
  status: string;
  rejection_reason?: string;
  admin_notes?: string;
  verified_at?: string;
  verified_by_email?: string;
  created_at: string;
  updated_at: string;
}
 
interface Summary {
  total: number;
  pending_verification: number;
  verified: number;
  rejected: number;
  not_configured: number;
  suspended: number;
}


@Component({
  selector: 'app-payment-accounts-admin',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './payment-accounts-admin.component.html',
  styleUrl: './payment-accounts-admin.component.scss'
})
export class PaymentAccountsAdminComponent implements OnInit {
  accounts: PaymentAccountRow[] = [];
  summary: Summary | null = null;
  loading = false;
  actionLoading = false;
  statusFilter = 'pending_verification'; // par défaut : montrer les en attente
 
  showDetail = false;
  selectedAccount: PaymentAccountRow | null = null;
  adminNotes = '';
 
  showRejectModal = false;
  rejectTarget: PaymentAccountRow | null = null;
  rejectReason = '';
 
  constructor(
    private http: HttpClient,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}
 
  ngOnInit(): void { this.load(); }
 
  load(): void {
    this.loading = true;
    const params = this.statusFilter ? `?status=${this.statusFilter}` : '';
    this.http.get<any>(`${environment.apiUrl}/admin/payment-accounts${params}`).subscribe({
      next: (res) => {
        this.accounts = res.data || [];
        this.summary  = res.summary || null;
        this.loading  = false;
      },
      error: () => { this.loading = false; },
    });
  }
 
  openDetail(acc: PaymentAccountRow): void {
    this.selectedAccount = acc;
    this.adminNotes = acc.admin_notes || '';
    this.showDetail = true;
  }
 
  async verify(acc: PaymentAccountRow): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Vérifier ce compte ?',
      `Approuver le compte de paiement de "${acc.business_name}" ? Un email de confirmation sera envoyé.`,
      { confirmText: 'Oui, vérifier', cancelText: 'Annuler', type: 'success' }
    );
    if (!confirmed) return;
    this.verifyWithNotes(acc, '');
  }
 
  verifyWithNotes(acc: PaymentAccountRow, notes: string): void {
    this.actionLoading = true;
    this.http.put<any>(
      `${environment.apiUrl}/admin/payment-accounts/${acc.id}/verify`,
      { admin_notes: notes }
    ).subscribe({
      next: () => {
        this.actionLoading = false;
        this.toastService.showSuccess('Compte vérifié', `"${acc.business_name}" peut maintenant recevoir des paiements.`);
        this.load();
      },
      error: (err) => {
        this.actionLoading = false;
        this.toastService.showError('Erreur', err.error?.message || 'Impossible de vérifier');
      },
    });
  }
 
  reject(acc: PaymentAccountRow): void {
    this.rejectTarget  = acc;
    this.rejectReason  = '';
    this.adminNotes    = '';
    this.showRejectModal = true;
  }
 
  confirmReject(): void {
    if (!this.rejectTarget || !this.rejectReason.trim()) return;
    this.actionLoading = true;
    this.http.put<any>(
      `${environment.apiUrl}/admin/payment-accounts/${this.rejectTarget.id}/reject`,
      { rejection_reason: this.rejectReason, admin_notes: this.adminNotes }
    ).subscribe({
      next: () => {
        this.actionLoading   = false;
        this.showRejectModal = false;
        this.toastService.showWarning('Compte rejeté', `"${this.rejectTarget?.business_name}" a été notifié.`);
        this.rejectTarget = null;
        this.load();
      },
      error: (err) => {
        this.actionLoading = false;
        this.toastService.showError('Erreur', err.error?.message || 'Impossible de rejeter');
      },
    });
  }
 
  async suspend(acc: PaymentAccountRow): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Suspendre ce compte ?',
      `Suspendre le compte de paiement de "${acc.business_name}" ?`,
      { confirmText: 'Oui, suspendre', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;
    this.http.put<any>(
      `${environment.apiUrl}/admin/payment-accounts/${acc.id}/suspend`, {}
    ).subscribe({
      next: () => {
        this.toastService.showWarning('Compte suspendu', acc.business_name);
        this.load();
      },
      error: (err) => this.toastService.showError('Erreur', err.error?.message || 'Impossible de suspendre'),
    });
  }
 
  getStatusLabel(s: string): string {
    const l: Record<string, string> = {
      not_configured:       'Non configuré',
      pending_verification: '⏳ En vérification',
      verified:             '✓ Vérifié',
      rejected:             '✗ Rejeté',
      suspended:            '⊘ Suspendu',
    };
    return l[s] ?? s;
  }
 
  getStatusClass(s: string): string {
    const c: Record<string, string> = {
      not_configured:       'role-client',
      pending_verification: 's-pending',
      verified:             'b-active',
      rejected:             'r-cancelled',
      suspended:            'b-inactive',
    };
    return c[s] ?? 'role-client';
  }
 
  getMethodLabel(m?: string): string {
    const l: Record<string, string> = {
      mixx:  'Mixx By Yas',
      flooz: 'Flooz',
      bank:  'Banque',
    };
    return l[m ?? ''] ?? '—';
  }
}
