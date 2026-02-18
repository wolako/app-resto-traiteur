import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ReservationService } from '../../../core/services/reservations/reservation.service';
import { ToastService } from '../../../core/services/toast/toast.service';

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

  constructor(
    private fb: FormBuilder,
    private reservationService: ReservationService,
    private router: Router,
    private toastService: ToastService
  ) {
    const today = new Date();
    this.minDate = today.toISOString().split('T')[0];
    
    this.reservationForm = this.fb.group({
      client_name: ['', Validators.required],
      client_phone: ['', Validators.required],
      client_email: ['', [Validators.email]],
      reservation_date: ['', Validators.required],
      time_slot: ['', Validators.required],
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
    
    this.restaurant = JSON.parse(restaurantData);
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
    
    console.log('Loading slots for date:', date, 'restaurant:', this.restaurant.id);
    
    this.reservationService.getAvailableTimeSlots(this.restaurant.id, date).subscribe({
      next: (slots) => {
        console.log('Available slots received:', slots);
        this.availableSlots = slots;
        this.loadingSlots = false;
        
        if (slots.length === 0) {
          this.toastService.showInfo(
            'Aucun créneau disponible',
            'Aucun créneau n\'est disponible pour cette date. Essayez une autre date.'
          );
        }
      },
      error: (error) => {
        console.error('Error loading slots:', error);
        this.loadingSlots = false;
        this.toastService.showError(
          'Erreur de chargement',
          'Impossible de charger les créneaux disponibles'
        );
      }
    });
  }

  selectTimeSlot(slot: string): void {
    console.log('Selected slot:', slot);
    this.reservationForm.patchValue({ time_slot: slot });
    this.reservationForm.get('time_slot')?.markAsTouched();
  }

  onTimeSlotChange(): void {
    const selectedSlot = this.reservationForm.get('time_slot')?.value;
    console.log('Time slot changed from select:', selectedSlot);
  }

  onSubmit(): void {
    if (!this.reservationForm.valid) {
      this.toastService.showWarning(
        'Formulaire incomplet',
        'Veuillez remplir tous les champs obligatoires'
      );
      return;
    }

    this.loading = true;
    
    const reservationData = {
      restaurant_id: this.restaurant.id,
      ...this.reservationForm.value
    };
    
    this.reservationService.createReservation(reservationData).subscribe({
      next: (reservation) => {
        this.loading = false;
        this.success = true;
        sessionStorage.removeItem('reservation_restaurant');
        
        this.toastService.showSuccess(
          'Réservation confirmée !',
          `Votre table pour ${reservationData.number_of_people} personne(s) est réservée le ${reservationData.reservation_date} à ${reservationData.time_slot}`
        );
      },
      error: (error) => {
        this.loading = false;
        console.error('Reservation error:', error);
        this.toastService.showError(
          'Erreur de réservation',
          error.error?.message || 'Impossible de créer votre réservation. Veuillez réessayer.'
        );
      }
    });
  }

  goBack(): void {
    this.router.navigate(['/']);
  }
}