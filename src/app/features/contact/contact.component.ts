import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './contact.component.html',
  styleUrls: ['./contact.component.scss']
})
export class ContactComponent implements OnInit {
  contactForm!: FormGroup;
  isSubmitting: boolean = false;
  submitSuccess: boolean = false;
  submitError: boolean = false;

  contactInfo = {
    address: 'Lomé, Togo',
    phone: '+228 90 00 00 00',
    email: 'contact@restotraiteur.com',
    hours: 'Lun - Dim: 24/7'
  };

  subjects = [
    { value: 'question', label: 'Question Générale' },
    { value: 'support', label: 'Support Technique' },
    { value: 'business', label: 'Partenariat Professionnel' },
    { value: 'complaint', label: 'Réclamation' },
    { value: 'other', label: 'Autre' }
  ];

  quickFaqs = [
    {
      question: 'Comment passer une commande ?',
      answer: 'Parcourez nos restaurants, ajoutez vos plats au panier et procédez au paiement.'
    },
    {
      question: 'Quels sont les moyens de paiement ?',
      answer: 'Nous acceptons T-Money et Flooz.'
    },
    {
      question: 'Comment m\'inscrire en tant que restaurateur ?',
      answer: 'Cliquez sur "Inscription" et sélectionnez "Restaurant" ou "Traiteur".'
    }
  ];

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initForm();
  }

  initForm(): void {
    this.contactForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(2)]],
      email: ['', [Validators.required, Validators.email]],
      phone: ['', [Validators.required, Validators.pattern(/^(\+228)?[0-9]{8,10}$/)]],
      subject: ['', Validators.required],
      message: ['', [Validators.required, Validators.minLength(10)]]
    });
  }

  get f() {
    return this.contactForm.controls;
  }

  onSubmit(): void {
    if (this.contactForm.invalid) {
      // Marquer tous les champs comme touchés pour afficher les erreurs
      Object.keys(this.contactForm.controls).forEach(key => {
        this.contactForm.get(key)?.markAsTouched();
      });
      return;
    }

    this.isSubmitting = true;
    this.submitSuccess = false;
    this.submitError = false;

    // Simuler l'envoi (remplacer par un vrai service HTTP)
    setTimeout(() => {
      console.log('Form Data:', this.contactForm.value);
      
      // Simuler un succès
      this.isSubmitting = false;
      this.submitSuccess = true;
      this.contactForm.reset();

      // Cacher le message de succès après 5 secondes
      setTimeout(() => {
        this.submitSuccess = false;
      }, 5000);
    }, 2000);
  }

  getErrorMessage(fieldName: string): string {
    const field = this.contactForm.get(fieldName);
    if (!field || !field.touched || !field.errors) {
      return '';
    }

    if (field.errors['required']) {
      return 'Ce champ est requis';
    }

    if (field.errors['email']) {
      return 'Email invalide';
    }

    if (field.errors['minlength']) {
      const minLength = field.errors['minlength'].requiredLength;
      return `Minimum ${minLength} caractères requis`;
    }

    if (field.errors['pattern']) {
      if (fieldName === 'phone') {
        return 'Numéro de téléphone invalide (ex: 90000000 ou +22890000000)';
      }
    }

    return '';
  }

  hasError(fieldName: string): boolean {
    const field = this.contactForm.get(fieldName);
    return !!(field && field.invalid && field.touched);
  }
}