// core/models/business.model.ts

import { SubscriptionPlan } from "./subscription.model";

export interface Business {
  created_at: Date;
  id?: number;
  user_id: number;
  name: string;
  type: 'restaurant' | 'traiteur';
  description?: string;
  address?: string;
  phone?: string;
  opening_hour?: string;
  closing_hour?: string;
  availability_start?: string;
  availability_end?: string;
  is_available?: boolean;
  is_active?: boolean;
  updated_at?: Date;
  slug?: string;

  // Notation
  average_rating?: number;
  reviews_count?: number;

  subscription_plan?: SubscriptionPlan;
  image_url?: string;

  // Acomptes
  requires_reservation_deposit?: boolean;
  default_deposit_amount?: number;
  default_special_order_deposit_percentage?: number;

  owner?: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };

  // ✅ Géolocalisation
  latitude?:  number;
  longitude?: number;
  district?:  string;
  distance_km?: number; // calculé par le backend sur requête /nearby

  // ✅ Cover image (carte home)
  cover_image_url?: string;

}

export interface UpdateBusinessRequest {
  name?: string;
  description?: string;
  address?: string;
  phone?: string;
  opening_hour?: string;
  closing_hour?: string;
  availability_start?: string;
  availability_end?: string;
  is_available?: boolean;
}

// ── Highlight ─────────────────────────────────────────────────────────────────
export interface BrandingHighlight {
  icon: string;
  text: string;
}

// ── Branding ──────────────────────────────────────────────────────────────────
export interface BusinessBranding {
  id?: number;
  business_id: number;
  primary_color?: string;
  secondary_color?: string;
  accent_color?: string;
  logo_url?: string;
  banner_url?: string;
  tagline?: string;
  opening_hours_text?: string;

  // Réseaux sociaux
  instagram_url?: string;
  facebook_url?: string;
  tiktok_url?: string;
  whatsapp_number?: string;

  // Structure alignée sur le backend : tableau, pas de champs plats
  highlights?: BrandingHighlight[];

  // Galerie
  gallery_urls?: string[];

  // Infos pratiques — remplace footer_text
  practical_note?:  string;    // ex: "Parking gratuit · WiFi · Accès PMR"
  payment_methods?: string[];  // ex: ['cash', 'card', 'tmoney', 'flooz']
}

// ── Menu public ───────────────────────────────────────────────────────────────
export interface PublicMenuItem {
  id: number;
  name: string;
  description?: string;
  price?: number;
  category?: string;
  image_url?: string;
  is_available?: boolean;
}

export interface PublicMenu {
  id: number;
  name: string;
  description?: string;
  date?: string;
  is_active?: boolean;
  items: PublicMenuItem[];
}

// ── Review public ─────────────────────────────────────────────────────────────
export interface PublicReview {
  id: number;
  rating: number;
  comment?: string;
  created_at: string;
  is_guest: boolean;
  guest_name?: string;
  user_name?: string;
}

// ── Profil public complet ─────────────────────────────────────────────────────
export interface BusinessPublicProfile extends Business {
  // Branding (null si non Premium ou non configuré)
  branding?: BusinessBranding | null;

  // Menus
  menus?: PublicMenu[];

  // Avis récents
  recent_reviews?: PublicReview[];

  // Distribution des notes { 1: 0, 2: 1, 3: 3, 4: 12, 5: 25 }
  rating_distribution?: { [star: number]: number };

  // Abonnement Premium
  is_premium?: boolean;
}

// District de Lomé
export interface LomeDistrict {
  value: string;
  label: string;
  lat:   number;
  lng:   number;
}