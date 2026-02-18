import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AppSetting, SettingsService } from '../../../core/services/settings/settings.service';
import { MaintenanceService } from '../../../core/services/maintenance/maintenance.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';

interface SettingsByCategory {
  [category: string]: AppSetting[];
}

@Component({
  selector: 'app-platform-settings',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './platform-settings.component.html',
  styleUrls: ['./platform-settings.component.scss']
})
export class PlatformSettingsComponent implements OnInit {
  settings: AppSetting[] = [];
  settingsByCategory: SettingsByCategory = {};
  categories: string[] = [];
  selectedCategory: string = '';
  loading = false;
  editingSettings: { [key: string]: boolean } = {};
  tempValues: { [key: string]: any } = {};

  showNewSettingModal = false;
  newSetting: Partial<AppSetting> = {
    key: '',
    value: '',
    value_type: 'string',
    category: '',
    description: '',
    is_public: false
  };

  // Modal de maintenance
  showMaintenanceModal = false;
  maintenanceData = {
    enabled: false,
    message: 'L\'application est actuellement en maintenance. Veuillez réessayer dans quelques instants.',
    end_time: ''
  };

  // États de chargement
  savingMaintenance = false;
  creatingSetting = false;

  constructor(
    private settingsService: SettingsService,
    private maintenanceService: MaintenanceService,
    private toastService: ToastService,
    private confirmationService: ConfirmationModalService
  ) {}

  ngOnInit(): void {
    this.loadSettings();
    this.loadMaintenanceStatus();
  }

  loadSettings(): void {
    this.loading = true;
    this.settingsService.getAllSettings().subscribe({
      next: (settings) => {
        this.settings = settings;
        this.organizeByCategory();
        this.loading = false;
      },
      error: (err) => {
        console.error('Erreur chargement paramètres:', err);
        this.loading = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger les paramètres de la plateforme'
        );
      }
    });
  }

  loadMaintenanceStatus(): void {
    this.maintenanceService.getMaintenanceStatus().subscribe({
      next: (status) => {
        this.maintenanceData.enabled = status.enabled;
        this.maintenanceData.message = status.message || 'L\'application est actuellement en maintenance. Veuillez réessayer dans quelques instants.';
        this.maintenanceData.end_time = status.end_time || '';
      },
      error: (err) => {
        console.error('Erreur chargement statut maintenance:', err);
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger le statut de maintenance'
        );
      }
    });
  }

  organizeByCategory(): void {
    this.settingsByCategory = {};
    this.categories = [];

    this.settings.forEach(setting => {
      if (!this.settingsByCategory[setting.category]) {
        this.settingsByCategory[setting.category] = [];
        this.categories.push(setting.category);
      }
      this.settingsByCategory[setting.category].push(setting);
    });

    // Trier les catégories
    this.categories.sort();

    if (this.categories.length > 0 && !this.selectedCategory) {
      this.selectedCategory = this.categories[0];
    }
  }

  selectCategory(category: string): void {
    this.selectedCategory = category;
  }

  startEdit(setting: AppSetting): void {
    this.editingSettings[setting.key] = true;
    this.tempValues[setting.key] = this.parseValue(setting);
  }

  cancelEdit(setting: AppSetting): void {
    this.editingSettings[setting.key] = false;
    delete this.tempValues[setting.key];
  }

  async saveEdit(setting: AppSetting): Promise<void> {
    const newValue = this.tempValues[setting.key];
    
    // Validation pour JSON
    if (setting.value_type === 'json') {
      try {
        JSON.parse(newValue);
      } catch (e) {
        this.toastService.showError(
          'JSON invalide',
          'Le format JSON n\'est pas valide. Veuillez corriger la syntaxe.'
        );
        return;
      }
    }

    this.settingsService.updateSetting(setting.key, newValue).subscribe({
      next: () => {
        this.editingSettings[setting.key] = false;
        delete this.tempValues[setting.key];
        this.loadSettings();
        this.toastService.showSuccess(
          'Paramètre mis à jour',
          `Le paramètre "${this.getSettingLabel(setting.key)}" a été mis à jour`
        );
      },
      error: (err) => {
        console.error('Erreur mise à jour paramètre:', err);
        this.toastService.showError(
          'Erreur de mise à jour',
          err.error?.error || 'Impossible de mettre à jour le paramètre'
        );
      }
    });
  }

  parseValue(setting: AppSetting): any {
    switch (setting.value_type) {
      case 'number':
        return parseFloat(setting.value);
      case 'boolean':
        return setting.value === 'true';
      case 'json':
        try {
          return JSON.parse(setting.value);
        } catch {
          return setting.value;
        }
      default:
        return setting.value;
    }
  }

  getDisplayValue(setting: AppSetting): string {
    const value = this.parseValue(setting);
    
    if (setting.value_type === 'json') {
      return JSON.stringify(value, null, 2);
    }
    return value.toString();
  }

  openNewSettingModal(): void {
    this.newSetting = {
      key: '',
      value: '',
      value_type: 'string',
      category: this.selectedCategory || 'general',
      description: '',
      is_public: false
    };
    this.showNewSettingModal = true;
  }

  closeNewSettingModal(): void {
    this.showNewSettingModal = false;
  }

  async createSetting(): Promise<void> {
    if (!this.newSetting.key || !this.newSetting.category) {
      this.toastService.showWarning(
        'Formulaire incomplet',
        'Veuillez remplir au moins la clé et la catégorie'
      );
      return;
    }

    // Validation pour JSON
    if (this.newSetting.value_type === 'json') {
      try {
        JSON.parse(this.newSetting.value as string);
      } catch (e) {
        this.toastService.showError(
          'JSON invalide',
          'Le format JSON n\'est pas valide'
        );
        return;
      }
    }

    this.creatingSetting = true;

    this.settingsService.createSetting(this.newSetting).subscribe({
      next: () => {
        this.loadSettings();
        this.closeNewSettingModal();
        this.creatingSetting = false;
        this.toastService.showSuccess(
          'Paramètre créé',
          `Le paramètre "${this.newSetting.key}" a été créé avec succès`
        );
      },
      error: (err) => {
        console.error('Erreur création paramètre:', err);
        this.creatingSetting = false;
        this.toastService.showError(
          'Erreur de création',
          err.error?.error || 'Impossible de créer le paramètre'
        );
      }
    });
  }

  async deleteSetting(key: string): Promise<void> {
    const setting = this.settings.find(s => s.key === key);
    const settingLabel = setting ? this.getSettingLabel(key) : key;

    const confirmed = await this.confirmationService.confirm(
      'Supprimer le paramètre',
      `Êtes-vous sûr de vouloir supprimer le paramètre "${settingLabel}" ?\n\nCette action est irréversible et peut affecter le fonctionnement de l'application.`,
      {
        confirmText: 'Oui, supprimer',
        cancelText: 'Annuler',
        type: 'danger'
      }
    );

    if (!confirmed) return;

    this.settingsService.deleteSetting(key).subscribe({
      next: () => {
        this.loadSettings();
        this.toastService.showSuccess(
          'Paramètre supprimé',
          `Le paramètre "${settingLabel}" a été supprimé`
        );
      },
      error: (err) => {
        console.error('Erreur suppression paramètre:', err);
        this.toastService.showError(
          'Erreur de suppression',
          err.error?.error || 'Impossible de supprimer le paramètre'
        );
      }
    });
  }

  async toggleBoolean(setting: AppSetting): Promise<void> {
    const newValue = !this.parseValue(setting);
    
    this.settingsService.updateSetting(setting.key, newValue).subscribe({
      next: () => {
        this.loadSettings();
        this.toastService.showSuccess(
          'Paramètre mis à jour',
          `${this.getSettingLabel(setting.key)}: ${newValue ? 'Activé' : 'Désactivé'}`
        );
      },
      error: (err) => {
        console.error('Erreur mise à jour paramètre:', err);
        this.toastService.showError(
          'Erreur de mise à jour',
          'Impossible de mettre à jour le paramètre'
        );
        this.loadSettings();
      }
    });
  }

  getCategoryLabel(category: string): string {
    const labels: { [key: string]: string } = {
      'general': 'Général',
      'commissions': 'Commissions',
      'orders': 'Commandes',
      'reservations': 'Réservations',
      'payments': 'Paiements',
      'contact': 'Contact',
      'features': 'Fonctionnalités',
      'security': 'Sécurité',
      'notifications': 'Notifications',
      'uploads': 'Fichiers',
      'performance': 'Performance'
    };
    return labels[category] || category.charAt(0).toUpperCase() + category.slice(1);
  }

  getTypeLabel(type: string): string {
    const labels: { [key: string]: string } = {
      'string': 'Texte',
      'number': 'Nombre',
      'boolean': 'Booléen',
      'json': 'JSON'
    };
    return labels[type] || type;
  }

  getSettingLabel(key: string): string {
    const labels: { [key: string]: string } = {
      // Général
      'app_name': 'Nom de l\'application',
      'app_tagline': 'Slogan',
      'maintenance_mode': 'Mode maintenance',
      'maintenance_message': 'Message de maintenance',
      'maintenance_end_time': 'Heure de fin de maintenance',
      'allow_new_registrations': 'Autoriser les nouvelles inscriptions',
      
      // Commissions
      'default_commission_rate': 'Commission par défaut',
      'min_commission_amount': 'Commission minimale',
      
      // Commandes
      'min_order_amount': 'Montant minimum de commande',
      'max_order_amount': 'Montant maximum de commande',
      'order_cancellation_time': 'Délai d\'annulation',
      
      // Réservations
      'max_reservation_people': 'Nombre maximum de personnes',
      'reservation_advance_days': 'Délai de réservation à l\'avance',
      
      // Paiements
      'payment_methods': 'Méthodes de paiement',
      'currency': 'Devise',
      
      // Contact
      'support_email': 'Email de support',
      'contact_phone': 'Téléphone de contact',
      
      // Fonctionnalités
      'enable_reviews': 'Activer les avis',
      'enable_loyalty_program': 'Programme de fidélité',
      'enable_referral_program': 'Programme de parrainage',
      
      // Sécurité
      'max_login_attempts': 'Tentatives de connexion max',
      'session_timeout': 'Durée de session',
      
      // Notifications
      'enable_email_notifications': 'Notifications par email',
      'enable_sms_notifications': 'Notifications par SMS',
      
      // Uploads
      'max_file_size': 'Taille maximale des fichiers',
      'allowed_file_types': 'Types de fichiers autorisés',
      
      // Performance
      'cache_enabled': 'Activer le cache',
      'cache_duration': 'Durée du cache'
    };
    
    if (labels[key]) {
      return labels[key];
    }
    
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  isMaintenanceEnabled(): boolean {
    const maintenanceSetting = this.settings.find(s => s.key === 'maintenance_mode');
    return maintenanceSetting ? maintenanceSetting.value === 'true' : false;
  }

  openMaintenanceModal(): void {
    this.loadMaintenanceStatus();
    this.showMaintenanceModal = true;
  }

  closeMaintenanceModal(): void {
    this.showMaintenanceModal = false;
  }

  async toggleMaintenance(): Promise<void> {
    const action = this.maintenanceData.enabled ? 'activer' : 'désactiver';
    
    const confirmed = await this.confirmationService.confirm(
      `${action.charAt(0).toUpperCase() + action.slice(1)} la maintenance`,
      this.maintenanceData.enabled 
        ? `Êtes-vous sûr de vouloir activer le mode maintenance ?\n\nSeuls les super-admins pourront accéder à l'application.\n\nMessage: "${this.maintenanceData.message}"`
        : `Êtes-vous sûr de vouloir désactiver le mode maintenance ?\n\nTous les utilisateurs pourront à nouveau accéder à l'application.`,
      {
        confirmText: this.maintenanceData.enabled ? 'Oui, activer' : 'Oui, désactiver',
        cancelText: 'Annuler',
        type: this.maintenanceData.enabled ? 'warning' : 'success'
      }
    );

    if (!confirmed) return;

    this.savingMaintenance = true;

    this.maintenanceService.toggleMaintenance(
      this.maintenanceData.enabled,
      this.maintenanceData.message,
      this.maintenanceData.end_time
    ).subscribe({
      next: () => {
        this.savingMaintenance = false;
        this.toastService.showSuccess(
          'Mode maintenance mis à jour',
          `Le mode maintenance a été ${this.maintenanceData.enabled ? 'activé' : 'désactivé'} avec succès`
        );
        this.closeMaintenanceModal();
        this.loadSettings();
        this.loadMaintenanceStatus();
      },
      error: (err) => {
        console.error('Erreur toggle maintenance:', err);
        this.savingMaintenance = false;
        this.toastService.showError(
          'Erreur de mise à jour',
          err.error?.error || 'Impossible de modifier le mode maintenance'
        );
      }
    });
  }
}