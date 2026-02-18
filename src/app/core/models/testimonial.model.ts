// src/app/core/models/testimonial.model.ts

export interface Testimonial {
  id?: number;
  user_id: number;
  rating: number; // 1-5
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  is_featured: boolean;
  display_name?: string;
  display_photo?: string;
  created_at?: Date;
  updated_at?: Date;
  rejection_reason?: string; 
  
  // Relations (populated par backend)
  user?: {
    id: number;
    first_name: string;
    last_name: string;
    email: string;
    photo?: string;
  };
}

export interface TestimonialSubmission {
  rating: number;
  comment: string;
  display_name?: string;
  allow_photo: boolean;
}

export interface TestimonialStats {
  total: number;
  pending: number;
  approved: number;
  rejected: number;
  featured: number;
  average_rating: number;
}