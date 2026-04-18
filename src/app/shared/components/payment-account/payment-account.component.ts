import { CommonModule } from '@angular/common';
import { Component, Input, OnInit, Output, EventEmitter } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';

export interface PaymentAccount {
  id?: number;
  business_id?: number;
  cinetpay_site_id?: string;
  cinetpay_api_key?: string;
  cinetpay_sub_merchant_id?: string;
  preferred_payout_method?: 'mixx' | 'flooz' | 'bank';
  mixx_number?: string;
  flooz_number?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
  bank_iban?: string;
  legal_name?: string;
  business_registration_number?: string;
  business_type?: 'individual' | 'company';
  account_label?: string;
  is_active?: boolean;
  replaced_at?: string;
  status?: 'not_configured' | 'pending_verification' | 'verified' | 'rejected' | 'suspended';
  rejection_reason?: string;
  verified_at?: string;
  admin_notes?: string;
}

@Component({
  selector: 'app-payment-account',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './payment-account.component.html',
  styleUrls: ['./payment-account.component.scss']
})
export class PaymentAccountComponent implements OnInit {
  @Input() businessId!: number;
  @Input() businessName = '';
  @Output() statusChange = new EventEmitter<string>();

  paymentAccount: PaymentAccount | null = null;   // compte actif
  allAccounts: PaymentAccount[] = [];             // actif + historique
  loading  = false;
  saving   = false;

  // ── Modes d'affichage ─────────────────────────────────────
  editMode   = false;   // modifier le compte actif
  addNewMode = false;   // créer un nouveau compte

  form!: FormGroup;

  payoutMethods = [
    { id: 'mixx',  ico: '📱', lbl: 'Mixx By Yas', sub: 'Togocom'  },
    { id: 'flooz', ico: '💚', lbl: 'Flooz',        sub: 'Moov'    },
    { id: 'bank',  ico: '🏦', lbl: 'Banque',       sub: 'Virement'},
  ];

  get paStatus(): string {
    return this.paymentAccount?.status ?? 'not_configured';
  }

  get showForm(): boolean {
    return this.editMode
      || this.addNewMode
      || this.paStatus === 'not_configured'
      || this.paStatus === 'rejected'
      || this.paStatus === 'suspended';
  }

  get historyAccounts(): PaymentAccount[] {
    return this.allAccounts.filter(a => !a.is_active);
  }

  constructor(
    private fb: FormBuilder,
    private http: HttpClient,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.buildForm();
    this.loadAccounts();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      preferred_payout_method:      ['mixx', Validators.required],
      mixx_number:                  [''],
      flooz_number:                 [''],
      bank_name:                    [''],
      bank_account_number:          [''],
      bank_account_holder:          [''],
      bank_iban:                    [''],
      legal_name:                   ['', Validators.required],
      business_registration_number: [''],
      business_type:                ['individual', Validators.required],
      cinetpay_site_id:             [''],
      cinetpay_api_key:             [''],
      account_label:                [''],
      // Champs de contrôle (non affichés)
      edit_existing:                [false],
      existing_account_id:          [null],
    });
  }

  private normalizeMethodToFormId(method?: string): string {
    if (!method) return 'mixx';
    const map: Record<string, string> = {
      'mixx by yas': 'mixx',
      'mixx':        'mixx',
      'flooz':       'flooz',
      'bank':        'bank',
    };
    return map[method.toLowerCase()] ?? 'mixx';
  }

  loadAccounts(): void {
    if (!this.businessId) return;
    this.loading = true;

    this.http.get<any>(`${environment.apiUrl}/payment-accounts/all-accounts`).subscribe({
      next: (res) => {
        this.allAccounts   = res.data || [];
        this.paymentAccount = this.allAccounts.find(a => a.is_active) || null;
        this.loading   = false;
        this.editMode  = false;
        this.addNewMode = false;
        this.statusChange.emit(this.paStatus);

        if (this.paymentAccount) {
          this.patchFormWithAccount(this.paymentAccount);
        } else {
          this.form.patchValue({ legal_name: this.businessName });
        }
      },
      error: () => { this.loading = false; },
    });
  }

  private patchFormWithAccount(account: PaymentAccount): void {
    this.form.patchValue({
      preferred_payout_method:      this.normalizeMethodToFormId(account.preferred_payout_method),
      mixx_number:                  account.mixx_number  || '',
      flooz_number:                 account.flooz_number || '',
      bank_name:                    account.bank_name    || '',
      bank_account_number:          account.bank_account_number  || '',
      bank_account_holder:          account.bank_account_holder  || '',
      bank_iban:                    account.bank_iban    || '',
      legal_name:                   account.legal_name   || this.businessName,
      business_registration_number: account.business_registration_number || '',
      business_type:                account.business_type || 'individual',
      cinetpay_site_id:             account.cinetpay_site_id || '',
      cinetpay_api_key:             account.cinetpay_api_key || '',
      account_label:                account.account_label || '',
      edit_existing:                false,
      existing_account_id:          null,
    });
  }

  /** Ouvre le formulaire pour MODIFIER le compte actif */
  startEdit(): void {
    this.editMode   = true;
    this.addNewMode = false;
    if (this.paymentAccount) {
      this.patchFormWithAccount(this.paymentAccount);
      this.form.patchValue({
        edit_existing:       true,
        existing_account_id: this.paymentAccount.id,
      });
    }
  }

  /** Ouvre le formulaire pour AJOUTER un nouveau compte */
  startAddNew(): void {
    this.addNewMode = true;
    this.editMode   = false;
    this.form.reset({
      preferred_payout_method:      'mixx',
      mixx_number:                  '',
      flooz_number:                 '',
      bank_name:                    '',
      bank_account_number:          '',
      bank_account_holder:          '',
      bank_iban:                    '',
      legal_name:                   this.businessName,
      business_registration_number: '',
      business_type:                'individual',
      cinetpay_site_id:             '',
      cinetpay_api_key:             '',
      account_label:                '',
      edit_existing:                false,
      existing_account_id:          null,
    });
  }

  cancelForm(): void {
    this.editMode   = false;
    this.addNewMode = false;
    if (this.paymentAccount) {
      this.patchFormWithAccount(this.paymentAccount);
    }
  }

  async save(): Promise<void> {
    if (!this.form.valid) return;

    const method = this.form.value.preferred_payout_method;
    const missingNumber =
      (method === 'mixx'  && !this.form.value.mixx_number) ||
      (method === 'flooz' && !this.form.value.flooz_number) ||
      (method === 'bank'  && !this.form.value.bank_account_number);

    if (missingNumber) {
      this.toastService.showError(
        'Numéro manquant',
        `Veuillez renseigner votre numéro ${
          method === 'mixx'  ? 'Mixx By Yas' :
          method === 'flooz' ? 'Flooz' : 'de compte bancaire'
        }`
      );
      return;
    }

    const isEdit     = this.form.value.edit_existing;
    const isAddNew   = this.addNewMode;
    const isVerified = this.paStatus === 'verified';

    const title =
      isAddNew  ? 'Ajouter un nouveau compte ?' :
      isVerified ? 'Modifier le compte vérifié ?' :
                   'Enregistrer le compte de paiement ?';

    const message =
      isAddNew
        ? `L'ancien compte (${this.getMethodLabel(this.paymentAccount?.preferred_payout_method)} — ${this.getPayoutCoords()}) sera conservé dans l'historique. Le nouveau devra être vérifié sous 24-48h.`
        : isVerified
          ? 'Modifier ces informations annulera votre vérification actuelle. Vous devrez être revérifié sous 24-48h.'
          : 'Ces informations seront vérifiées par notre équipe avant activation.';

    const confirmed = await this.confirmationService.confirm(title, message, {
      confirmText: isAddNew ? 'Oui, ajouter' : isVerified ? 'Oui, modifier' : 'Enregistrer',
      cancelText:  'Annuler',
      type:        (isVerified || isAddNew) ? 'warning' : 'info',
    });
    if (!confirmed) return;

    this.saving = true;
    this.http.post<any>(`${environment.apiUrl}/payment-accounts/save`, this.form.value).subscribe({
      next: () => {
        this.saving = false;
        this.toastService.showSuccess(
          isAddNew ? 'Nouveau compte soumis' : 'Compte mis à jour',
          'Votre dossier est en cours de vérification. Vous serez notifié sous 24-48h.'
        );
        this.loadAccounts(); // ✅ Recharge tout (actif + historique)
      },
      error: (err) => {
        this.saving = false;
        this.toastService.showError('Erreur', err.error?.message || 'Impossible d\'enregistrer');
      },
    });
  }

  getStatusLabel(s?: string): string {
    const l: Record<string, string> = {
      not_configured:       'Non configuré',
      pending_verification: 'En vérification',
      verified:             'Vérifié ✓',
      rejected:             'Rejeté',
      suspended:            'Suspendu',
    };
    return l[s ?? ''] ?? s ?? '';
  }

  getStatusChipClass(s?: string): string {
    const m: Record<string, string> = {
      not_configured:       'chip--blue',
      pending_verification: 'chip--orange',
      verified:             'chip--green',
      rejected:             'chip--red',
      suspended:            'chip--red',
    };
    return m[s ?? ''] ?? '';
  }

  getMethodLabel(m?: string): string {
    const l: Record<string, string> = {
      mixx:  'Mixx By Yas',
      flooz: 'Flooz',
      bank:  'Virement bancaire',
    };
    return l[m ?? ''] ?? '—';
  }

  getMethodIcon(m?: string): string {
    const icons: Record<string, string> = { mixx: '📱', flooz: '💚', bank: '🏦' };
    return icons[m ?? ''] ?? '💳';
  }

  getPayoutCoords(account?: PaymentAccount | null): string {
    const a = account ?? this.paymentAccount;
    if (!a) return '—';
    switch (a.preferred_payout_method) {
      case 'mixx':  return a.mixx_number  || '—';
      case 'flooz': return a.flooz_number || '—';
      case 'bank':
        return a.bank_account_number
          ? `${a.bank_name || 'Banque'} — ${a.bank_account_number}`
          : '—';
      default: return '—';
    }
  }
}