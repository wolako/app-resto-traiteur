// contact.component.ts — version avec vrai appel HTTP
import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ContactService } from '../../core/services/contact/contact.service';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent implements OnInit {
  contactForm!: FormGroup;
  isSubmitting = false;
  submitSuccess = false;
  submitError   = false;
  errorMessage  = '';

  contactInfo = {
    address: 'Lomé, Togo',
    phone:   '+228 90 47 88 14',
    email:   'contact@restotraiteur.com',
    hours:   'Lun - Dim: 24/7'
  };

  subjects = [
    { value: 'question',   label: 'Question Générale' },
    { value: 'support',    label: 'Support Technique' },
    { value: 'business',   label: 'Partenariat Professionnel' },
    { value: 'complaint',  label: 'Réclamation' },
    { value: 'other',      label: 'Autre' }
  ];

  quickFaqs = [
    { question: 'Comment passer une commande ?',             answer: 'Parcourez nos restaurants, ajoutez vos plats au panier et procédez au paiement.' },
    { question: 'Quels sont les moyens de paiement ?',       answer: 'Nous acceptons T-Money, Flooz et carte bancaire via CinetPay.' },
    { question: 'Comment m\'inscrire en tant que restaurateur ?', answer: 'Cliquez sur "Inscription" et sélectionnez "Restaurant" ou "Traiteur".' }
  ];

  constructor(
    private fb: FormBuilder,
    private contactService: ContactService   // ← injection du service
  ) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.contactForm = this.fb.group({
      name:    ['', [Validators.required, Validators.minLength(2)]],
      email:   ['', [Validators.required, Validators.email]],
      phone:   ['', [Validators.required, Validators.pattern(/^(\+228)?[0-9]{8,10}$/)]],
      subject: ['', Validators.required],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  get f() { return this.contactForm.controls; }

  onSubmit(): void {
    // Marquer tous les champs comme touchés pour afficher les erreurs
    if (this.contactForm.invalid) {
      Object.values(this.contactForm.controls).forEach(c => c.markAsTouched());
      return;
    }

    this.isSubmitting  = true;
    this.submitSuccess = false;
    this.submitError   = false;
    this.errorMessage  = '';

    this.contactService.sendMessage(this.contactForm.value).subscribe({
      next: (response) => {
        this.isSubmitting  = false;
        this.submitSuccess = true;
        this.contactForm.reset();

        // Masquer le message de succès après 6 secondes
        setTimeout(() => { this.submitSuccess = false; }, 6000);
      },
      error: (err) => {
        this.isSubmitting = false;
        this.submitError  = true;
        this.errorMessage = err.error?.message || 'Une erreur s\'est produite. Veuillez réessayer.';

        // Masquer l'erreur après 8 secondes
        setTimeout(() => { this.submitError = false; }, 8000);
      }
    });
  }

  hasError(fieldName: string): boolean {
    const field = this.contactForm.get(fieldName);
    return !!(field?.invalid && field?.touched);
  }

  getErrorMessage(fieldName: string): string {
    const field = this.contactForm.get(fieldName);
    if (!field?.touched || !field?.errors) return '';

    if (field.errors['required'])  return 'Ce champ est requis';
    if (field.errors['email'])     return 'Email invalide';
    if (field.errors['minlength']) return `Minimum ${field.errors['minlength'].requiredLength} caractères requis`;
    if (field.errors['pattern'] && fieldName === 'phone')
      return 'Numéro invalide (ex: 90000000 ou +22890000000)';
    return '';
  }
}