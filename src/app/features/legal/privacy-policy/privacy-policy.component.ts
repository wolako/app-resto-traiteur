import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss']
})
export class PrivacyPolicyComponent {
  lastUpdated: string = 'Février 2026';
  
  company = {
    name: 'RestoTraiteur',
    email: 'dpo@restotraiteur.com',
    address: 'Lomé, Togo'
  };

  dataTypes = [
    { category: 'Inscription', items: ['Nom', 'Prénom', 'Email', 'Téléphone', 'Mot de passe (crypté)'] },
    { category: 'Commande', items: ['Adresse de livraison', 'Historique des commandes', 'Préférences alimentaires'] },
    { category: 'Navigation', items: ['Adresse IP', 'Type de navigateur', 'Pages visitées', 'Durée des visites'] },
    { category: 'Paiement', items: ['Informations de transaction (via T-Money/Flooz)', 'Montants', 'Dates'] }
  ];

  userRights = [
    { right: 'Droit d\'accès', description: 'Obtenir une copie de vos données personnelles' },
    { right: 'Droit de rectification', description: 'Corriger vos données inexactes ou incomplètes' },
    { right: 'Droit à l\'effacement', description: 'Demander la suppression de vos données' },
    { right: 'Droit à la portabilité', description: 'Recevoir vos données dans un format structuré' },
    { right: 'Droit d\'opposition', description: 'Vous opposer au traitement de vos données' },
    { right: 'Droit de limitation', description: 'Limiter le traitement de vos données' }
  ];
}