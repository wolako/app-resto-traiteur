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
}

export interface DriverAssignment {
  id: number;
  order_id: number;
  driver_id: number;
  assignment_status: 'assigned' | 'picked_up' | 'delivered' | 'failed';
  assigned_at: string;
  picked_up_at?: string;
  delivered_at?: string;
  failed_at?: string;
  failure_reason?: string;
  client_name?: string;
  delivery_address?: string;
  business_name?: string;
  business_address?: string;
  business_phone?: string;
  total_amount?: number;
}

export interface CreateDriverDto {
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  vehicle_type: 'moto' | 'velo' | 'voiture' | 'pied';
  max_concurrent_orders?: number;
  business_id?: number; // admin seulement
}

export interface DriverCredentials {
  phone: string;
  temp_password: string;
  note: string;
}

