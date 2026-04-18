import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReservationService } from '../../../core/services/reservations/reservation.service';
import { ToastService } from '../../../core/services/toast/toast.service';
import { environment } from '../../../../environments/environment';

@Component({
  selector: 'app-reservation-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './reservation-form.component.html',
  styleUrls: ['./reservation-form.component.scss']
})
export class ReservationFormComponent implements OnInit {
  reservationForm: FormGroup;
  restaurant: any = null;
  availableSlots: string[] = [];
  minDate: string;
  loading = false;
  loadingSlots = false;
  success = false;

  depositRequired = false;
  depositAmount = 0;
  selectedPaymentMethod = '';
  depositFee = 0;

  // ✅ CORRECTION PRINCIPALE : getter calculé à la volée
  // Remplace la variable `totalDeposit = 0` qui pouvait rester désynchronisée
  get totalDeposit(): number {
    return this.depositAmount + this.depositFee;
  }

  isSandbox = environment.paymentMode === 'sandbox';

  paymentMethods = [
    { value: 'flooz',       label: 'Flooz',              icon: '💚' },
    { value: 'Mixx By Yas', label: 'Mixx By Yas',        icon: '📲' },
    { value: 'card',        label: 'Carte bancaire',      icon: '💳' },
    { value: 'cod',         label: 'Payer au restaurant', icon: '💵' }
  ];

  constructor(
    private fb: FormBuilder,
    private reservationService: ReservationService,
    private router: Router,
    private toastService: ToastService,
    private cdr: ChangeDetectorRef  // ✅ Pour forcer la détection de changement si nécessaire
  ) {
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];

    this.reservationForm = this.fb.group({
      client_name:      ['', Validators.required],
      client_phone:     ['', Validators.required],
      client_email:     ['', [Validators.email]],
      reservation_date: ['', Validators.required],
      time_slot:        ['', Validators.required],
      number_of_people: ['', Validators.required],
      special_requests: ['']
    });
  }

  ngOnInit(): void {
    const restaurantData = sessionStorage.getItem('reservation_restaurant');

    if (!restaurantData) {
      this.toastService.showWarning(
        'Aucun restaurant sélectionné',
        'Veuillez d\'abord sélectionner un restaurant'
      );
      this.router.navigate(['/']);
      return;
    }

    this.restaurant      = JSON.parse(restaurantData);
    this.depositRequired = this.restaurant.requires_reservation_deposit || false;
    this.depositAmount = Number(this.restaurant.default_deposit_amount) || 0;
    // ✅ Plus de `this.totalDeposit = ...` — c'est un getter maintenant

    if (this.depositRequired) {
      this.reservationForm.addControl('deposit_payment_method',
        this.fb.control('', Validators.required));

      this.reservationForm.get('deposit_payment_method')?.valueChanges.subscribe(method => {
        if (method) {
          this.selectedPaymentMethod = method;
          this.calculateDepositFees();
        }
      });
    }
  }

  onDateChange(): void {
    const selectedDate = this.reservationForm.get('reservation_date')?.value;
    if (selectedDate && this.restaurant) {
      this.loadAvailableSlots(selectedDate);
    }
  }

  loadAvailableSlots(date: string): void {
    this.loadingSlots = true;
    this.availableSlots = [];
    this.reservationForm.get('time_slot')?.setValue('');

    this.reservationService.getAvailableTimeSlots(this.restaurant.id, date).subscribe({
      next: (slots) => {
        this.availableSlots = slots;
        this.loadingSlots = false;
        if (slots.length === 0) {
          this.toastService.showInfo('Aucun créneau disponible', 'Essayez une autre date.');
        }
      },
      error: (error) => {
        console.error('Error loading slots:', error);
        this.loadingSlots = false;
        this.toastService.showError('Erreur de chargement', 'Impossible de charger les créneaux disponibles');
      }
    });
  }

  selectTimeSlot(slot: string): void {
    this.reservationForm.patchValue({ time_slot: slot });
    this.reservationForm.get('time_slot')?.markAsTouched();
  }

  selectPaymentMethod(method: string): void {
    this.selectedPaymentMethod = method;

    if (this.reservationForm.contains('deposit_payment_method')) {
      this.reservationForm.patchValue({ deposit_payment_method: method });
    }

    this.calculateDepositFees();
    
    // ✅ Forcer Angular à relire le getter immédiatement
    this.cdr.detectChanges();
  }

  calculateDepositFees(): void {
    if (!this.depositRequired || !this.selectedPaymentMethod) {
      this.depositFee = 0;
      return;
    }

    if (this.selectedPaymentMethod === 'cod' || this.selectedPaymentMethod === 'cash') {
      this.depositFee = 0;
      return;
    }

    if (this.selectedPaymentMethod === 'card') {
      this.depositFee = Math.round((this.depositAmount * 0.035) + 150);
    } else {
      // Mixx By Yas, flooz
      this.depositFee = Math.round((this.depositAmount * 0.029) + 100);
    }

    // ✅ totalDeposit est un getter — il se recalcule automatiquement depuis depositFee
  }

  onSubmit(): void {
    if (!this.reservationForm.valid) {
      Object.keys(this.reservationForm.controls).forEach(key => {
        this.reservationForm.get(key)?.markAsTouched();
      });
      this.toastService.showWarning('Formulaire incomplet', 'Veuillez remplir tous les champs obligatoires');
      return;
    }

    this.loading = true;

    const reservationData: any = {
      restaurant_id:    this.restaurant.id,
      client_name:      this.reservationForm.value.client_name,
      client_phone:     this.reservationForm.value.client_phone,
      client_email:     this.reservationForm.value.client_email,
      reservation_date: this.reservationForm.value.reservation_date,
      time_slot:        this.reservationForm.value.time_slot,
      number_of_people: this.reservationForm.value.number_of_people,
      special_requests: this.reservationForm.value.special_requests || ''
    };

    if (this.depositRequired) {
      const paymentMethod = this.reservationForm.value.deposit_payment_method || this.selectedPaymentMethod;
      if (!paymentMethod) {
        this.loading = false;
        this.toastService.showError('Erreur', 'Veuillez sélectionner un mode de paiement');
        return;
      }
      reservationData.deposit_payment_method = paymentMethod;
    }

    this.reservationService.createReservation(reservationData).subscribe({
      next: (response: any) => {
        this.loading = false;

        if (!this.depositRequired) {
          this.success = true;
          sessionStorage.removeItem('reservation_restaurant');
          this.toastService.showSuccess(
            'Réservation confirmée !',
            `Votre table est réservée le ${reservationData.reservation_date} à ${reservationData.time_slot}`
          );
          return;
        }

        if (this.selectedPaymentMethod === 'cod') {
          this.success = true;
          sessionStorage.removeItem('reservation_restaurant');
          this.toastService.showSuccess(
            'Réservation confirmée !',
            `Acompte de ${this.totalDeposit.toLocaleString('fr-FR')} FCFA à payer au restaurant`
          );
          return;
        }

        if (response.sandbox || this.isSandbox) {
          this.success = true;
          sessionStorage.removeItem('reservation_restaurant');
          this.toastService.showSuccess(
            '✅ Paiement accepté (Sandbox) !',
            `Acompte de ${this.totalDeposit.toLocaleString('fr-FR')} FCFA — Réservation validée !`
          );
          return;
        }

        if (response.payment_url) {
          this.toastService.showInfo('Redirection paiement', `Montant acompte : ${this.totalDeposit.toLocaleString('fr-FR')} FCFA`);
          sessionStorage.removeItem('reservation_restaurant');
          window.location.href = response.payment_url;
        }
      },
      error: (error) => {
        this.loading = false;
        if (error.error?.deposit_required) {
          this.toastService.showWarning(
            'Acompte requis',
            `Un acompte de ${error.error.deposit_amount?.toLocaleString('fr-FR')} FCFA est requis`
          );
        } else {
          this.toastService.showError(
            'Erreur de réservation',
            error.error?.message || 'Impossible de créer votre réservation'
          );
        }
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}