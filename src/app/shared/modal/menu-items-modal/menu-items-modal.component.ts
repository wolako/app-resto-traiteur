// src/app/shared/modal/menu-items-modal/menu-items-modal.component.ts
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

  // ✅ Référence sur la zone scrollable et le formulaire pour gérer le scroll mobile
  @ViewChild('bodyRef')   bodyRef!:   ElementRef<HTMLElement>;
  @ViewChild('formRef')   formRef!:   ElementRef<HTMLElement>;

  items: MenuItem[] = [];
  loading     = false;
  saving      = false;
  deletingId: number | null = null;

  editingItem: MenuItem | null = null;
  showForm = false;

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
    });
  }

  // ✅ Scroll utilitaire — ramène le body de la liste au début
  //    et fait défiler le formulaire dans la vue sur mobile
  private scrollAfterFormOpen(): void {
    // Court délai pour laisser Angular rendre le DOM
    setTimeout(() => {
      // 1. Remettre la liste en haut pour qu'elle reste visible
      if (this.bodyRef?.nativeElement) {
        this.bodyRef.nativeElement.scrollTop = 0;
      }
      // 2. Sur mobile, scroller le formulaire dans la vue
      if (this.formRef?.nativeElement) {
        this.formRef.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  /** Ouvre le formulaire vide pour un nouvel article */
  openNewForm(): void {
    this.editingItem = null;
    this.itemForm.reset({ name: '', description: '', price: null, category: '', is_available: true });
    this.showForm = true;
    this.scrollAfterFormOpen();
  }

  /** Ouvre le formulaire pré-rempli pour modifier un article */
  openEditForm(item: MenuItem): void {
    // Clic sur le même item en cours d'édition → fermer
    if (this.editingItem?.id === item.id) {
      this.closeForm();
      return;
    }
    this.editingItem = item;
    this.itemForm.patchValue({
      name:         item.name,
      description:  item.description  ?? '',
      price:        item.price,
      category:     item.category     ?? '',
      is_available: item.is_available !== false,
    });
    this.showForm = true;
    this.scrollAfterFormOpen();
  }

  closeForm(): void {
    this.showForm    = false;
    this.editingItem = null;
    this.itemForm.reset({ name: '', description: '', price: null, category: '', is_available: true });
  }

  loadItems(): void {
    if (!this.menu?.id) return;
    this.loading = true;
    this.menuService.getMenuItems(this.menu.id).subscribe({
      next: (res: any) => { this.items = res.data ?? res ?? []; this.loading = false; },
      error: ()        => { this.items = this.menu?.items ?? [];  this.loading = false; },
    });
  }

  saveItem(): void {
    this.itemForm.markAllAsTouched();
    if (this.itemForm.invalid || !this.menu?.id) return;

    this.saving  = true;
    const data   = { ...this.itemForm.value };

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
          this.toastService.showSuccess('Article mis à jour', `"${updated.name}" a été modifié`);
        },
        error: (err: any) => {
          this.saving = false;
          this.toastService.showError('Erreur', err.error?.message ?? 'Impossible de mettre à jour');
        },
      });
    } else {
      this.menuService.createMenuItem(this.menu.id, data).subscribe({
        next: (res: any) => {
          const created: MenuItem = res.data ?? res;
          this.items  = [...this.items, created];
          this.saving = false;
          this.closeForm();
          this.toastService.showSuccess('Article ajouté', `"${created.name}" a été ajouté`);
        },
        error: (err: any) => {
          this.saving = false;
          if (err.status === 403) {
            this.toastService.showError('Limite atteinte', 'Limite d\'articles de votre plan atteinte');
          } else {
            this.toastService.showError('Erreur', err.error?.message ?? 'Impossible d\'ajouter l\'article');
          }
        },
      });
    }
  }

  async deleteItem(item: MenuItem): Promise<void> {
    const ok = await this.confirmService.confirm(
      'Supprimer cet article ?',
      `Voulez-vous supprimer "${item.name}" ? Cette action est irréversible.`,
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
      },
    });
  }

  close(): void { this.closed.emit(); }

  formatPrice(n: any): string {
    return Math.round(Number(n ?? 0)).toLocaleString('fr-FR');
  }

  getCategoryItems(cat: string): MenuItem[] {
    return this.items.filter(i => (i.category || 'Autre') === cat);
  }

  get usedCategories(): string[] {
    const cats = [...new Set(this.items.map(i => i.category || 'Autre'))];
    return this.CATEGORIES
      .filter(c => cats.includes(c))
      .concat(cats.filter(c => !this.CATEGORIES.includes(c)));
  }

  get isEditing(): boolean { return !!this.editingItem; }

  trackById(_: number, item: MenuItem) { return item.id; }
}