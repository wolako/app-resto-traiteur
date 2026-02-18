import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'currencyFormat',
  standalone: true
})
export class CurrencyFormatPipe implements PipeTransform {
  /**
   * Formate un montant en retirant les décimales inutiles et en ajoutant des espaces
   * @param value - Le montant à formater (peut être string ou number)
   * @param currency - La devise (par défaut 'FCFA')
   * @returns Le montant formaté (ex: "11 000 FCFA")
   */
  transform(value: string | number | null | undefined, currency: string = 'FCFA'): string {
    if (value === null || value === undefined || value === '') {
      return `0 ${currency}`;
    }

    // Convertir en nombre
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    // Vérifier si c'est un nombre valide
    if (isNaN(numValue)) {
      return `0 ${currency}`;
    }

    // Arrondir pour enlever les décimales inutiles
    const rounded = Math.round(numValue);

    // Formater avec des espaces tous les 3 chiffres
    const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

    return `${formatted} ${currency}`;
  }
}