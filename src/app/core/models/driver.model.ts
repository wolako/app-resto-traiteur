// core/models/driver.model.ts

export interface Driver {
  id?: number;
  user_id?: number;
  business_id?: number;
  business_name?: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  vehicle_type: 'moto' | 'velo' | 'voiture' | 'pied';
  status: 'offline' | 'available' | 'at_capacity' | 'inactive';
  raw_status?: string;
  real_status?: string;
  max_concurrent_orders: number;
  active_orders_count?: number;
  remaining_slots?: number;
  is_active: boolean;
  temp_password_used?: boolean;
  last_seen_at?: string;
  created_at?: string;
  active_assignments?: DriverAssignment[];
  driver_type: string;
  district?: string;
}

export interface DriverAssignment {
  assignment_id:     number;
  order_id:          number;
  assignment_status: 'assigned' | 'picked_up' | 'delivered' | 'failed';
  assigned_at:       string;
  accepted_at?:      string | null;
  picked_up_at?:     string;
  total_amount:      number;
  delivery_address?: string;
  delivery_lat?:     number | null;  // ✅ AJOUTER
  delivery_lng?:     number | null;  // ✅ AJOUTER
  delivery_status:   string;
  client_name:       string;
  client_phone?:     string;         // ✅ AJOUTER (si absent)
  business_name:     string;
  business_address?: string;
  business_phone?:   string;
}

export interface CreateDriverDto {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  vehicle_type: 'moto' | 'velo' | 'voiture' | 'pied';
  max_concurrent_orders?: number;
  business_id?: number; 
  district?: string;
}

export interface DriverCredentials {
  phone: string;
  temp_password: string;
  note: string;
}
