import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent {
  features = [
    {
      icon: 'bi-shop',
      title: 'Large Sélection',
      description: 'Découvrez une variété de restaurants et services traiteur à Lomé et ses environs'
    },
    {
      icon: 'bi-clock',
      title: 'Commande Rapide',
      description: 'Commandez en quelques clics et recevez vos plats rapidement'
    },
    {
      icon: 'bi-shield-check',
      title: 'Paiement Sécurisé',
      description: 'Paiements sécurisés via T-Money et Flooz'
    },
    {
      icon: 'bi-headset',
      title: 'Support 24/7',
      description: 'Notre équipe est disponible pour vous aider à tout moment'
    }
  ];

  stats = [
    { value: '100+', label: 'Restaurants & Traiteurs' },
    { value: '5000+', label: 'Commandes Livrées' },
    { value: '4.8/5', label: 'Note Moyenne' },
    { value: '24/7', label: 'Disponibilité' }
  ];

  values = [
    {
      icon: 'bi-award',
      title: 'Qualité',
      description: 'Nous sélectionnons les meilleurs établissements pour garantir votre satisfaction'
    },
    {
      icon: 'bi-people',
      title: 'Soutien Local',
      description: 'Nous soutenons les restaurateurs et traiteurs locaux dans leur développement'
    },
    {
      icon: 'bi-lightning',
      title: 'Innovation',
      description: 'Nous utilisons les dernières technologies pour améliorer votre expérience'
    },
    {
      icon: 'bi-heart',
      title: 'Passion',
      description: 'Nous aimons la bonne cuisine et voulons la rendre accessible à tous'
    }
  ];

  scrollToSection(sectionId: string): void {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}