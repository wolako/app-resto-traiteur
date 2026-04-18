// ========================================
// ORDER LIST COMPONENT - RESTOTRAITEUR
// Version complète avec filtres et pagination
// ========================================

import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule, Router } from '@angular/router';
import { Order } from '../../../core/models/order.model';
import { ToastService } from '../../../core/services/toast/toast.service';

@Component({
  selector: 'app-order-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './order-list.component.html',
  styleUrl: './order-list.component.scss'
})
export class OrderListComponent implements OnInit, OnChanges {
  @Input() orders: Order[] = [];
  
  filteredOrders: Order[] = [];

  // Filtres
  statusFilter = '';
  periodFilter = '';
  searchTerm = '';

  // Pagination
  currentPage = 1;
  itemsPerPage = 10;
  totalPages = 1;

  constructor(
    private router: Router,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
    this.initializeFilters();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['orders']) {
      this.initializeFilters();
    }
  }

  /**
   * Initialiser les filtres
   */
  private initializeFilters(): void {
    this.filteredOrders = [...this.orders];
    this.calculatePagination();
  }

  // ═══════════════════════════════════════
  // STATISTIQUES
  // ═══════════════════════════════════════

  /**
   * Récupérer les commandes par statut
   */
  getOrdersByStatus(status: string): Order[] {
    return this.orders.filter(order => order.status === status);
  }

  // ═══════════════════════════════════════
  // FILTRES
  // ═══════════════════════════════════════

  /**
   * Appliquer tous les filtres
   */
  applyFilters(): void {
    let result = [...this.orders];

    // Filtre par statut
    if (this.statusFilter) {
      result = result.filter(order => order.status === this.statusFilter);
    }

    // Filtre par période
    if (this.periodFilter) {
      result = this.filterByPeriod(result);
    }

    // Filtre par recherche (ID ou nom)
    if (this.searchTerm) {
      const term = this.searchTerm.toLowerCase().trim();
      result = result.filter(order => 
        order.id?.toString().includes(term) ||
        order.client_name?.toLowerCase().includes(term) ||
        order.client_phone?.includes(term)
      );
    }

    this.filteredOrders = result;
    this.currentPage = 1; // Réinitialiser à la page 1
    this.calculatePagination();
  }

  /**
   * Filtrer par période
   */
  private filterByPeriod(orders: Order[]): Order[] {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    return orders.filter(order => {
      if (!order.created_at) return false;
      
      const orderDate = new Date(order.created_at);
      
      switch (this.periodFilter) {
        case 'today':
          return orderDate >= startOfToday;
        
        case 'week':
          const startOfWeek = new Date(now);
          startOfWeek.setDate(now.getDate() - 7);
          return orderDate >= startOfWeek;
        
        case 'month':
          const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
          return orderDate >= startOfMonth;
        
        default:
          return true;
      }
    });
  }

  // ═══════════════════════════════════════
  // STATUS HELPERS
  // ═══════════════════════════════════════

  /**
   * Obtenir l'icône du statut
   */
  getStatusIcon(status: string): string {
    const icons: { [key: string]: string } = {
      'pending': 'bi bi-clock-history',
      'confirmed': 'bi bi-check-circle',
      'preparing': 'bi bi-arrow-repeat',
      'ready': 'bi bi-check-all',
      'delivered': 'bi bi-box-seam',
      'cancelled': 'bi bi-x-circle'
    };
    return icons[status] || 'bi bi-circle';
  }

  /**
   * Obtenir le label du statut
   */
  getStatusLabel(status: string): string {
    const labels: { [key: string]: string } = {
      'pending': 'En attente',
      'confirmed': 'Confirmée',
      'preparing': 'En préparation',
      'ready': 'Prête',
      'delivered': 'Livrée',
      'cancelled': 'Annulée'
    };
    return labels[status] || status;
  }

  /**
   * Obtenir la couleur du statut (Bootstrap classes)
   */
  getStatusColor(status: string): string {
    const colors: { [key: string]: string } = {
      'pending': 'warning',
      'confirmed': 'info',
      'preparing': 'primary',
      'ready': 'success',
      'delivered': 'secondary',
      'cancelled': 'danger'
    };
    return colors[status] || 'secondary';
  }

  // ═══════════════════════════════════════
  // ACTIONS
  // ═══════════════════════════════════════

  /**
   * Voir les détails d'une commande
   */
  viewOrder(order: Order): void {
    if (order.id) {
      this.router.navigate(['/orders', order.id]);
    }
  }

  /**
   * Recommander (dupliquer une commande)
   */
  reorder(order: Order): void {
    // TODO: Implémenter la logique de recommande
    // Exemple: Ajouter les items au panier et rediriger vers checkout
    
    this.toastService.showInfo(
      'Recommander',
      'Fonctionnalité à venir : ajouter les articles au panier'
    );
    
    console.log('Recommander commande:', order);
  }

  // ═══════════════════════════════════════
  // PAGINATION
  // ═══════════════════════════════════════

  /**
   * Calculer la pagination
   */
  calculatePagination(): void {
    this.totalPages = Math.ceil(this.filteredOrders.length / this.itemsPerPage);
    
    // S'assurer que la page courante est valide
    if (this.currentPage > this.totalPages && this.totalPages > 0) {
      this.currentPage = this.totalPages;
    }
    
    if (this.totalPages === 0) {
      this.currentPage = 1;
    }
  }

  /**
   * Page précédente
   */
  previousPage(): void {
    if (this.currentPage > 1) {
      this.currentPage--;
      this.scrollToTop();
    }
  }

  /**
   * Page suivante
   */
  nextPage(): void {
    if (this.currentPage < this.totalPages) {
      this.currentPage++;
      this.scrollToTop();
    }
  }

  /**
   * Obtenir les commandes de la page courante
   */
  getPaginatedOrders(): Order[] {
    const start = (this.currentPage - 1) * this.itemsPerPage;
    const end = start + this.itemsPerPage;
    return this.filteredOrders.slice(start, end);
  }

  /**
   * Scroll vers le haut de la liste
   */
  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ═══════════════════════════════════════
  // UTILS
  // ═══════════════════════════════════════

  /**
   * Formater un montant
   */
  formatAmount(amount: number | undefined): string {
    if (!amount) return '0';
    return Math.round(amount).toLocaleString('fr-FR');
  }

  /**
   * Obtenir le type de paiement formaté
   */
  getPaymentTypeLabel(paymentType: string | undefined): string {
    if (!paymentType) return 'Non spécifié';
    return paymentType === 'cod' ? 'Paiement à la livraison' : 'Paiement en ligne';
  }

  /**
   * Vérifier si une commande est récente (moins de 24h)
   */
  isRecentOrder(order: Order): boolean {
    if (!order.created_at) return false;
    
    const orderDate = new Date(order.created_at);
    const now = new Date();
    const diffHours = (now.getTime() - orderDate.getTime()) / (1000 * 60 * 60);
    
    return diffHours < 24;
  }

  /**
   * Obtenir la classe CSS pour une commande récente
   */
  getRecentOrderClass(order: Order): string {
    return this.isRecentOrder(order) ? 'recent-order' : '';
  }
}