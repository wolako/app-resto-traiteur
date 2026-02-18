import { Business } from "./business.model";

export interface User {
  id?: number;
  email: string;
  role: 'client' | 'restaurant' | 'traiteur' | 'superadmin';
  first_name?: string;
  last_name?: string;
  phone?: string;
  is_active?: boolean;
  created_at?: Date;
  // AJOUT: Champs pour la vérification d'email
  email_verified?: boolean;
  email_verified_at?: Date;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  role: 'client' | 'restaurant' | 'traiteur';
  first_name: string;
  last_name: string;
  phone?: string;
  business_name?: string;
  business_type?: 'restaurant' | 'traiteur';
}

export interface AuthResponse {
  token: string;
  user: User;
  data: {
    token: string;
    user: User;
    business?: Business;
  };
}