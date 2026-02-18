import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

interface FaqItem {
  question: string;
  answer: string;
  category: 'client' | 'business' | 'technical';
  isOpen?: boolean;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './faq.component.html',
  styleUrls: ['./faq.component.scss']
})
export class FaqComponent {
  searchTerm: string = '';
  selectedCategory: string = 'all';

  categories = [
    { id: 'all', label: 'Toutes', icon: 'bi-grid-3x3-gap' },
    { id: 'client', label: 'Clients', icon: 'bi-person' },
    { id: 'business', label: 'Restaurateurs', icon: 'bi-shop' },
    { id: 'technical', label: 'Technique', icon: 'bi-gear' }
  ];

  faqItems: FaqItem[] = [
    // ========================================
    // QUESTIONS CLIENTS
    // ========================================
    {
      category: 'client',
      question: 'Comment passer une commande ?',
      answer: 'Pour passer une commande, parcourez notre sélection de restaurants et traiteurs, ajoutez les plats de votre choix au panier, puis procédez au paiement. Vous recevrez une confirmation par email et pourrez suivre votre commande en temps réel.'
    },
    {
      category: 'client',
      question: 'Quels sont les moyens de paiement acceptés ?',
      answer: 'Nous acceptons les paiements via T-Money et Flooz. Tous les paiements sont sécurisés et cryptés pour garantir la protection de vos données bancaires.'
    },
    {
      category: 'client',
      question: 'Quel est le délai de livraison ?',
      answer: 'Le délai de livraison varie selon le restaurant et votre localisation. En moyenne, comptez entre 30 et 60 minutes. Vous pouvez voir le délai estimé avant de valider votre commande.'
    },
    {
      category: 'client',
      question: 'Puis-je annuler ma commande ?',
      answer: 'Oui, vous pouvez annuler votre commande dans les 30 minutes suivant sa validation, à condition qu\'elle n\'ait pas encore été préparée. Pour annuler, rendez-vous dans "Mes Commandes" depuis votre profil.'
    },
    {
      category: 'client',
      question: 'Comment faire une réservation dans un restaurant ?',
      answer: 'Cliquez sur "Réserver" sur la page du restaurant, choisissez la date, l\'heure et le nombre de personnes. Vous recevrez une confirmation par email. La réservation est gratuite et peut être modifiée jusqu\'à 24h avant.'
    },
    {
      category: 'client',
      question: 'Y a-t-il un montant minimum de commande ?',
      answer: 'Oui, le montant minimum de commande est de 1 000 FCFA. Ce montant peut varier selon les établissements.'
    },
    {
      category: 'client',
      question: 'Puis-je suivre ma commande en temps réel ?',
      answer: 'Oui, une fois votre commande validée, vous pouvez suivre son statut depuis votre profil dans la section "Mes Commandes". Vous recevrez également des notifications à chaque étape.'
    },
    {
      category: 'client',
      question: 'Comment contacter un restaurant ou traiteur ?',
      answer: 'Vous pouvez utiliser la messagerie instantanée disponible sur la page de chaque établissement. Cliquez sur "Contacter" pour démarrer une conversation.'
    },

    // ========================================
    // QUESTIONS RESTAURATEURS/TRAITEURS
    // ========================================
    {
      category: 'business',
      question: 'Comment m\'inscrire en tant que restaurateur ou traiteur ?',
      answer: 'Cliquez sur "Inscription" puis sélectionnez "Restaurant" ou "Traiteur". Remplissez le formulaire avec vos informations et celles de votre établissement. Notre équipe vérifiera votre demande sous 48h.'
    },
    {
      category: 'business',
      question: 'Quel est le coût d\'inscription ?',
      answer: 'L\'inscription est gratuite ! Vous pouvez commencer avec notre plan gratuit qui inclut 20 articles au menu et 50 commandes par mois. Des plans payants avec plus de fonctionnalités sont disponibles.'
    },
    {
      category: 'business',
      question: 'Quels sont les taux de commission ?',
      answer: 'Les taux de commission varient selon votre plan d\'abonnement : Plan Gratuit (10%), Plan Standard (5%), Plan Premium (2%). Les commissions sont prélevées uniquement sur les commandes réussies.'
    },
    {
      category: 'business',
      question: 'Comment gérer mon menu ?',
      answer: 'Connectez-vous à votre tableau de bord, allez dans "Gestion du Menu". Vous pouvez ajouter, modifier ou supprimer des plats, ajuster les prix, et gérer la disponibilité en temps réel.'
    },
    {
      category: 'business',
      question: 'Comment recevoir les paiements ?',
      answer: 'Les paiements sont traités automatiquement via notre plateforme. Vous recevez vos paiements selon votre plan : hebdomadaire pour Premium, bi-hebdomadaire pour Standard, mensuel pour Gratuit.'
    },
    {
      category: 'business',
      question: 'Puis-je personnaliser mes horaires d\'ouverture ?',
      answer: 'Oui, vous pouvez définir vos horaires d\'ouverture et fermeture dans votre tableau de bord. Vous pouvez également indiquer des jours de fermeture exceptionnelle.'
    },
    {
      category: 'business',
      question: 'Comment gérer les commandes spéciales (traiteur) ?',
      answer: 'Les traiteurs reçoivent les demandes de commandes spéciales dans leur tableau de bord. Vous pouvez consulter les détails, communiquer avec le client via chat, et accepter ou refuser la demande.'
    },
    {
      category: 'business',
      question: 'Quel support est disponible ?',
      answer: 'Tous les utilisateurs ont accès au support par email. Les abonnés Premium bénéficient d\'un support prioritaire avec temps de réponse garanti sous 2h pendant les heures ouvrables.'
    },

    // ========================================
    // QUESTIONS TECHNIQUES
    // ========================================
    {
      category: 'technical',
      question: 'Mes données sont-elles sécurisées ?',
      answer: 'Oui, nous utilisons le cryptage SSL/TLS pour toutes les communications. Vos données personnelles et bancaires sont protégées selon les normes RGPD et jamais partagées avec des tiers sans votre consentement.'
    },
    {
      category: 'technical',
      question: 'Comment réinitialiser mon mot de passe ?',
      answer: 'Cliquez sur "Mot de passe oublié" sur la page de connexion, entrez votre email, et suivez les instructions reçues par email pour créer un nouveau mot de passe.'
    },
    {
      category: 'technical',
      question: 'Puis-je utiliser l\'application sur mobile ?',
      answer: 'Oui, notre plateforme est entièrement responsive et optimisée pour les smartphones et tablettes. Vous pouvez l\'utiliser depuis n\'importe quel navigateur mobile moderne.'
    },
    {
      category: 'technical',
      question: 'Comment supprimer mon compte ?',
      answer: 'Pour supprimer votre compte, contactez notre support à support@restotraiteur.com. Nous traiterons votre demande dans les 48h. Attention : cette action est irréversible.'
    },
    {
      category: 'technical',
      question: 'J\'ai un problème technique, que faire ?',
      answer: 'Contactez notre support via le formulaire de contact ou par email à support@restotraiteur.com. Décrivez votre problème en détail et joignez des captures d\'écran si possible.'
    },
    {
      category: 'technical',
      question: 'Comment modifier mes informations personnelles ?',
      answer: 'Connectez-vous, cliquez sur votre nom en haut à droite, puis "Mon Profil". Vous pouvez y modifier toutes vos informations personnelles, adresse email, et numéro de téléphone.'
    }
  ];

  get filteredFaqs(): FaqItem[] {
    let filtered = this.faqItems;

    // Filtrer par catégorie
    if (this.selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === this.selectedCategory);
    }

    // Filtrer par recherche
    if (this.searchTerm.trim()) {
      const search = this.searchTerm.toLowerCase();
      filtered = filtered.filter(item =>
        item.question.toLowerCase().includes(search) ||
        item.answer.toLowerCase().includes(search)
      );
    }

    return filtered;
  }

  toggleFaq(faq: FaqItem): void {
    faq.isOpen = !faq.isOpen;
  }

  selectCategory(categoryId: string): void {
    this.selectedCategory = categoryId;
  }

  clearSearch(): void {
    this.searchTerm = '';
  }
}