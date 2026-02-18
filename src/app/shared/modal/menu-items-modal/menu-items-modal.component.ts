// menu-items-modal.component.ts - VERSION FINALE AVEC TOASTSERVICE
import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Menu, MenuItem } from '../../../core/models/menu.model';
import { BusinessService } from '../../../core/services/business/business.service';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from '../../../core/services/auth/auth.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { environment } from '../../../../environments/environment';
import { ToastModalComponent } from '../toast-modal/toast-modal.component';
import { SubscriptionLimitsService } from '../../../core/services/subscriptionLimits/subscription-limits.service';

@Component({
  selector: 'app-menu-items-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './menu-items-modal.component.html',
  styleUrl: './menu-items-modal.component.scss'
})
export class MenuItemsModalComponent implements OnInit {
  @Input() menu: Menu | null = null;
  @Input() show = false;
  @Output() closed = new EventEmitter<void>();

  items: MenuItem[] = [];
  itemForm!: FormGroup;
  showForm = false;
  loading = false;
  editingItem: MenuItem | null = null;

  // Gestion de l'upload d'images
  selectedFile: File | null = null;
  imagePreview: string | null = null;
  uploadingImage = false;
  uploadMode: 'url' | 'file' = 'url';

  // État de soumission pour afficher les erreurs
  formSubmitted = false;

  constructor(
    private fb: FormBuilder,
    private businessService: BusinessService,
    private http: HttpClient,
    private authService: AuthService,
    private toastService: ToastService,
    private limitsService: SubscriptionLimitsService
  ) {}

  ngOnInit(): void {
    this.initializeForm();
    if (this.menu) {
      this.loadItems();
    }
  }

  private initializeForm(): void {
    this.itemForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      description: [''],
      price: ['', [Validators.required, Validators.min(0)]],
      category: [''],
      is_available: [true],
      image_url: ['']
    });
  }

  loadItems(): void {
    if (!this.menu?.id) return;

    this.businessService.getMenuItems(this.menu.id).subscribe({
      next: (response: any) => {
        this.items = response.data || response || [];
      },
      error: (error) => {
        console.error('Error loading items:', error);
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger les items du menu'
        );
        this.items = [];
      }
    });
  }

  showItemForm(): void {
    this.showForm = true;
    this.editingItem = null;
    this.itemForm.reset({ is_available: true });
    this.resetImageUpload();
    this.formSubmitted = false;
  }

  showAddItemForm(): void {
    this.limitsService.canAddMenuItem().subscribe(check => {
      if (!check.canProceed) {
        alert(check.error);
        return;
      }
      // ✅ OK, continuer
      this.showForm = true;
    });
  }

  cancelForm(): void {
    this.showForm = false;
    this.editingItem = null;
    this.itemForm.reset();
    this.resetImageUpload();
    this.formSubmitted = false;
  }

  editItem(item: MenuItem): void {
    this.editingItem = item;
    this.showForm = true;
    this.itemForm.patchValue(item);
    this.formSubmitted = false;
    
    if (item.image_url) {
      this.imagePreview = item.image_url;
      this.uploadMode = 'url';
    }
  }

  toggleUploadMode(mode: 'url' | 'file'): void {
    this.uploadMode = mode;
    if (mode === 'file') {
      this.itemForm.get('image_url')?.setValue('');
    } else {
      this.resetImageUpload();
    }
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      if (!file.type.startsWith('image/')) {
        this.toastService.showWarning(
          'Type de fichier invalide',
          'Veuillez sélectionner une image (JPEG, PNG, WebP ou GIF)'
        );
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        this.toastService.showWarning(
          'Fichier trop volumineux',
          'L\'image ne doit pas dépasser 5MB'
        );
        return;
      }

      this.selectedFile = file;
      
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.imagePreview = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  }

  async uploadImage(): Promise<string | null> {
    if (!this.selectedFile) return null;

    this.uploadingImage = true;

    const formData = new FormData();
    formData.append('image', this.selectedFile);

    const token = this.authService.getToken();
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });

    try {
      const response: any = await this.http.post(
        `${environment.apiUrl}/upload/menu-item-image`,
        formData,
        { headers }
      ).toPromise();

      this.uploadingImage = false;
      return response.data.url;
    } catch (error) {
      console.error('Error uploading image:', error);
      this.uploadingImage = false;
      this.toastService.showError(
        'Erreur d\'upload',
        'Impossible de télécharger l\'image. Veuillez réessayer.'
      );
      return null;
    }
  }

  resetImageUpload(): void {
    this.selectedFile = null;
    this.imagePreview = null;
    this.uploadingImage = false;
    this.uploadMode = 'url';
  }

  private validateForm(): boolean {
    this.formSubmitted = true;

    Object.keys(this.itemForm.controls).forEach(key => {
      this.itemForm.get(key)?.markAsTouched();
    });

    if (this.itemForm.invalid) {
      const errors: string[] = [];

      if (this.itemForm.get('name')?.hasError('required')) {
        errors.push('Le nom de l\'item est requis');
      } else if (this.itemForm.get('name')?.hasError('minlength')) {
        errors.push('Le nom doit contenir au moins 3 caractères');
      }

      if (this.itemForm.get('price')?.hasError('required')) {
        errors.push('Le prix est requis');
      } else if (this.itemForm.get('price')?.hasError('min')) {
        errors.push('Le prix doit être supérieur ou égal à 0');
      }

      this.toastService.showError(
        'Formulaire incomplet',
        errors.join('. ')
      );

      return false;
    }

    return true;
  }

  async saveItem(): Promise<void> {
    if (!this.validateForm() || !this.menu?.id) {
      return;
    }

    this.loading = true;
    let itemData = { ...this.itemForm.value };

    if (this.uploadMode === 'file' && this.selectedFile) {
      const uploadedUrl = await this.uploadImage();
      if (uploadedUrl) {
        itemData.image_url = uploadedUrl;
      } else {
        this.loading = false;
        return;
      }
    }

    if (this.editingItem?.id) {
      this.businessService.updateMenuItem(this.editingItem.id, itemData).subscribe({
        next: () => {
          this.loading = false;
          this.cancelForm();
          this.loadItems();
          this.toastService.showSuccess(
            'Item mis à jour',
            `L'item "${itemData.name}" a été mis à jour avec succès`
          );
        },
        error: (error) => {
          console.error('Error updating item:', error);
          this.loading = false;
          this.toastService.showError(
            'Erreur de mise à jour',
            'Impossible de mettre à jour l\'item. Veuillez réessayer.'
          );
        }
      });
    } else {
      this.businessService.createMenuItem(this.menu.id, itemData).subscribe({
        next: () => {
          this.loading = false;
          this.cancelForm();
          this.loadItems();
          this.toastService.showSuccess(
            'Item créé',
            `L'item "${itemData.name}" a été créé avec succès`
          );
        },
        error: (error) => {
          console.error('Error creating item:', error);
          this.loading = false;
          this.toastService.showError(
            'Erreur de création',
            'Impossible de créer l\'item. Veuillez réessayer.'
          );
        }
      });
    }
  }

  confirmDeleteItem(itemId: number): void {
    const item = this.items.find(i => i.id === itemId);
    const itemName = item?.name || 'cet item';

    // Utiliser confirm() natif pour la confirmation (ou créer un ConfirmationModalComponent)
    if (confirm(`Êtes-vous sûr de vouloir supprimer "${itemName}" ? Cette action est irréversible.`)) {
      this.deleteItem(itemId, itemName);
    }
  }

  private deleteItem(itemId: number, itemName: string): void {
    this.businessService.deleteMenuItem(itemId).subscribe({
      next: () => {
        this.loadItems();
        this.toastService.showSuccess(
          'Item supprimé',
          `L'item "${itemName}" a été supprimé avec succès`
        );
      },
      error: (error) => {
        console.error('Error deleting item:', error);
        this.toastService.showError(
          'Erreur de suppression',
          'Impossible de supprimer l\'item. Veuillez réessayer.'
        );
      }
    });
  }

  getCategoryLabel(category: string | undefined): string {
    const labels: { [key: string]: string } = {
      'entree': 'Entrée',
      'plat': 'Plat',
      'dessert': 'Dessert',
      'boisson': 'Boisson',
      'accompagnement': 'Accompagnement'
    };
    return category ? (labels[category] || category) : 'Non catégorisé';
  }

  onImageError(event: any): void {
    event.target.style.display = 'none';
  }

  getFieldError(fieldName: string): string {
    const field = this.itemForm.get(fieldName);
    
    if (!field || !field.touched || !field.invalid) {
      return '';
    }

    if (field.hasError('required')) {
      return 'Ce champ est requis';
    }

    if (field.hasError('minlength')) {
      const minLength = field.getError('minlength').requiredLength;
      return `Minimum ${minLength} caractères requis`;
    }

    if (field.hasError('min')) {
      return 'La valeur doit être supérieure ou égale à 0';
    }

    return '';
  }

  close(): void {
    this.closed.emit();
  }
}