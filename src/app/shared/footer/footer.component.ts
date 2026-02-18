import { Component, OnInit, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-footer',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './footer.component.html',
  styleUrls: ['./footer.component.scss']
})
export class FooterComponent implements OnInit {
  currentYear: number = new Date().getFullYear();
  showBackToTop: boolean = false;

  ngOnInit(): void {
    // Initialisation si nécessaire
  }

  /**
   * Détecte le scroll pour afficher/masquer le bouton "Retour en haut"
   */
  @HostListener('window:scroll', [])
  onWindowScroll(): void {
    // Afficher le bouton si on a scrollé plus de 300px
    this.showBackToTop = window.pageYOffset > 300;
  }

  /**
   * Fait défiler la page vers le haut avec animation fluide
   */
  scrollToTop(): void {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  }
}