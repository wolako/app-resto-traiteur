//driver-dashboard/driver-dashboard.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DriverService } from '../../core/services/driver/driver.service';
import { AuthService }   from '../../core/services/auth/auth.service';
import { ToastService }  from '../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../core/services/confirmation-modal/confirmation-modal.service';
import { Driver, DriverAssignment } from '../../core/models/driver.model';
import { interval, Subscription } from 'rxjs';

@Component({
  selector: 'app-driver-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './driver-dashboard.component.html',
  styleUrls: ['./driver-dashboard.component.scss']
})
export class DriverDashboardComponent implements OnInit, OnDestroy {

  driver: Driver | null = null;
  activeOrders: DriverAssignment[] = [];
  recentHistory: any[] = [];
  loading = true;
  statusLoading = false;
  actionLoading: { [key: number]: boolean } = {};

  // Changement mot de passe (premier login)
  showPasswordModal = false;
  newPassword = '';
  confirmPassword = '';
  passwordLoading = false;

  // Modal échec
  showFailModal = false;
  failOrderId: number | null = null;
  failReason = '';
  failLoading = false;

  // Rafraîchissement auto toutes les 30s
  private refreshSub?: Subscription;

  readonly vehicleLabels: Record<string, string> = {
    moto: '🏍️ Moto', velo: '🚲 Vélo', voiture: '🚗 Voiture', pied: '🚶 À pied'
  };

  constructor(
    private driverService: DriverService,
    private authService: AuthService,
    private toastService: ToastService,
    private confirmService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadData();
    // Refresh toutes les 30 secondes
    this.refreshSub = interval(30000).subscribe(() => this.loadData(true));
  }

  ngOnDestroy(): void {
    this.refreshSub?.unsubscribe();
  }

  loadData(silent = false): void {
    if (!silent) this.loading = true;
    this.driverService.getMyOrders().subscribe({
      next: (res) => {
        this.driver        = res.data.driver;
        this.activeOrders  = res.data.active_orders || [];
        this.recentHistory = res.data.recent_history || [];
        this.loading       = false;

        // Si mot de passe temporaire non changé → forcer le changement
        if (this.driver?.temp_password_used) {
          this.showPasswordModal = true;
        }
      },
      error: () => {
        this.loading = false;
        if (!silent) this.toastService.showError('Erreur', 'Impossible de charger les données');
      }
    });
  }

  // ── Toggle Online/Offline ─────────────────────────────────
  toggleStatus(): void {
    this.statusLoading = true;
    this.driverService.toggleStatus().subscribe({
      next: (res) => {
        this.statusLoading = false;
        if (this.driver) this.driver.status = res.data.status;
        const label = res.data.status === 'available' ? '🟢 En ligne' : '⚫ Hors ligne';
        this.toastService.showSuccess('Statut mis à jour', label);
      },
      error: () => {
        this.statusLoading = false;
        this.toastService.showError('Erreur', 'Impossible de changer le statut');
      }
    });
  }

  // ── Récupérer la commande ─────────────────────────────────
  async pickup(assignment: DriverAssignment): Promise<void> {
    const ok = await this.confirmService.confirm(
      'Partir livrer ?',
      `Confirmer la récupération de la commande #${assignment.order_id} chez ${assignment.business_name} ?`,
      { confirmText: 'Je pars livrer', cancelText: 'Annuler', type: 'info' }
    );
    if (!ok) return;

    this.actionLoading[assignment.order_id] = true;
    this.driverService.pickup(assignment.order_id).subscribe({
      next: () => {
        this.actionLoading[assignment.order_id] = false;
        this.toastService.showSuccess('Récupération confirmée', 'Bonne livraison !');
        this.loadData(true);
      },
      error: (err) => {
        this.actionLoading[assignment.order_id] = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible de confirmer');
      }
    });
  }

  // ── Confirmer livraison ───────────────────────────────────
  async deliver(assignment: DriverAssignment): Promise<void> {
    const ok = await this.confirmService.confirm(
      'Livraison effectuée ?',
      `Confirmer la livraison de la commande #${assignment.order_id} à ${assignment.client_name} ?`,
      { confirmText: '✅ Livré', cancelText: 'Annuler', type: 'success' }
    );
    if (!ok) return;

    this.actionLoading[assignment.order_id] = true;
    this.driverService.deliver(assignment.order_id).subscribe({
      next: () => {
        this.actionLoading[assignment.order_id] = false;
        this.toastService.showSuccess('Livraison confirmée', 'Excellent travail !');
        this.loadData(true);
      },
      error: (err) => {
        this.actionLoading[assignment.order_id] = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible de confirmer');
      }
    });
  }

  // ── Signaler un problème ──────────────────────────────────
  openFailModal(orderId: number): void {
    this.failOrderId = orderId;
    this.failReason  = '';
    this.showFailModal = true;
  }

  submitFail(): void {
    if (!this.failOrderId || !this.failReason.trim()) return;
    this.failLoading = true;
    this.driverService.fail(this.failOrderId, this.failReason).subscribe({
      next: () => {
        this.failLoading   = false;
        this.showFailModal = false;
        this.failOrderId   = null;
        this.toastService.showWarning('Problème signalé', 'L\'établissement a été notifié');
        this.loadData(true);
      },
      error: (err) => {
        this.failLoading = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible de signaler');
      }
    });
  }

  // ── Changer mot de passe ──────────────────────────────────
  submitPasswordChange(): void {
    if (!this.newPassword || this.newPassword.length < 6) {
      this.toastService.showError('Erreur', 'Minimum 6 caractères');
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.toastService.showError('Erreur', 'Les mots de passe ne correspondent pas');
      return;
    }
    this.passwordLoading = true;
    this.driverService.changePassword(this.newPassword).subscribe({
      next: () => {
        this.passwordLoading   = false;
        this.showPasswordModal = false;
        if (this.driver) this.driver.temp_password_used = false;
        this.toastService.showSuccess('Mot de passe changé', 'Bienvenue !');
      },
      error: (err) => {
        this.passwordLoading = false;
        this.toastService.showError('Erreur', err.error?.error || 'Impossible de changer le mot de passe');
      }
    });
  }

  logout(): void { this.authService.logout(); }

  formatAmount(n: any): string {
    return Math.round(Number(n || 0)).toLocaleString('fr-FR');
  }

  getStatusLabel(status: string): string {
    const l: Record<string, string> = {
      assigned:  '📦 À récupérer',
      picked_up: '🛵 En transit',
      delivered: '✅ Livré',
      failed:    '❌ Échec'
    };
    return l[status] || status;
  }

  openMaps(address: string): void {
    const url = `https://maps.google.com/?q=${encodeURIComponent(address + ', Lomé, Togo')}`;
    window.open(url, '_blank');
  }

  isOnline(): boolean {
    return this.driver?.status === 'available' || this.driver?.status === 'at_capacity';
  }
}