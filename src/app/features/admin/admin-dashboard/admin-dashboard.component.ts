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
import { ReservationDetailsModalComponent } from '../../../shared/modal/reservation-details-modal/reservation-details-modal.component';
import { OrderDetailsModalComponent } from '../../../shared/modal/order-details-modal/order-details-modal.component';
import { AdminAnalyticsComponent } from '../../../shared/components/admin-analytics/admin-analytics.component';
import { PlansManagementComponent } from '../plans-management/plans-management.component';
import { PlatformSettingsComponent } from '../platform-settings/platform-settings.component';
import { PaymentAccountsAdminComponent } from '../payment-accounts-admin/payment-accounts-admin.component';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    OrderDetailsModalComponent,
    ReservationDetailsModalComponent,
    AdminAnalyticsComponent,
    PlansManagementComponent,
    PlatformSettingsComponent,
    PaymentAccountsAdminComponent
  ],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.scss']
})
export class AdminDashboardComponent implements OnInit {
  activeTab = 'overview';

  // ── Mobile bottom nav ────────────────────────────────────────
  mobileMoreOpen = false;

  // ── Données ──────────────────────────────────────────────────
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

  // ── Commissions ──────────────────────────────────────────────
  commissions: any[] = [];
  filteredCommissions: any[] = [];
  commissionStats: any = null;
  commissionStatusFilter = '';
  commissionLoading = false;
  isSandbox = environment.paymentMode === 'sandbox';

  // ── Filtres ──────────────────────────────────────────────────
  userFilter = 'client';
  businessFilter = '';
  orderStatusFilter = '';
  orderPaymentFilter = '';
  reservationStatusFilter = '';

  // ── Modal établissement ───────────────────────────────────────
  showEditBusinessModal = false;
  selectedBusiness: Business | null = null;
  businessFormData: any = {};
  loadingBusinessUpdate = false;

  showOrderModal = false;
  selectedOrder: any = null;
  loadingOrderUpdate = false;

  showReservationModal = false;
  selectedReservation: any = null;
  loadingReservationUpdate = false;

  // ── Abonnements ───────────────────────────────────────────────
  subscriptions: any[] = [];
  filteredSubscriptions: any[] = [];
  subscriptionFilter = 'all';
  remindersHistory: any[] = [];
  loadingReminders = false;
  triggeringReminders = false;

  // ── Messages de contact ───────────────────────────────────────
  contactMessages:     any[] = [];
  filteredContacts:    any[] = [];
  contactFilter      = '';
  contactsLoading    = false;
  unreadContactsCount = 0;
  selectedContact:   any = null;
  contactReplyText   = '';
  contactReplying    = false;

  pendingPaymentAccountsCount = 0;

  geocodingLoading = false;

  today = new Date();

  // ── Drivers ───────────────────────────────────────
  drivers: any[] = [];
  filteredDrivers: any[] = [];
  driverFilter = '';

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
    this.loadContactsCount();
    this.loadPaymentAccountsCount();
  }

  // ═══════════════════════════════════════════════════════════
  // NAVIGATION
  // ═══════════════════════════════════════════════════════════

  switchTab(tab: string): void {
    this.activeTab = tab;
    this.mobileMoreOpen = false;
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
      case 'contacts':      this.loadContacts();       break;
      case 'drivers':       this.loadAllDrivers();     break;
      case 'analytics':
      case 'plans':
      case 'settings':
      case 'payment-accounts': this.loadPaymentAccountsCount();
      break;
    }
  }

  getTabTitle(): string {
    const titles: { [key: string]: string } = {
      overview:      'Vue d\'ensemble',
      users:         'Clients',
      businesses:    'Établissements',
      orders:        'Commandes',
      reservations:  'Réservations',
      payments:      'Paiements',
      support:       'Support',
      testimonials:  'Témoignages',
      subscriptions: 'Abonnements',
      commissions:   'Commissions',
      analytics:     'Analytics',
      plans:         'Plans d\'abonnement',
      settings:      'Paramètres',
      contacts:      'Messages de contact',
      payment_accounts: 'Comptes de paiement',
    };
    return titles[this.activeTab] || 'Dashboard';
  }

  getTabSubtitle(): string {
    const subtitles: { [key: string]: string } = {
      overview:      'Vue globale de la plateforme',
      users:         'Gestion des comptes clients',
      businesses:    'Gestion des restaurants et traiteurs',
      orders:        'Suivi et gestion des commandes',
      reservations:  'Gestion des réservations',
      payments:      'Suivi des transactions',
      support:       'Tickets et assistance',
      testimonials:  'Modération des avis clients',
      subscriptions: 'Abonnements et rappels d\'expiration',
      commissions:   'Revenus générés par la plateforme',
      analytics:     'Statistiques avancées',
      plans:         'Création et modification des offres',
      settings:      'Configuration globale de la plateforme',
      contacts:      'Messages reçus via le formulaire de contact',
      payment_accounts: 'Vérification des comptes de reversement CinetPay',
    };
    return subtitles[this.activeTab] || '';
  }

  // ═══════════════════════════════════════════════════════════
  // CHARGEMENT DES DONNÉES
  // ═══════════════════════════════════════════════════════════

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

  // ── Commissions ──────────────────────────────────────────────
  loadCommissions(): void {
    this.commissionLoading = true;
    this.http.get<any>(`${environment.apiUrl}/commissions/all`).subscribe({
      next: (res) => {
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
      next: () => { this.loadCommissions(); this.toastService.showSuccess('Commission collectée', `${this.formatAmount(amount)} FCFA collectés`); },
      error: (err) => { this.toastService.showError('Erreur', err.error?.message || 'Impossible de mettre à jour'); }
    });
  }

  getPendingCommissionsCount(): number { return this.commissions.filter(c => c.status === 'pending').length; }
  getTotalPendingCommissions(): number  { return this.commissions.filter(c => c.status === 'pending').reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0); }
  getTotalCollectedCommissions(): number { return this.commissions.filter(c => c.status === 'collected').reduce((sum, c) => sum + parseFloat(c.commission_amount || 0), 0); }
  formatAmount(n: any): string { return parseInt(n || 0).toLocaleString('fr-FR'); }

  getCommissionStatusClass(status: string): string {
    const c: { [k: string]: string } = { pending: 's-pending', collected: 's-confirmed', paid: 's-delivered' };
    return c[status] || 'role-client';
  }

  getCommissionStatusLabel(status: string): string {
    const l: { [k: string]: string } = { pending: 'En attente', collected: 'Collectée', paid: 'Payée' };
    return l[status] || status;
  }

  // ═══════════════════════════════════════════════════════════
  // FILTRES
  // ═══════════════════════════════════════════════════════════

  filterUsers(): void {
    this.filteredUsers = this.userFilter ? this.users.filter(u => u.role === this.userFilter) : this.users;
  }

  filterBusinesses(): void {
    this.filteredBusinesses = this.businessFilter ? this.businesses.filter(b => b.type === this.businessFilter) : this.businesses;
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

  // ═══════════════════════════════════════════════════════════
  // UTILISATEURS
  // ═══════════════════════════════════════════════════════════

  async deleteUser(userId: number, userName: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Supprimer l\'utilisateur',
      `Êtes-vous sûr de vouloir SUPPRIMER l'utilisateur "${userName}" ?\n\nCette action est irréversible !`,
      { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!confirmed) return;
    this.adminService.deleteUser(userId).subscribe({
      next: () => { this.loadUsers(); this.toastService.showSuccess('Utilisateur supprimé', `"${userName}" a été supprimé`); },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de supprimer')
    });
  }

  // ═══════════════════════════════════════════════════════════
  // ÉTABLISSEMENTS
  // ═══════════════════════════════════════════════════════════

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
      next: () => { this.loadBusinesses(); this.toastService.showSuccess('Statut mis à jour', `"${businessName}" ${isActive ? 'activé' : 'désactivé'}`); },
      error: () => this.toastService.showError('Erreur', 'Impossible de mettre à jour le statut')
    });
  }

  openEditBusinessModal(business: Business): void {
    this.selectedBusiness = business;
    this.businessFormData = {
      name:               business.name,
      description:        business.description        || '',
      address:            business.address            || '',
      phone:              business.phone              || '',
      opening_hour:       business.opening_hour       || '',
      closing_hour:       business.closing_hour       || '',
      availability_start: business.availability_start || '',
      availability_end:   business.availability_end   || '',
      // ✅ Pré-remplir les champs géo depuis les données existantes
      latitude:   (business as any).latitude  ?? '',
      longitude:  (business as any).longitude ?? '',
      district:   (business as any).district  || '',
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

    // ✅ Capturer le nom AVANT de fermer la modale (évite "undefined mis à jour")
    const businessName = this.businessFormData.name;

    // ✅ Construire le payload avec tous les champs y compris géo
    const payload: any = {
      name:        this.businessFormData.name,
      description: this.businessFormData.description || '',
      address:     this.businessFormData.address     || '',
      phone:       this.businessFormData.phone       || '',
      opening_hour:       this.businessFormData.opening_hour       || '',
      closing_hour:       this.businessFormData.closing_hour       || '',
      availability_start: this.businessFormData.availability_start || '',
      availability_end:   this.businessFormData.availability_end   || '',
    };

    // ✅ Ajouter les champs géo seulement s'ils sont renseignés
    const lat = parseFloat(this.businessFormData.latitude);
    const lng = parseFloat(this.businessFormData.longitude);
    if (!isNaN(lat) && this.businessFormData.latitude !== '') payload.latitude  = lat;
    if (!isNaN(lng) && this.businessFormData.longitude !== '') payload.longitude = lng;
    if (this.businessFormData.district) payload.district = this.businessFormData.district;

    this.adminService.updateBusiness(this.selectedBusiness.id, payload).subscribe({
      next: () => {
        this.loadBusinesses();
        this.closeEditBusinessModal();
        this.loadingBusinessUpdate = false;
        // ✅ Utiliser la variable capturée avant fermeture
        this.toastService.showSuccess('Mis à jour', `"${businessName}" mis à jour avec succès`);
      },
      error: (error) => {
        this.loadingBusinessUpdate = false;
        this.toastService.showError('Erreur', error.error?.message || 'Impossible de mettre à jour');
      }
    });
  }

  async deleteBusiness(businessId: number, businessName: string): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Supprimer l\'établissement', `Supprimer "${businessName}" ? Action irréversible !`, { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' });
    if (!confirmed) return;
    this.adminService.deleteBusiness(businessId).subscribe({
      next: () => { this.loadBusinesses(); this.toastService.showSuccess('Supprimé', `"${businessName}" supprimé`); },
      error: (error) => this.toastService.showError('Erreur', error.error?.message || 'Impossible de supprimer')
    });
  }

  // ═══════════════════════════════════════════════════════════
  // COMMANDES
  // ═══════════════════════════════════════════════════════════

  viewOrderDetails(order: any): void {
    this.adminService.getOrderById(order.id).subscribe({
      next: (orderDetails) => { this.selectedOrder = orderDetails; this.showOrderModal = true; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les détails')
    });
  }

  onOrderModalClosed(): void { this.showOrderModal = false; this.selectedOrder = null; }

  async onOrderStatusChanged(event: { orderId: number; status: string }): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Changer le statut', `Confirmer le changement vers "${this.getOrderStatusLabel(event.status)}" ?`, { confirmText: 'Oui', cancelText: 'Annuler', type: event.status === 'cancelled' ? 'danger' : 'info' });
    if (!confirmed) return;
    this.loadingOrderUpdate = true;
    this.adminService.updateOrderStatus(event.orderId, event.status).subscribe({
      next: () => { this.loadingOrderUpdate = false; if (this.selectedOrder?.id === event.orderId) this.selectedOrder = { ...this.selectedOrder, status: event.status }; this.loadOrders(); this.toastService.showSuccess('Mis à jour', `Commande #${event.orderId} → "${this.getOrderStatusLabel(event.status)}"`); },
      error: () => { this.loadingOrderUpdate = false; this.toastService.showError('Erreur', 'Impossible de mettre à jour le statut'); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // RÉSERVATIONS
  // ═══════════════════════════════════════════════════════════

  viewReservationDetails(reservation: any): void {
    this.adminService.getReservationById(reservation.id).subscribe({
      next: (details) => { this.selectedReservation = details; this.showReservationModal = true; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les détails')
    });
  }

  onReservationModalClosed(): void { this.showReservationModal = false; this.selectedReservation = null; }

  async onReservationStatusChanged(event: { reservationId: number; status: string }): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Changer le statut', `Confirmer le changement vers "${this.getReservationStatusLabel(event.status)}" ?`, { confirmText: 'Oui', cancelText: 'Annuler', type: event.status === 'cancelled' ? 'danger' : 'success' });
    if (!confirmed) return;
    this.loadingReservationUpdate = true;
    this.adminService.updateReservationStatus(event.reservationId, event.status).subscribe({
      next: () => { this.loadingReservationUpdate = false; if (this.selectedReservation?.id === event.reservationId) this.selectedReservation = { ...this.selectedReservation, status: event.status }; this.loadReservations(); this.toastService.showSuccess('Mis à jour', `Réservation #${event.reservationId} → "${this.getReservationStatusLabel(event.status)}"`); },
      error: () => { this.loadingReservationUpdate = false; this.toastService.showError('Erreur', 'Impossible de mettre à jour le statut'); }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // SUPPORT
  // ═══════════════════════════════════════════════════════════

  loadSupportTickets(): void {
    this.http.get<any>(`${environment.apiUrl}/support/all`, { params: { status: this.supportStatusFilter || 'all' } }).subscribe({
      next: (res: any) => { this.supportTickets = res.data || []; this.filterSupportTickets(); this.premiumTicketsCount = this.supportTickets.filter((t: any) => t.is_premium && t.status === 'open').length; },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les tickets')
    });
  }

  filterSupportTickets(): void {
    this.filteredSupportTickets = this.supportStatusFilter ? this.supportTickets.filter((t: any) => t.status === this.supportStatusFilter) : this.supportTickets;
  }

  viewTicket(ticket: any): void { alert(`Ticket #${ticket.id}\n\nSujet: ${ticket.subject}\n\nMessage: ${ticket.message}`); }

  async respondToTicket(ticket: any): Promise<void> {
    const response = prompt(`Répondre au ticket #${ticket.id} :\n\n${ticket.subject}\n\n${ticket.message}\n\nVotre réponse:`);
    if (!response) return;
    this.http.put(`${environment.apiUrl}/support/tickets/${ticket.id}/respond`, { response, status: 'resolved' }).subscribe({
      next: () => { this.loadSupportTickets(); this.toastService.showSuccess('Réponse envoyée', `Ticket #${ticket.id} résolu`); },
      error: (err: any) => this.toastService.showError('Erreur', err.error?.error || 'Impossible de répondre')
    });
  }

  getSupportStatusLabel(status: string): string { const l: { [k: string]: string } = { open: 'Ouvert', in_progress: 'En cours', resolved: 'Résolu', closed: 'Fermé' }; return l[status] || status; }
  getSupportStatusClass(status: string): string  { const c: { [k: string]: string } = { open: 'bg-warning', in_progress: 'bg-primary', resolved: 'bg-success', closed: 'bg-secondary' }; return c[status] || 'bg-secondary'; }
  getSupportPriorityClass(priority: string): string { const c: { [k: string]: string } = { low: 'role-client', normal: 's-confirmed', high: 's-pending', urgent: 'r-cancelled' }; return c[priority] || 's-confirmed'; }
  getOpenTicketsCount(): number       { return this.supportTickets.filter(t => t.status === 'open').length; }
  getInProgressTicketsCount(): number { return this.supportTickets.filter(t => t.status === 'in_progress').length; }
  getResolvedTicketsCount(): number   { return this.supportTickets.filter(t => t.status === 'resolved').length; }
  getPremiumTicketsCount(): number    { return this.supportTickets.filter(t => t.is_premium).length; }

  // ═══════════════════════════════════════════════════════════
  // TÉMOIGNAGES
  // ═══════════════════════════════════════════════════════════

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

  filterTestimonials(): void { this.filteredTestimonials = this.testimonialStatusFilter ? this.testimonials.filter(t => t.status === this.testimonialStatusFilter) : this.testimonials; }

  async approveTestimonial(testimonial: Testimonial, featured: boolean = false): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Approuver le témoignage', `Approuver le témoignage de "${testimonial.user?.first_name}" ?${featured ? '\n\nMis en vedette sur la page d\'accueil.' : ''}`, { confirmText: 'Oui, approuver', cancelText: 'Annuler', type: 'success' });
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
    const confirmed = await this.confirmationService.confirm('Supprimer le témoignage', `Supprimer définitivement le témoignage de "${testimonial.user?.first_name}" ?`, { confirmText: 'Oui, supprimer', cancelText: 'Annuler', type: 'danger' });
    if (!confirmed) return;
    this.testimonialService.deleteTestimonial(testimonial.id!).subscribe({
      next: () => { this.loadTestimonials(); this.toastService.showSuccess('Supprimé', 'Témoignage supprimé'); },
      error: () => this.toastService.showError('Erreur', 'Impossible de supprimer')
    });
  }

  getTestimonialStatusClass(status: string): string { const c: { [k: string]: string } = { pending: 'bg-warning', approved: 'bg-success', rejected: 'bg-danger' }; return c[status] || 'bg-secondary'; }
  getTestimonialStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', approved: 'Approuvé', rejected: 'Rejeté' }; return l[status] || status; }
  onAvatarError(event: Event): void { const target = event.target as HTMLImageElement; if (target) target.src = 'assets/images/default-avatar.png'; }

  // ═══════════════════════════════════════════════════════════
  // UTILITAIRES
  // ═══════════════════════════════════════════════════════════

  getOrderStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', preparing: 'En préparation', ready: 'Prête', delivered: 'Livrée', cancelled: 'Annulée' }; return l[status] || status; }
  getPaymentStatusLabel(status: string): string { const l: { [k: string]: string } = { success: 'Réussi', pending: 'En attente', failed: 'Échoué', paid: 'Payé' }; return l[status] || status; }
  getReservationStatusLabel(status: string): string { const l: { [k: string]: string } = { pending: 'En attente', confirmed: 'Confirmée', cancelled: 'Annulée' }; return l[status] || status; }
  getPercentage(part: number = 0, total: number = 1): number { if (total === 0) return 0; return Math.round((part / total) * 100); }

  // ═══════════════════════════════════════════════════════════
  // ABONNEMENTS & RAPPELS
  // ═══════════════════════════════════════════════════════════

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
    const confirmed = await this.confirmationService.confirm('Déclencher les rappels', 'Envoyer les rappels d\'expiration à tous les abonnés concernés ?', { confirmText: 'Oui, envoyer', cancelText: 'Annuler', type: 'info' });
    if (!confirmed) return;
    this.triggeringReminders = true;
    this.adminService.triggerExpiryReminders().subscribe({
      next: () => { this.triggeringReminders = false; this.toastService.showSuccess('Rappels lancés', 'Les rappels ont été envoyés en arrière-plan.'); setTimeout(() => this.loadRemindersHistory(), 3000); },
      error: () => { this.triggeringReminders = false; this.toastService.showError('Erreur', 'Impossible de déclencher les rappels'); }
    });
  }

  async sendManualReminder(subscription: any, channel: 'email' | 'sms' | 'both'): Promise<void> {
    this.adminService.sendManualReminder(subscription.subscription_id, channel).subscribe({
      next: () => { this.toastService.showSuccess('Rappel envoyé', `Rappel envoyé à ${subscription.business_name} via ${channel}`); this.loadRemindersHistory(); },
      error: (err) => this.toastService.showError('Erreur', err.error?.error || 'Impossible d\'envoyer le rappel')
    });
  }

  getSubscriptionUrgencyClass(daysRemaining: number): string {
    if (daysRemaining < 0)  return 'role-client';
    if (daysRemaining <= 1) return 'r-cancelled';
    if (daysRemaining <= 3) return 's-pending';
    if (daysRemaining <= 7) return 's-confirmed';
    return 'b-active';
  }

  getSubscriptionUrgencyLabel(daysRemaining: number): string {
    if (daysRemaining < 0)  return '⏰ Expiré';
    if (daysRemaining <= 1) return '🚨 Expire demain';
    if (daysRemaining <= 3) return `⚠️ ${daysRemaining}j restants`;
    if (daysRemaining <= 7) return `📅 ${daysRemaining}j restants`;
    return `✅ ${daysRemaining}j restants`;
  }

  async confirmCodPaymentAdmin(orderId: number, businessName: string, amount: number): Promise<void> {
    const confirmed = await this.confirmationService.confirm('Confirmer paiement COD', `Confirmer la réception de ${this.formatAmount(amount)} FCFA pour "${businessName}" ?`, { confirmText: 'Oui, confirmer', cancelText: 'Annuler', type: 'success' });
    if (!confirmed) return;
    this.http.post(`${environment.apiUrl}/orders/${orderId}/confirm-cod-payment`, { cod_amount: amount }).subscribe({
      next: () => { this.loadOrders(); this.loadCommissions(); this.toastService.showSuccess('✅ Paiement COD confirmé', `${this.formatAmount(amount)} FCFA confirmés`); },
      error: (err) => { this.toastService.showError('Erreur', err.error?.error || 'Impossible de confirmer le paiement'); }
    });
  }

  getExpiringCount(): number { return this.subscriptions.filter(s => s.days_remaining >= 0 && s.days_remaining <= 7).length; }
  getExpiredCount(): number  { return this.subscriptions.filter(s => s.days_remaining < 0).length; }

  // ═══════════════════════════════════════════════════════════
  // MESSAGES DE CONTACT
  // ═══════════════════════════════════════════════════════════

  loadContactsCount(): void {
    this.http.get<any>(`${environment.apiUrl}/contact`, { params: { limit: '1' } }).subscribe({
      next: (res) => { this.unreadContactsCount = res.data?.unread || 0; },
      error: () => {}
    });
  }

  loadContacts(): void {
    this.contactsLoading = true;
    const params: any = { limit: 50 };
    if (this.contactFilter) params.status = this.contactFilter;

    this.http.get<any>(`${environment.apiUrl}/contact`, { params }).subscribe({
      next: (res) => {
        this.contactMessages     = res.data?.messages || [];
        this.unreadContactsCount = res.data?.unread   || 0;
        this.filteredContacts    = [...this.contactMessages];
        this.contactsLoading     = false;
      },
      error: () => { this.contactsLoading = false; }
    });
  }

  filterContacts(): void {
    this.selectedContact = null;
    this.loadContacts();
  }

  openContact(msg: any): void {
    this.selectedContact  = { ...msg };
    this.contactReplyText = msg.reply || '';

    if (msg.status === 'unread') {
      this.http.get<any>(`${environment.apiUrl}/contact/${msg.id}`).subscribe({
        next: () => {
          msg.status = 'read';
          this.selectedContact.status = 'read';
          this.unreadContactsCount = Math.max(0, this.unreadContactsCount - 1);
        }
      });
    }
  }

  async sendContactReply(id: number): Promise<void> {
    if (!this.contactReplyText.trim()) return;

    const confirmed = await this.confirmationService.confirm(
      'Envoyer la réponse ?',
      `La réponse sera envoyée par email à ${this.selectedContact?.email}`,
      { confirmText: 'Oui, envoyer', cancelText: 'Annuler', type: 'info' }
    );
    if (!confirmed) return;

    this.contactReplying = true;
    this.http.patch<any>(`${environment.apiUrl}/contact/${id}/reply`, { reply: this.contactReplyText }).subscribe({
      next: (res) => {
        this.contactReplying  = false;
        this.selectedContact  = res.data;
        this.contactReplyText = '';
        this.toastService.showSuccess('Réponse envoyée', `Email envoyé à ${res.data.email}`);
        const idx = this.contactMessages.findIndex(m => m.id === id);
        if (idx !== -1) this.contactMessages[idx] = res.data;
        this.filteredContacts = [...this.contactMessages];
      },
      error: (err) => {
        this.contactReplying = false;
        this.toastService.showError('Erreur', err.error?.message || 'Impossible d\'envoyer la réponse');
      }
    });
  }

  async archiveContact(id: number): Promise<void> {
    const confirmed = await this.confirmationService.confirm(
      'Archiver ce message ?', 'Le message sera marqué comme archivé.',
      { confirmText: 'Archiver', cancelText: 'Annuler', type: 'warning' }
    );
    if (!confirmed) return;

    this.http.patch<any>(`${environment.apiUrl}/contact/${id}/archive`, {}).subscribe({
      next: () => {
        if (this.selectedContact?.id === id) this.selectedContact.status = 'archived';
        const idx = this.contactMessages.findIndex(m => m.id === id);
        if (idx !== -1) this.contactMessages[idx].status = 'archived';
        this.filteredContacts = [...this.contactMessages];
        this.toastService.showSuccess('Archivé', 'Le message a été archivé');
      },
      error: (err) => this.toastService.showError('Erreur', err.error?.message || 'Impossible d\'archiver')
    });
  }

  getContactSubjectLabel(subject: string): string {
    const l: { [k: string]: string } = {
      question: 'Question Générale', support: 'Support Technique',
      business: 'Partenariat', complaint: 'Réclamation', other: 'Autre'
    };
    return l[subject] || subject;
  }

  getContactStatusLabel(status: string): string {
    const l: { [k: string]: string } = {
      unread: 'Non lu', read: 'Lu', replied: 'Répondu', archived: 'Archivé'
    };
    return l[status] || status;
  }

  getContactStatusClass(status: string): string {
    const c: { [k: string]: string } = {
      unread: 'danger', read: 'role-client', replied: 'b-active', archived: 'b-inactive'
    };
    return c[status] || 'role-client';
  }

  loadPaymentAccountsCount(): void {
    this.http.get<any>(`${environment.apiUrl}/admin/payment-accounts?status=pending_verification`).subscribe({
      next: (res) => {
        this.pendingPaymentAccountsCount = res.summary?.pending_verification || 0;
      },
      error: () => {}
    });
  }

  // ✅ Géocodage depuis l'adresse via OpenStreetMap (gratuit, sans clé API)
  geocodeAddress(address: string): void {
    if (!address?.trim()) {
      this.toastService.showWarning('Adresse manquante', 'Renseignez d\'abord une adresse');
      return;
    }
    this.geocodingLoading = true;
    const query = encodeURIComponent(`${address}, Lomé, Togo`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1&countrycodes=tg`;

    this.http.get<any[]>(url, {
      headers: { 'Accept-Language': 'fr' }
    }).subscribe({
      next: (results) => {
        this.geocodingLoading = false;
        if (results && results.length > 0) {
          const result = results[0];
          this.businessFormData.latitude  = parseFloat(result.lat).toFixed(6);
          this.businessFormData.longitude = parseFloat(result.lon).toFixed(6);
          this.toastService.showSuccess(
            'Coordonnées trouvées',
            `${result.display_name.split(',')[0]} — Lat: ${this.businessFormData.latitude}, Lng: ${this.businessFormData.longitude}`
          );
        } else {
          this.toastService.showWarning(
            'Adresse introuvable',
            'Entrez les coordonnées manuellement ou affinez l\'adresse'
          );
        }
      },
      error: () => {
        this.geocodingLoading = false;
        this.toastService.showError('Erreur', 'Impossible de géocoder l\'adresse');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════
  // DRIVERS
  // ═══════════════════════════════════════════════════════════
  loadAllDrivers(): void {
    this.http.get<any>(`${environment.apiUrl}/drivers`).subscribe({
      next: (res) => {
        this.drivers = res.data || [];
        this.filterDriversAdmin();
      },
      error: () => this.toastService.showError('Erreur', 'Impossible de charger les livreurs')
    });
  }

  filterDriversAdmin(): void {
    this.filteredDrivers = this.driverFilter
      ? this.drivers.filter(d => d.business_name?.toLowerCase().includes(this.driverFilter.toLowerCase())
          || d.real_status === this.driverFilter)
      : [...this.drivers];
  }

  async deactivateDriverAdmin(driver: any): Promise<void> {
    const ok = await this.confirmationService.confirm(
      'Désactiver le livreur ?',
      `Désactiver ${driver.first_name} ${driver.last_name} — ${driver.business_name} ?`,
      { confirmText: 'Désactiver', cancelText: 'Annuler', type: 'warning' }
    );
    if (!ok) return;
    this.http.delete<any>(`${environment.apiUrl}/drivers/${driver.id}`).subscribe({
      next: () => { this.loadAllDrivers(); this.toastService.showSuccess('Désactivé', ''); },
      error: () => this.toastService.showError('Erreur', 'Impossible de désactiver')
    });
  }

}