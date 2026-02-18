// src/app/core/services/confirmation/confirmation-modal.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmationModal {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'info' | 'warning' | 'danger' | 'success';
  show: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class ConfirmationModalService {
  private modalSubject = new BehaviorSubject<ConfirmationModal>({
    title: '',
    message: '',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
    type: 'info',
    show: false
  });

  modal$ = this.modalSubject.asObservable();

  confirm(
    title: string, 
    message: string, 
    options?: {
      confirmText?: string;
      cancelText?: string;
      type?: 'info' | 'warning' | 'danger' | 'success';
    }
  ): Promise<boolean> {
    return new Promise((resolve) => {
      this.modalSubject.next({
        title,
        message,
        confirmText: options?.confirmText || 'Confirmer',
        cancelText: options?.cancelText || 'Annuler',
        type: options?.type || 'info',
        show: true,
        onConfirm: () => {
          this.hide();
          resolve(true);
        },
        onCancel: () => {
          this.hide();
          resolve(false);
        }
      });
    });
  }

  hide(): void {
    const current = this.modalSubject.value;
    this.modalSubject.next({ ...current, show: false });
  }
}