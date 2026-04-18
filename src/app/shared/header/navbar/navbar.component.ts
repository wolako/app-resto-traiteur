import { Component, OnInit, OnDestroy, HostListener } from '@angular/core';
import { AuthService } from '../../../core/services/auth/auth.service';
import { User } from '../../../core/models/user.model';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ClientService } from '../../../core/services/client/client.service';
import { ChatService } from '../../../core/services/chat/chat.service';
import { SearchBarService } from '../../../core/services/search-bar/search-bar.service';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.component.html',
  styleUrl: './navbar.component.scss'
})
export class NavbarComponent implements OnInit, OnDestroy {
  currentUser: User | null = null;
  clientNotificationCount = 0;
  chatUnreadCount = 0;
  isMinimalRoute = false;

  showSearchBar = false;
  navSearchTerm = '';
  navTypeFilter = '';
  navAvailFilter = '';

  typeDropdownOpen  = false;
  availDropdownOpen = false;

  // ✅ État du menu mobile custom
  mobileMenuOpen = false;

  private subscriptions: Subscription[] = [];
  private countRefreshInterval: any;
  private readonly MINIMAL_ROUTES = ['/login', '/register', '/admin/login', '/business/login'];

  constructor(
    private authService: AuthService,
    private clientService: ClientService,
    private chatService: ChatService,
    private searchBarService: SearchBarService,
    private router: Router
  ) {
    this.checkMinimalRoute(this.router.url);

    const routeSub = this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: any) => {
        this.checkMinimalRoute(event.urlAfterRedirects || event.url);
        // ✅ Fermer le menu mobile à chaque navigation
        this.mobileMenuOpen = false;
        document.body.style.overflow = '';

        const url = event.urlAfterRedirects || event.url;
        if (url !== '/' && !url.startsWith('/?')) {
          this.searchBarService.setVisible(false);
        }
      });
    this.subscriptions.push(routeSub);

    const userSub = this.authService.currentUser$.subscribe(user => {
      this.currentUser = user;
      if (user?.role === 'client') {
        this.clientService.startPolling();
      } else {
        this.clientService.stopPolling();
        this.clientNotificationCount = 0;
      }
      if (user && ['client', 'restaurant', 'traiteur'].includes(user.role)) {
        this.loadChatUnreadCount();
        this.startCountRefresh();
      } else {
        this.chatUnreadCount = 0;
        this.stopCountRefresh();
      }
    });
    this.subscriptions.push(userSub);
  }

  ngOnInit(): void {
    const countSub = this.clientService.unreadCount$.subscribe(c => this.clientNotificationCount = c);
    this.subscriptions.push(countSub);

    const chatCountSub = this.chatService.unreadCount$.subscribe(c => this.chatUnreadCount = c);
    this.subscriptions.push(chatCountSub);

    const convSub = this.chatService.conversationDeleted$.subscribe(id => {
      if (id !== null) setTimeout(() => this.loadChatUnreadCount(), 500);
    });
    this.subscriptions.push(convSub);

    const searchSub = this.searchBarService.state$.subscribe(state => {
      this.showSearchBar = state.visible;
      if (state.visible) {
        this.navSearchTerm  = state.searchTerm;
        this.navTypeFilter  = state.typeFilter;
        this.navAvailFilter = state.availabilityFilter;
      }
    });
    this.subscriptions.push(searchSub);

    if (this.currentUser && ['client', 'restaurant', 'traiteur'].includes(this.currentUser.role)) {
      this.loadChatUnreadCount();
      this.startCountRefresh();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(s => s.unsubscribe());
    this.clientService.stopPolling();
    this.stopCountRefresh();
    document.body.style.overflow = '';
  }

  // ── Ferme dropdowns sur clic hors .nsi-dropdown ───────────
  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.nsi-dropdown')) {
      this.typeDropdownOpen  = false;
      this.availDropdownOpen = false;
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.typeDropdownOpen  = false;
    this.availDropdownOpen = false;
    this.closeMobileMenu();
  }

  private checkMinimalRoute(url: string): void {
    const path = url.split('?')[0];
    this.isMinimalRoute = this.MINIMAL_ROUTES.some(r => path === r || path.startsWith(r + '/'));
  }

  // ── Menu mobile ───────────────────────────────────────────
  toggleMobileMenu(event: MouseEvent): void {
    event.stopPropagation();
    this.mobileMenuOpen = !this.mobileMenuOpen;
    // Bloquer le scroll du body quand le drawer est ouvert
    document.body.style.overflow = this.mobileMenuOpen ? 'hidden' : '';
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen = false;
    document.body.style.overflow = '';
  }

  // ── Barre de recherche ───────────────────────────────────
  onNavSearch(event: Event): void {
    this.navSearchTerm = (event.target as HTMLInputElement).value;
    this.pushFilters();
  }

  clearNavSearch(): void {
    this.navSearchTerm = '';
    this.pushFilters();
  }

  // ── Dropdowns ────────────────────────────────────────────
  toggleTypeDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.typeDropdownOpen  = !this.typeDropdownOpen;
    this.availDropdownOpen = false;
  }

  toggleAvailDropdown(event: MouseEvent): void {
    event.stopPropagation();
    this.availDropdownOpen = !this.availDropdownOpen;
    this.typeDropdownOpen  = false;
  }

  setNavTypeFilter(value: string, event: MouseEvent): void {
    event.stopPropagation();
    this.navTypeFilter    = value;
    this.typeDropdownOpen = false;
    this.pushFilters();
  }

  setNavAvailFilter(value: string, event: MouseEvent): void {
    event.stopPropagation();
    this.navAvailFilter    = value;
    this.availDropdownOpen = false;
    this.pushFilters();
  }

  private pushFilters(): void {
    this.searchBarService.updateFilters({
      searchTerm:         this.navSearchTerm,
      typeFilter:         this.navTypeFilter,
      availabilityFilter: this.navAvailFilter
    });
    window.dispatchEvent(new CustomEvent('navbarSearchUpdate', {
      detail: {
        searchTerm:         this.navSearchTerm,
        typeFilter:         this.navTypeFilter,
        availabilityFilter: this.navAvailFilter
      }
    }));
  }

  private loadChatUnreadCount(): void { this.chatService.updateUnreadCount(); }

  private startCountRefresh(): void {
    this.stopCountRefresh();
    this.countRefreshInterval = setInterval(() => this.loadChatUnreadCount(), 30000);
  }

  private stopCountRefresh(): void {
    if (this.countRefreshInterval) { clearInterval(this.countRefreshInterval); this.countRefreshInterval = null; }
  }

  openChatWidget(): void {
    window.dispatchEvent(new CustomEvent('toggleChatWidget', { detail: { open: true } }));
  }

  logout(): void {
    this.clientService.stopPolling();
    this.stopCountRefresh();
    this.chatService.disconnectSocket();
    this.authService.logout();
    this.router.navigate(['/']);
  }

  getRoleLabel(role: string): string {
    const labels: { [key: string]: string } = {
      client: 'Client', restaurant: 'Restaurant', traiteur: 'Traiteur', superadmin: 'Admin'
    };
    return role ? (labels[role] || role) : '';
  }
}