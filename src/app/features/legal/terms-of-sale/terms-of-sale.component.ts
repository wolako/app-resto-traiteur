import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-terms-of-sale',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './terms-of-sale.component.html',
  styleUrls: ['./terms-of-sale.component.scss']
})
export class TermsOfSaleComponent {
  lastUpdated: string = 'Février 2026';
  company = { name: 'RestoTraiteur', email: 'support@restotraiteur.com' };
  
  paymentMethods = ['Mixx By Yas', 'Flooz'];
}