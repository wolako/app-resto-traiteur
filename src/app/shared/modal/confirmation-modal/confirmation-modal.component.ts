// src/app/shared/modal/confirmation-modal/confirmation-modal.component.ts
import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { ConfirmationModal, ConfirmationModalService } from '../../../core/services/confirmation-modal/confirmation-modal.service';


@Component({
  selector: 'app-confirmation-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './confirmation-modal.component.html',
  styleUrl: './confirmation-modal.component.scss'
})
export class ConfirmationModalComponent implements OnInit {
  modal: ConfirmationModal = {
    title: '',
    message: '',
    confirmText: 'Confirmer',
    cancelText: 'Annuler',
    type: 'info',
    show: false
  };

  constructor(private confirmationService: ConfirmationModalService) {}

  ngOnInit(): void {
    this.confirmationService.modal$.subscribe(modal => {
      this.modal = modal;
    });
  }

  getIcon(): string {
    const icons = {
      info: 'bi bi-info-circle-fill',
      warning: 'bi bi-exclamation-triangle-fill',
      danger: 'bi bi-x-circle-fill',
      success: 'bi bi-check-circle-fill'
    };
    return icons[this.modal.type || 'info'];
  }

  confirm(): void {
    if (this.modal.onConfirm) {
      this.modal.onConfirm();
    }
  }

  cancel(): void {
    if (this.modal.onCancel) {
      this.modal.onCancel();
    }
  }
}