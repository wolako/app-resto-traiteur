import { User } from "./user.model";

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
  
  // ✅ NOUVEAU : Propriétés pour le système de notation
  average_rating?: number;      // Note moyenne (0 à 5)
  reviews_count?: number;        // Nombre total d'avis
  
  owner?: {
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
  };
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