import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'commissionRate',
  standalone: true
})
export class CommissionRatePipe implements PipeTransform {
  /**
   * Formate un taux de commission en entier avec %
   * @param value - Le taux (peut être string ou number, ex: 5.00, "10.5", 2.75)
   * @returns Le taux formaté en entier (ex: "5%", "11%", "3%")
   */
  transform(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '0%';
    }

    // Convertir en nombre
    const numValue = typeof value === 'string' ? parseFloat(value) : value;

    // Vérifier si c'est un nombre valide
    if (isNaN(numValue)) {
      return '0%';
    }

    // Arrondir à l'entier le plus proche
    const rounded = Math.round(numValue);

    return `${rounded}%`;
  }
}