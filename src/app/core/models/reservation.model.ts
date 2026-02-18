export interface Reservation {
  updated_at: any;
  id?: number;
  restaurant_id: number;
  client_name: string;
  client_phone: string;
  client_email?: string;
  reservation_date: string;
  time_slot: string;
  number_of_people: number;
  status: 'pending' | 'confirmed' | 'cancelled';
  special_requests?: string;
  created_at?: Date;
  restaurant?: any;
}