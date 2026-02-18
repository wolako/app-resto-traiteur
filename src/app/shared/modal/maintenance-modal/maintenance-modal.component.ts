import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { MaintenanceService, MaintenanceStatus } from '../../../core/services/maintenance/maintenance.service';

@Component({
  selector: 'app-maintenance-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './maintenance-modal.component.html',
  styleUrls: ['./maintenance-modal.component.scss']
})
export class MaintenanceModalComponent implements OnInit, OnDestroy {
  showModal = false;
  maintenanceStatus: MaintenanceStatus = {
    enabled: false,
    message: '',
    end_time: null
  };
  
  isAdmin = false;
  private subscription?: Subscription;

  constructor(private maintenanceService: MaintenanceService) {}

  ngOnInit(): void {
    // Vérifier si l'utilisateur est admin
    this.isAdmin = this.maintenanceService.isUserAdmin();

    // S'abonner aux changements de statut de maintenance
    this.subscription = this.maintenanceService.maintenanceStatus$.subscribe(
      (status) => {
        this.maintenanceStatus = status;
        
        // Afficher le modal uniquement si :
        // 1. La maintenance est activée
        // 2. L'utilisateur n'est pas admin
        this.showModal = status.enabled && !this.isAdmin;
        
        // Si le modal doit être affiché, bloquer le scroll
        if (this.showModal) {
          document.body.style.overflow = 'hidden';
        } else {
          document.body.style.overflow = 'auto';
        }
      }
    );
  }

  ngOnDestroy(): void {
    // Nettoyer l'abonnement
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
    
    // Restaurer le scroll
    document.body.style.overflow = 'auto';
  }

  /**
   * Rafraîchir la page pour vérifier si la maintenance est terminée
   */
  refresh(): void {
    this.maintenanceService.checkMaintenanceStatus();
  }

  /**
   * Formater l'heure de fin de maintenance
   */
  getFormattedEndTime(): string {
    if (!this.maintenanceStatus.end_time) {
      return '';
    }
    return this.maintenanceStatus.end_time;
  }
}