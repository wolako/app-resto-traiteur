// src/app/shared/components/testimonials/testimonials.component.ts

import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Testimonial } from '../../../core/models/testimonial.model';
import { TestimonialService } from '../../../core/services/testimonial/testimonial.service';

@Component({
  selector: 'app-testimonials',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './testimonials.component.html',
  styleUrls: ['./testimonials.component.scss']
})
export class TestimonialsComponent implements OnInit {
  testimonials: Testimonial[] = [];
  currentIndex = 0;
  isLoading = true;
  error = false;

  // Configuration du carousel
  visibleCount = 3; // Nombre de témoignages visibles à la fois
  autoPlayInterval = 5000; // 5 secondes
  private autoPlayTimer: any;

  constructor(private testimonialService: TestimonialService) {}

  ngOnInit(): void {
    this.loadTestimonials();
  }

  ngOnDestroy(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
    }
  }

  loadTestimonials(): void {
    this.isLoading = true;
    this.error = false;

    // Charger les témoignages vedettes approuvés
    this.testimonialService.getApprovedTestimonials(true, 10).subscribe({
      next: (testimonials) => {
        this.testimonials = testimonials;
        this.isLoading = false;
        
        // Démarrer l'auto-play si assez de témoignages
        if (this.testimonials.length > this.visibleCount) {
          this.startAutoPlay();
        }
      },
      error: (error) => {
        console.error('Error loading testimonials:', error);
        this.error = true;
        this.isLoading = false;
      }
    });
  }

  get visibleTestimonials(): Testimonial[] {
    if (this.testimonials.length === 0) return [];
    
    // ✅ Ne jamais retourner plus de témoignages qu'il n'en existe
    const count = Math.min(this.visibleCount, this.testimonials.length);
    const visible: Testimonial[] = [];
    for (let i = 0; i < count; i++) {
      const index = (this.currentIndex + i) % this.testimonials.length;
      visible.push(this.testimonials[index]);
    }
    return visible;
  }

  // ✅ Corriger aussi nextSlide/prevSlide pour ne pas naviguer si 1 seul témoignage
  nextSlide(): void {
    if (this.testimonials.length > 1) {
      this.currentIndex = (this.currentIndex + 1) % this.testimonials.length;
      this.resetAutoPlay();
    }
  }

  prevSlide(): void {
    if (this.testimonials.length > 1) {
      this.currentIndex = (this.currentIndex - 1 + this.testimonials.length) % this.testimonials.length;
      this.resetAutoPlay();
    }
  }

  goToSlide(index: number): void {
    this.currentIndex = index;
    this.resetAutoPlay();
  }

  startAutoPlay(): void {
    // ✅ N'activer l'auto-play que si plus d'un témoignage
    if (this.testimonials.length > 1) {
      this.autoPlayTimer = setInterval(() => {
        this.nextSlide();
      }, this.autoPlayInterval);
    }
  }

  resetAutoPlay(): void {
    if (this.autoPlayTimer) {
      clearInterval(this.autoPlayTimer);
    }
    if (this.testimonials.length > this.visibleCount) {
      this.startAutoPlay();
    }
  }

  getStars(rating: number): { filled: number[]; empty: number[] } {
    const filled = Array(rating).fill(0);
    const empty = Array(5 - rating).fill(0);
    return { filled, empty };
  }

  getDisplayName(testimonial: Testimonial): string {
    if (testimonial.display_name) {
      return testimonial.display_name;
    }
    if (testimonial.user) {
      return `${testimonial.user.first_name} ${testimonial.user.last_name.charAt(0)}.`;
    }
    return 'Client Vérifié';
  }

  getDisplayPhoto(testimonial: Testimonial): string {
    // ✅ display_photo en priorité (sauvegardé lors de la soumission)
    if (testimonial.display_photo) {
      return testimonial.display_photo;
    }
    // ✅ user.photo n'existe pas en DB — générer un avatar avec initiales
    return 'assets/images/default-avatar.png';
  }

  onImageError(event: Event): void {
    const target = event.target as HTMLImageElement;
    target.src = 'assets/images/default-avatar.png';
  }

  getTimeSince(date: Date | undefined): string {
    if (!date) return 'Récemment';
    
    const now = new Date();
    const testimonialDate = new Date(date);
    const diffMs = now.getTime() - testimonialDate.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Aujourd\'hui';
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    if (diffDays < 30) return `Il y a ${Math.floor(diffDays / 7)} semaines`;
    if (diffDays < 365) return `Il y a ${Math.floor(diffDays / 30)} mois`;
    return `Il y a ${Math.floor(diffDays / 365)} an${Math.floor(diffDays / 365) > 1 ? 's' : ''}`;
  }

  getVerifiedBadge(testimonial: Testimonial): { label: string; icon: string } {
    const role = testimonial.user?.role;
    if (role === 'restaurant') {
      return { label: 'Restaurant vérifié', icon: 'bi-building-check' };
    }
    if (role === 'traiteur') {
      return { label: 'Traiteur vérifié', icon: 'bi-patch-check-fill' };
    }
    // client ou pas de role
    return { label: 'Client vérifié', icon: 'bi-patch-check-fill' };
  }

}