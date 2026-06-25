import {
  Component, Input, Output, EventEmitter,
  OnChanges, SimpleChanges, ViewChild, ElementRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Menu, MenuItem } from '../../../core/models/menu.model';
import { MenuService } from '../../../core/services/menus/menu.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';

@Component({
  selector:    'app-menu-items-modal',
  standalone:  true,
  imports:     [CommonModule, ReactiveFormsModule],
  templateUrl: './menu-items-modal.component.html',
  styleUrls:   ['./menu-items-modal.component.scss']
})
export class MenuItemsModalComponent implements OnChanges {

  @Input() menu: Menu | null = null;
  @Input() show = false;
  @Output() closed = new EventEmitter<void>();

  @ViewChild('bodyRef')  bodyRef!:  ElementRef<HTMLElement>;
  @ViewChild('formRef')  formRef!:  ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  items: MenuItem[] = [];
  loading     = false;
  saving      = false;
  deletingId: number | null = null;

  editingItem: MenuItem | null = null;
  showForm = false;

  // ✅ Image
  imageMode: 'url' | 'upload' = 'url';
  imagePreview: string | null = null;
  imageUploading = false;
  selectedFile: File | null = null;

  itemForm!: FormGroup;

  readonly CATEGORIES = [
    'Entrée', 'Plat principal', 'Dessert', 'Boisson',
    'Accompagnement', 'Menu enfant', 'Spécialité', 'Autre'
  ];

  constructor(
    private fb:             FormBuilder,
    private menuService:    MenuService,
    private toastService:   ToastService,
    private confirmService: ConfirmationModalService
  ) {
    this.initForm();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['show'] && this.show && this.menu?.id) {
      this.loadItems();
      this.closeForm();
    }
    if (changes['show'] && !this.show) {
      this.items = [];
      this.closeForm();
    }
  }

  private initForm(): void {
    this.itemForm = this.fb.group({
      name:         ['', [Validators.required, Validators.minLength(2)]],
      description:  [''],
      price:        [null, [Validators.required, Validators.min(0)]],
      category:     [''],
      is_available: [true],
      image_url:    [''],  // ✅ AJOUTÉ
    });
  }

  private scrollAfterFormOpen(): void {
    setTimeout(() => {
      if (this.bodyRef?.nativeElement) this.bodyRef.nativeElement.scrollTop = 0;
      if (this.formRef?.nativeElement) {
        this.formRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  openNewForm(): void {
    this.editingItem  = null;
    this.imagePreview = null;
    this.selectedFile = null;
    this.imageMode    = 'url';
    this.itemForm.reset({
      name: '', description: '', price: null,
      category: '', is_available: true, image_url: ''
    });
    this.showForm = true;
    this.scrollAfterFormOpen();
  }

  openEditForm(item: MenuItem): void {
    if (this.editingItem?.id === item.id) { this.closeForm(); return; }
    this.editingItem  = item;
    this.imagePreview = item.image_url || null;
    this.selectedFile = null;
    this.imageMode    = item.image_url ? 'url' : 'url';
    this.itemForm.patchValue({
      name:         item.name,
      description:  item.description  ?? '',
      price:        item.price,
      category:     item.category     ?? '',
      is_available: item.is_available !== false,
      image_url:    item.image_url    ?? '',
    });
    this.showForm = true;
    this.scrollAfterFormOpen();
  }

  closeForm(): void {
    this.showForm     = false;
    this.editingItem  = null;
    this.imagePreview = null;
    this.selectedFile = null;
    this.itemForm.reset({
      name: '', description: '', price: null,
      category: '', is_available: true, image_url: ''
    });
  }

  loadItems(): void {
    if (!this.menu?.id) return;
    this.loading = true;
    this.menuService.getMenuItems(this.menu.id).subscribe({
      next: (res: any) => { this.items = res.data ?? res ?? []; this.loading = false; },
      error: ()        => { this.items = this.menu?.items ?? [];  this.loading = false; },
    });
  }

  // ── Image ───────────────────────────────────────────────────

  setImageMode(mode: 'url' | 'upload'): void {
    this.imageMode    = mode;
    this.imagePreview = null;
    this.selectedFile = null;
    this.itemForm.patchValue({ image_url: '' });
  }

  onUrlChange(event: Event): void {
    const url = (event.target as HTMLInputElement).value.trim();
    this.imagePreview = url || null;
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file  = input.files?.[0];
    if (!file) return;

    // Vérification taille et type côté client
    if (file.size > 5 * 1024 * 1024) {
      this.toastService.showError('Fichier trop lourd', 'Taille max : 5 Mo');
      return;
    }
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowed.includes(file.type)) {
      this.toastService.showError('Type invalide', 'JPEG, PNG, WebP ou GIF uniquement');
      return;
    }

    this.selectedFile = file;

    // Aperçu local immédiat
    const reader = new FileReader();
    reader.onload = (e) => { this.imagePreview = e.target?.result as string; };
    reader.readAsDataURL(file);
  }

  clearImage(): void {
    this.imagePreview = null;
    this.selectedFile = null;
    this.itemForm.patchValue({ image_url: '' });
    if (this.fileInput?.nativeElement) this.fileInput.nativeElement.value = '';
  }

  // ── Upload vers le serveur puis sauvegarder l'article ──────
  private uploadThenSave(): void {
    if (!this.selectedFile) { this.doSave(null); return; }

    this.imageUploading = true;
    this.menuService.uploadMenuItemImage(this.selectedFile).subscribe({
      next: (res: any) => {
        this.imageUploading = false;
        this.doSave(res.data?.image_url || null);
      },
      error: () => {
        this.imageUploading = false;
        this.toastService.showError('Upload échoué', 'L\'image n\'a pas pu être uploadée');
        // Continuer sans image plutôt que bloquer
        this.doSave(null);
      }
    });
  }

  saveItem(): void {
    this.itemForm.markAllAsTouched();
    if (this.itemForm.invalid || !this.menu?.id) return;

    this.saving = true;

    if (this.imageMode === 'upload' && this.selectedFile) {
      this.uploadThenSave();
    } else {
      this.doSave(this.itemForm.value.image_url || null);
    }
  }

  private doSave(imageUrl: string | null): void {
    const data = {
      ...this.itemForm.value,
      image_url: imageUrl
    };
    // Retirer image_url si null pour ne pas écraser une image existante
    if (!imageUrl && this.editingItem?.image_url) {
      data.image_url = this.editingItem.image_url;
    }

    if (this.editingItem?.id) {
      this.menuService.updateMenuItem(this.editingItem.id, data).subscribe({
        next: (res: any) => {
          const updated: MenuItem = res.data ?? res;
          const idx = this.items.findIndex(i => i.id === this.editingItem!.id);
          if (idx !== -1) {
            this.items = [...this.items.slice(0, idx), updated, ...this.items.slice(idx + 1)];
          }
          this.saving = false;
          this.closeForm();
          this.toastService.showSuccess('Article mis à jour', `"${updated.name}" modifié`);
        },
        error: (err: any) => {
          this.saving = false;
          this.toastService.showError('Erreur', err.error?.message ?? 'Impossible de mettre à jour');
        }
      });
    } else {
      this.menuService.createMenuItem(this.menu!.id!, data).subscribe({
        next: (res: any) => {
          const created: MenuItem = res.data ?? res;
          this.items  = [...this.items, created];
          this.saving = false;
          this.closeForm();
          this.toastService.showSuccess('Article ajouté', `"${created.name}" ajouté`);
        },
        error: (err: any) => {
          this.saving = false;
          if (err.status === 403) {
            this.toastService.showError('Limite atteinte', 'Limite d\'articles de votre plan atteinte');
          } else {
            this.toastService.showError('Erreur', err.error?.message ?? 'Impossible d\'ajouter l\'article');
          }
        }
      });
    }
  }

  async deleteItem(item: MenuItem): Promise<void> {
    const ok = await this.confirmService.confirm(
      'Supprimer cet article ?',
      `Voulez-vous supprimer "${item.name}" ? Action irréversible.`,
      { confirmText: 'Supprimer', cancelText: 'Annuler', type: 'danger' }
    );
    if (!ok || !item.id) return;
    this.deletingId = item.id;
    this.menuService.deleteMenuItem(item.id).subscribe({
      next: () => {
        this.items      = this.items.filter(i => i.id !== item.id);
        this.deletingId = null;
        if (this.editingItem?.id === item.id) this.closeForm();
        this.toastService.showSuccess('Supprimé', `"${item.name}" supprimé`);
      },
      error: (err: any) => {
        this.deletingId = null;
        this.toastService.showError('Erreur', err.error?.message ?? 'Impossible de supprimer');
      }
    });
  }

  close():                void { this.closed.emit(); }
  formatPrice(n: any):    string  { return Math.round(Number(n ?? 0)).toLocaleString('fr-FR'); }
  getCategoryItems(cat: string): MenuItem[] { return this.items.filter(i => (i.category || 'Autre') === cat); }
  get isEditing():        boolean { return !!this.editingItem; }
  get usedCategories():   string[] {
    const cats = [...new Set(this.items.map(i => i.category || 'Autre'))];
    return this.CATEGORIES.filter(c => cats.includes(c))
      .concat(cats.filter(c => !this.CATEGORIES.includes(c)));
  }
  trackById(_: number, item: MenuItem) { return item.id; }
}