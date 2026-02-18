import { CommonModule } from '@angular/common';
import { Component, OnInit } from '@angular/core';
import { Toast, ToastService } from '../../../core/services/toast/toast.service';

@Component({
  selector: 'app-toast-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './toast-modal.component.html',
  styleUrl: './toast-modal.component.scss'
})
export class ToastModalComponent implements OnInit {
  toast: Toast = {
    type: 'info',
    title: '',
    message: '',
    show: false
  };

  constructor(private toastService: ToastService) {}

  ngOnInit(): void {
    this.toastService.toast$.subscribe(toast => {
      this.toast = toast;
    });
  }

  getIcon(): string {
    const icons = {
      success: 'bi bi-check-circle-fill',
      error: 'bi bi-x-circle-fill',
      warning: 'bi bi-exclamation-triangle-fill',
      info: 'bi bi-info-circle-fill'
    };
    return icons[this.toast.type];
  }

  close(): void {
    this.toastService.hide();
  }
}
