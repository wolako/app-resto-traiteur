import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User } from '../../../core/models/user.model';
import { Business } from '../../../core/models/business.model';
import { AdminService } from '../../../core/services/admin/admin.service';
import { RouterModule } from '@angular/router';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';
import { environment } from '../../../../environments/environment';
import { HttpClient } from '@angular/common/http';
import { TestimonialService } from '../../../core/services/testimonial/testimonial.service';
import { Testimonial, TestimonialStats } from '../../../core/models/testimonial.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit {
  activeTab = 'overview';

  // Données
  users: User[] = [];
  filteredUsers: User[] = [];
  businesses: Business[] = [];
  filteredBusinesses: Business[] = [];
  orders: any[] = [];
  filteredOrders: any[] = [];
  reservations: any[] = [];
  filteredReservations: any[] = [];
  payments: any[] = [];
  globalStats: any = {};

  // Support
  supportTickets: any[] = [];
  filteredSupportTickets: any[] = [];
  supportStatusFilter = '';
  premiumTicketsCount = 0;

  // Testimonial
  testimonials: Testimonial[] = [];
  filteredTestimonials: Testimonial[] = [];
  testimonialStats: TestimonialStats | null = null;
  testimonialStatusFilter = '';

  // ── COMMISSIONS ─────────────────────────────────────────────────
  commissions: any[] = [];
  filteredCommissions: any[] = [];
  commissionStats: any = null;
  commissionStatusFilter = '';
  commissionLoading = false;
  isSandbox = environment.paymentMode === 'sandbox';
  // ────────────────────────────────────────────────────────────────

  // Filtres
  userFilter = 'client';
  businessFilter = '';
  orderStatusFilter = '';
  orderPaymentFilter = '';
  reservationStatusFilter = '';

  // Modal states
  showEditBusinessModal = false;
  selectedBusiness: Business | null = null;
  businessFormData: any = {};

  showOrderDetailsModal = false;
  selectedOrder: any = null;

  showReservationDetailsModal = false;
  selectedReservation: any = null;

  loadingBusinessUpdate = false;
  loadingOrderUpdate = false;
  loadingReservationUpdate = false;

  // Abonnements
  subscriptions: any[] = [];
  filteredSubscriptions: any[] = [];
  subscriptionFilter = 'all';
  remindersHistory: any[] = [];
  loadingReminders = false;
  triggeringReminders = false;

  constructor(
    private adminService: AdminService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService,
    private testimonialService: TestimonialService,
    private http: HttpClient
  ) {}

  ngOnInit(): void {
    this.loadStatistics();
    this.loadUsers();
    this.loadBusinesses();
    this.loadOrders();
    this.loadReservations();
    this.loadPayments();
  }

  // =============================================
  // NAVIGATION
  // =============================================

  switchTab(tab: string): void {
    this.activeTab = tab;
    switch (tab) {
      case 'users':         this.loadUsers();          break;
      case 'businesses':    this.loadBusinesses();     break;
      case 'orders':        this.loadOrders();         break;
      case 'reservations':  this.loadReservations();   break;
      case 'payments':      this.loadPayments();       break;
      case 'support':       this.loadSupportTickets(); break;
      case 'testimonials':  this.loadTestimonials();   break;
      case 'subscriptions': this.loadSubscriptions();  break;
      case 'commissions':   this.loadCommissions();    break;
    }
  }

  // =============================================
  // CHARGEMENT DES DONNÉES
  // =============================================

  loadStatistics(): void {
    this.adminService.getGlobalStatistics().subscribe({
      next: (stats) => { this.globalStats = stats; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les statistiques')
    });
  }

  loadUsers(): void {
    this.adminService.getAllUsers(this.userFilter).subscribe({
      next: (users) => { this.users = users; this.filterUsers(); },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les utilisateurs')
    });
  }

  loadBusinesses(): void {
    this.adminService.getAllBusinesses().subscribe({
      next: (businesses) => { this.businesses = businesses; this.filterBusinesses(); },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les établissements')
    });
  }

  loadOrders(): void {
    this.adminService.getAllOrders(this.orderStatusFilter, this.orderPaymentFilter).subscribe({
      next: (orders) => { this.orders = orders; this.filterOrders(); },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les commandes')
    });
  }

  loadReservations(): void {
    this.adminService.getAllReservations(this.reservationStatusFilter).subscribe({
      next: (reservations) => { this.reservations = reservations; this.filterReservations(); },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les réservations')
    });
  }

  loadPayments(): void {
    this.adminService.getAllPayments().subscribe({
      next: (payments) => { this.payments = payments; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les paiements')
    });
  }

  // ── COMMISSIONS ─────────────────────────────────────────────────

  loadCommissions(): void {
    this.commissionLoading = true;
    // ✅ CORRIGÉ : Route correcte
    this.http.get<any>(`${environment.apiUrl}/commissions/all`).subscribe({
      next: (res) => {
        // ✅ Gérer différentes structures de réponse
        this.commissions = res.data?.commissions || res.commissions || res.data || [];
        this.commissionStats = res.data?.stats || res.stats || null;
        this.filterCommissions();
        this.commissionLoading = false;
      },
      error: (err) => {
        console.error('Erreur commissions:', err);
        this.commissionLoading = false;
        this.toastService.showError('Erreur', 'Impossible de charger les commissions');
      }
    });
  }

  filterCommissions(): void {
    this.filteredCommissions = this.commissionStatusFilter
      ? this.commissions.filter(c => c.status === this.commissionStatusFilter)
      : [...this.commissions];
  }

  async collectCommission(commissionId: number, businessName: string, amount: number): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Marquer comme collectée',
      `Confirmer la collecte de ${this.formatAmount(amount)} FCFA de commission auprès de "${businessName}" ?`,
      { confirmText: 'Oui, collecter', cancelText: 'Annuler', type: 'success' }
    );
    if (!confirmed) return;

    this.http.patch(`${environment.apiUrl}/commissions/${commissionId}/collect`, {}).subscribe({
      next: () => {
        this.loadCommissions();
        this.toastService.showSuccess('Commission collectée', `${this.formatAmount(amount)} FCFA collectés`);
      },
      error: (err) => {
        this.toastService.showError('Erreur', err.error?.message || 'Impossible de mettre à jour');
      }
    });
  }

  // ✅ CORRIGÉ : Méthodes utilisées dans le template (pas de .filter() dans le HTML)
  getPendingCommissionsCount(): number {
    return this.commissions.filter(c => c.status === 'pending').length;
  }

  getTotalPendingCommissions(): number {
    return this.commissions
      .filter(c => c.status === 'pending')
      .reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);
  }

  getTotalCollectedCommissions(): number {
    return this.commissions
      .filter(c => c.status === 'collected')
      .reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0);
  }

  formatAmount(n: any): string {
    return parseInt(n || 0).toLocaleString('fr-FR');
  }

  getCommissionStatusClass(status: string): string {
    const classes: { [key: string]: string } = {
      pending:   'bg-warning',
      collected: 'bg-success',
      paid:      'bg-info'
    };
    return classes[status] || 'bg-secondary';
  }

  getCommissionStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      pending:   'En attente',
      collected: 'Collectée',
      paid:      'Payée'
    };
    return labels[status] || status;
  }

  isSandboxCommission(c: any): boolean {
    return !!(
      c.payment_id?.startsWith?.('SANDBOX') ||
      c.order_id?.toString().startsWith('SANDBOX')
    );
  }

  // ────────────────────────────────────────────────────────────────

  // =============================================
  // FILTRES
  // =============================================

  filterUsers(): void {
    this.filteredUsers = this.userFilter
      ? this.users.filter(u => u.role === this.userFilter)
      : this.users;
  }

  filterBusinesses(): void {
    this.filteredBusinesses = this.businessFilter
      ? this.businesses.filter(b => b.type === this.businessFilter)
      : this.businesses;
  }

  filterOrders(): void {
    let filtered = [...this.orders];
    if (this.orderStatusFilter)  filtered = filtered.filter(o => o.status === this.orderStatusFilter);
    if (this.orderPaymentFilter) filtered = filtered.filter(o => o.payment_status === this.orderPaymentFilter);
    this.filteredOrders = filtered;
  }

  filterReservations(): void {
    this.filteredReservations = this.reservationStatusFilter
      ? this.reservations.filter(r => r.status === this.reservationStatusFilter)
      : this.reservations;
  }

  // =============================================
  // GESTION DES UTILISATEURS
  // =============================================

  async deleteUser(userId: number, userName: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Supprimer l\'utilisateur',
      `Êtes-vous sûr de vouloir SUPPRIMER l'utilisateur "${userName}" ?\n\nCette action est irréversible !`,
      { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;

    this.adminService.deleteUser(userId).subscribe({
      next: () => {
        this.loadUsers();
        this.toastService.showSuccess('Utilisateur supprimé', `"${userName}" a été supprimé`);
      },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de supprimer')
    });
  }

  // =============================================
  // GESTION DES ÉTABLISSEMENTS
  // =============================================

  async toggleBusinessStatus(businessId: number, isActive: boolean): Promise<void> {
    const business = this.businesses.find(b => b.id === businessId);
    const businessName = business?.name || 'cet établissement';
    const confirmed = await this.confirmationService.confirm(
      isActive ? 'Activer l\'établissement' : 'Désactiver l\'établissement',
      `Êtes-vous sûr de vouloir ${isActive ? 'activer' : 'désactiver'} "${businessName}" ?`,
      { confirmText: isActive ? 'Oui, activer' : 'Oui, désactiver', cancelText: 'Annuler', type: isActive ? 'success' : 'warning' }
    );
    if (!confirmed) return;

    this.adminService.updateBusinessStatus(businessId, isActive).subscribe({
      next: () => {
        this.loadBusinesses();
        this.toastService.showSuccess('Statut mis à jour', `"${businessName}" ${isActive ? 'activé' : 'désactivé'}`);
      },
      error: () => this.toastService.showError('Erreur', 'Impossible de mettre à jour le statut')
    });
  }

  openEditBusinessModal(business: Business): void {
    this.selectedBusiness = business;
    this.businessFormData = {
      name: business.name,
      description: business.description || '',
      address: business.address || '',
      phone: business.phone || '',
      opening_hour: business.opening_hour || '',
      closing_hour: business.closing_hour || '',
      availability_start: business.availability_start || '',
      availability_end: business.availability_end || '',
    };
    this.showEditBusinessModal = true;
  }

  closeEditBusinessModal(): void {
    this.showEditBusinessModal = false;
    this.selectedBusiness = null;
    this.businessFormData = {};
  }

  async saveBusinessChanges(): Promise<void> {
    if (!this.selectedBusiness?.id || !this.businessFormData.name) {
      this.toastService.showWarning('Champ requis', 'Le nom est requis');
      return;
    }
    this.loadingBusinessUpdate = true;
    this.adminService.updateBusiness(this.selectedBusiness.id, this.businessFormData).subscribe({
      next: () => {
        this.loadBusinesses();
        this.closeEditBusinessModal();
        this.loadingBusinessUpdate = false;
        this.toastService.showSuccess('Mis à jour', `"${this.businessFormData.name}" mis à jour`);
      },
      error: (error) => {
        this.loadingBusinessUpdate = false;
        this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour');
      }
    });
  }

  async deleteBusiness(businessId: number, businessName: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Supprimer l\'établissement',
      `Supprimer "${businessName}" ? Action irréversible !`,
      { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;

    this.adminService.deleteBusiness(businessId).subscribe({
      next: () => {
        this.loadBusinesses();
        this.toastService.showSuccess('Supprimé', `"${businessName}" supprimé`);
      },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de supprimer')
    });
  }

  // =============================================
  // GESTION DES COMMANDES
  // =============================================

  viewOrderDetails(order: any): void {
    this.adminService.getOrderById(order.id).subscribe({
      next: (orderDetails) => { this.selectedOrder = orderDetails; this.showOrderDetailsModal = true; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les détails')
    });
  }

  closeOrderDetailsModal(): void { this.showOrderDetailsModal = false; this.selectedOrder = null; }

  async updateOrderStatus(orderId: number, status: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Changer le statut',
      `Confirmer le changement vers "${this.getOrderStatusLabel(status)}" ?`,
      { confirmText: 'Oui', cancelText: 'Annuler', type: status === 'cancelled' ? 'danger' : 'info' }
    );
    if (!confirmed) return;

    this.loadingOrderUpdate = true;
    this.adminService.updateOrderStatus(orderId, status).subscribe({
      next: () => {
        this.loadOrders();
        if (this.selectedOrder?.id === orderId) this.closeOrderDetailsModal();
        this.loadingOrderUpdate = false;
        this.toastService.showSuccess('Mis à jour', `Commande #${orderId} → "${this.getOrderStatusLabel(status)}"`);
      },
      error: () => { this.loadingOrderUpdate = false; this.toastService.showError('Erreur', 'Impossible de mettre à jour'); }
    });
  }

  // =============================================
  // GESTION DES RÉSERVATIONS
  // =============================================

  viewReservationDetails(reservation: any): void {
    this.adminService.getReservationById(reservation.id).subscribe({
      next: (r) => { this.selectedReservation = r; this.showReservationDetailsModal = true; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les détails')
    });
  }

  closeReservationDetailsModal(): void { this.showReservationDetailsModal = false; this.selectedReservation = null; }

  async updateReservationStatus(reservationId: number, status: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Changer le statut',
      `Confirmer le changement vers "${this.getReservationStatusLabel(status)}" ?`,
      { confirmText: 'Oui', cancelText: 'Annuler', type: status === 'cancelled' ? 'danger' : 'success' }
    );
    if (!confirmed) return;

    this.loadingReservationUpdate = true;
    this.adminService.updateReservationStatus(reservationId, status).subscribe({
      next: () => {
        this.loadReservations();
        if (this.selectedReservation?.id === reservationId) this.closeReservationDetailsModal();
        this.loadingReservationUpdate = false;
        this.toastService.showSuccess('Mis à jour', `Réservation #${reservationId} → "${this.getReservationStatusLabel(status)}"`);
      },
      error: () => { this.loadingReservationUpdate = false; this.toastService.showError('Erreur', 'Impossible de mettre à jour'); }
    });
  }

  // =============================================
  // GESTION DU SUPPORT
  // =============================================

  loadSupportTickets(): void {
    this.http.get<any>(`${environment.apiUrl}/support/all`, {
      params: { status: this.supportStatusFilter || 'all' }
    }).subscribe({
      next: (res: any) => {
        this.supportTickets = res.data || [];
        this.filterSupportTickets();
        this.premiumTicketsCount = this.supportTickets.filter((t: any) => t.is_premium && t.status === 'open').length;
      },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les tickets')
    });
  }

  filterSupportTickets(): void {
    this.filteredSupportTickets = this.supportStatusFilter
      ? this.supportTickets.filter((t: any) => t.status === this.supportStatusFilter)
      : this.supportTickets;
  }

  viewTicket(ticket: any): void {
    alert(`Ticket #${ticket.id}\n\nSujet: ${ticket.subject}\n\nMessage: ${ticket.message}`);
  }

  async respondToTicket(ticket: any): Promise<void> {
    const response = prompt(`Répondre au ticket #${ticket.id} :\n\n${ticket.subject}\n\n${ticket.message}\n\nVotre réponse:`);
    if (!response) return;

    this.http.put(`${environment.apiUrl}/support/tickets/${ticket.id}/respond`, { response, status: 'resolved' }).subscribe({
      next: () => {
        this.loadSupportTickets();
        this.toastService.showSuccess('Réponse envoyée', `Ticket #${ticket.id} résolu`);
      },
      error: (err: any) => this.toastService.showError('Erreur', err.error?.error || 'Impossible de répondre')
    });
  }

  getSupportStatusLabel(status: string): string {
    const labels: { [key: string]: string } = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' };
    return labels[status] || status;
  }

  getSupportStatusClass(status: string): string {
    const classes: { [key: string]: string } = { open: 'bg-warning', in_progress: 'bg-primary', resolved: 'bg-success', closed: 'bg-secondary' };
    return classes[status] || 'bg-secondary';
  }

  getSupportPriorityClass(priority: string): string {
    const classes: { [key: string]: string } = { low: 'bg-secondary', normal: 'bg-info', high: 'bg-warning', urgent: 'bg-danger' };
    return classes[priority] || 'bg-info';
  }

  getOpenTicketsCount(): number     { return this.supportTickets.filter(t => t.status === 'open').length; }
  getInProgressTicketsCount(): number { return this.supportTickets.filter(t => t.status === 'in_progress').length; }
  getResolvedTicketsCount(): number  { return this.supportTickets.filter(t => t.status === 'resolved').length; }
  getPremiumTicketsCount(): number   { return this.supportTickets.filter(t => t.is_premium).length; }

  // =============================================
  // TESTIMONIAL
  // =============================================

  loadTestimonials(): void {
    this.testimonialService.getAllTestimonials(this.testimonialStatusFilter).subscribe({
      next: (testimonials) => { this.testimonials = testimonials; this.filterTestimonials(); },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les témoignages')
    });
    this.testimonialService.getTestimonialStats().subscribe({
      next: (stats) => { this.testimonialStats = stats; },
      error: (error) => console.error('Error loading stats:', error)
    });
  }

  filterTestimonials(): void {
    this.filteredTestimonials = this.testimonialStatusFilter
      ? this.testimonials.filter(t => t.status === this.testimonialStatusFilter)
      : this.testimonials;
  }

  async approveTestimonial(testimonial: Testimonial, featured: boolean = false): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Approuver le témoignage',
      `Approuver le témoignage de "${testimonial.user?.first_name}" ?${featured ? '\n\nMis en vedette sur la page d\'accueil.' : ''}`,
      { confirmText: 'Oui, approuver', cancelText: 'Annuler', type: 'success' }
    );
    if (!confirmed) return;

    this.testimonialService.approveTestimonial(testimonial.id!, featured).subscribe({
      next: () => { this.loadTestimonials(); this.toastService.showSuccess('Approuvé', `Témoignage approuvé${featured ? ' et mis en vedette' : ''}`); },
      error: () => this.toastService.showError('Erreur', 'Impossible d\'approuver')
    });
  }

  async rejectTestimonial(testimonial: Testimonial): Promise<void> {
    const reason = prompt(`Rejeter le témoignage de "${testimonial.user?.first_name}" ?\n\nRaison (optionnelle) :`);
    if (reason === null) return;

    this.testimonialService.rejectTestimonial(testimonial.id!, reason || undefined).subscribe({
      next: () => { this.loadTestimonials(); this.toastService.showWarning('Rejeté', 'Le témoignage a été rejeté'); },
      error: () => this.toastService.showError('Erreur', 'Impossible de rejeter')
    });
  }

  async toggleFeaturedTestimonial(testimonial: Testimonial): Promise<void> {
    this.testimonialService.toggleFeatured(testimonial.id!).subscribe({
      next: () => { this.loadTestimonials(); this.toastService.showSuccess('Mis à jour', `Témoignage ${!testimonial.is_featured ? 'en vedette' : 'normal'}`); },
      error: () => this.toastService.showError('Erreur', 'Impossible de mettre à jour')
    });
  }

  async deleteTestimonial(testimonial: Testimonial): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Supprimer le témoignage',
      `Supprimer définitivement le témoignage de "${testimonial.user?.first_name}" ?`,
      { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;

    this.testimonialService.deleteTestimonial(testimonial.id!).subscribe({
      next: () => { this.loadTestimonials(); this.toastService.showSuccess('Supprimé', 'Témoignage supprimé'); },
      error: () => this.toastService.showError('Erreur', 'Impossible de supprimer')
    });
  }

  getTestimonialStatusClass(status: string): string {
    const classes: { [key: string]: string } = { pending: 'bg-warning', approved: 'bg-success', rejected: 'bg-danger' };
    return classes[status] || 'bg-secondary';
  }

  getTestimonialStatusLabel(status: string): string {
    const labels: { [key: string]: string } = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' };
    return labels[status] || status;
  }

  onAvatarError(event: Event): void {
    const target = event.target as HTMLImageElement;
    if (target) target.src = 'assets/images/default-avatar.png';
  }

  // =============================================
  // UTILITAIRES
  // =============================================

  getRoleBadgeClass(role: string): string {
    const classes: { [key: string]: string } = { client: 'bg-primary', restaurant: 'bg-info', traiteur: 'bg-success', superadmin: 'bg-dark' };
    return classes[role] || 'bg-secondary';
  }

  getRoleLabel(role: string): string {
    const labels: { [key: string]: string } = { client: 'Client', restaurant: 'Restaurant', traiteur: 'Traiteur', superadmin: 'Super Admin' };
    return labels[role] || 'N/A';
  }

  getOrderStatusClass(status: string): string {
    const classes: { [key: string]: string } = { pending: 'bg-warning', confirmed: 'bg-info', preparing: 'bg-primary', ready: 'bg-success', delivered: 'bg-dark', cancelled: 'bg-danger' };
    return classes[status] || 'bg-secondary';
  }

  getOrderStatusLabel(status: string): string {
    const labels: { [key: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée' };
    return labels[status] || status;
  }

  getPaymentStatusClass(status: string): string {
    const classes: { [key: string]: string } = { success: 'bg-success', pending: 'bg-warning', failed: 'bg-danger', paid: 'bg-success' };
    return classes[status] || 'bg-secondary';
  }

  getPaymentStatusLabel(status: string): string {
    const labels: { [key: string]: string } = { success: 'Réussi', pending: 'En attente', failed: 'Échoué', paid: 'Payé' };
    return labels[status] || status;
  }

  getReservationStatusClass(status: string): string {
    const classes: { [key: string]: string } = { pending: 'bg-warning', confirmed: 'bg-success', cancelled: 'bg-danger' };
    return classes[status] || 'bg-secondary';
  }

  getReservationStatusLabel(status: string): string {
    const labels: { [key: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' };
    return labels[status] || status;
  }

  getPercentage(part: number = 0, total: number = 1): number {
    if (total === 0) return 0;
    return Math.round((part / total) * 100);
  }

  // =============================================
  // ABONNEMENTS & RAPPELS
  // =============================================

  loadSubscriptions(): void {
    const expiringSoon = this.subscriptionFilter === 'expiring_soon';
    this.adminService.getAllSubscriptions(expiringSoon).subscribe({
      next: (res) => { this.subscriptions = res.data || []; this.filteredSubscriptions = [...this.subscriptions]; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les abonnements')
    });
  }

  loadRemindersHistory(): void {
    this.loadingReminders = true;
    this.adminService.getRemindersHistory(30).subscribe({
      next: (res) => { this.remindersHistory = res.data || []; this.loadingReminders = false; },
      error: () => { this.loadingReminders = false; }
    });
  }

  async triggerReminders(): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Déclencher les rappels',
      'Envoyer les rappels d\'expiration à tous les abonnés concernés ?',
      { confirmText: 'Oui, envoyer', cancelText: 'Annuler', type: 'info' }
    );
    if (!confirmed) return;

    this.triggeringReminders = true;
    this.adminService.triggerExpiryReminders().subscribe({
      next: () => {
        this.triggeringReminders = false;
        this.toastService.showSuccess('Rappels lancés', 'Les rappels ont été envoyés en arrière-plan.');
        setTimeout(() => this.loadRemindersHistory(), 3000);
      },
      error: () => { this.triggeringReminders = false; this.toastService.showError('Erreur', 'Impossible de déclencher les rappels'); }
    });
  }

  async sendManualReminder(subscription: any, channel: 'email' | 'sms' | 'both'): Promise<void> {
    this.adminService.sendManualReminder(subscription.subscription_id, channel).subscribe({
      next: () => {
        this.toastService.showSuccess('Rappel envoyé', `Rappel envoyé à ${subscription.business_name} via ${channel}`);
        this.loadRemindersHistory();
      },
      error: (err) => this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'envoyer le rappel')
    });
  }

  getSubscriptionUrgencyClass(daysRemaining: number): string {
    if (daysRemaining < 0)  return 'bg-dark';
    if (daysRemaining <= 1) return 'bg-danger';
    if (daysRemaining <= 3) return 'bg-warning';
    if (daysRemaining <= 7) return 'bg-info';
    return 'bg-success';
  }

  getSubscriptionUrgencyLabel(daysRemaining: number): string {
    if (daysRemaining < 0)  return '⏰ Expiré';
    if (daysRemaining <= 1) return '🚨 Expire demain';
    if (daysRemaining <= 3) return `⚠️ ${daysRemaining}j restants`;
    if (daysRemaining <= 7) return `📅 ${daysRemaining}j restants`;
    return `✅ ${daysRemaining}j restants`;
  }

  getExpiringCount(): number { return this.subscriptions.filter(s => s.days_remaining >= 0 && s.days_remaining <= 7).length; }
  getExpiredCount(): number  { return this.subscriptions.filter(s => s.days_remaining < 0).length; }
}