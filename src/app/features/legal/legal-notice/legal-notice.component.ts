import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-legal-notice',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './legal-notice.component.html',
  styleUrls: ['./legal-notice.component.scss']
})
export class LegalNoticeComponent {
  lastUpdated: string = 'Février 2026';
  
  company = {
    name: 'RestoTraiteur',
    legalName: 'RestoTraiteur SARL',
    legalForm: 'Société à Responsabilité Limitée',
    address: 'Lomé, Togo',
    rccm: 'TG-LOM-XX-XXXX-X-X-XXXXX',
    capital: '1 000 000 FCFA',
    email: 'legal@restotraiteur.com',
    phone: '+228 90 00 00 00'
  };

  director = {
    name: '[Nom du Directeur]',
    title: 'Directeur Général'
  };

  hosting = {
    provider: '[Nom de l\'hébergeur]',
    address: '[Adresse complète de l\'hébergeur]',
    phone: '[Téléphone de l\'hébergeur]',
    website: '[Site web de l\'hébergeur]'
  };
}