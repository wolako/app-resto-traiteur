// src/app/core/services/toast/toast.service.ts
import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface Toast {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  show: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private toastSubject = new BehaviorSubject<Toast>({
    type: 'info',
    title: '',
    message: '',
    show: false
  });

  toast$ = this.toastSubject.asObservable();

  /**
   * Afficher un toast de succès
   */
  showSuccess(title: string, message: string): void {
    this.show('success', title, message);
  }

  /**
   * Afficher un toast d'erreur
   */
  showError(title: string, message: string): void {
    this.show('error', title, message);
  }

  /**
   * Afficher un toast d'avertissement
   */
  showWarning(title: string, message: string): void {
    this.show('warning', title, message);
  }

  /**
   * Afficher un toast d'information
   */
  showInfo(title: string, message: string): void {
    this.show('info', title, message);
  }

  /**
   * Afficher un toast
   */
  private show(type: 'success' | 'error' | 'warning' | 'info', title: string, message: string): void {
    this.toastSubject.next({
      type,
      title,
      message,
      show: true
    });

    // Auto-fermer après un délai
    const timeout = (type === 'error' || type === 'warning') ? 7000 : 5000;
    setTimeout(() => this.hide(), timeout);
  }

  /**
   * Masquer le toast
   */
  hide(): void {
    const current = this.toastSubject.value;
    this.toastSubject.next({ ...current, show: false });
  }
}