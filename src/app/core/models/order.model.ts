// ═════════════════════════════════════════════════════════════════════════════
// ORDER MODEL - VERSION AVEC COD (Cash on Delivery)
// Remplacer frontend/src/app/core/models/order.model.ts par ce contenu
// ═════════════════════════════════════════════════════════════════════════════

export interface OrderItem {
  id?: number;
  order_id?: number;
  menu_item_id: number;
  quantity: number;
  unit_price: number;
  subtotal?: number;
  menu_item?: any;
}

export interface Order {
  id?: number;
  business_id: number;
  client_name: string;
  client_phone: string;
  client_email?: string;
  total_amount: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  payment_status: 'pending' | 'paid' | 'failed' | 'cod_pending' | 'cod_received';
  payment_method?: 'flooz' | 'Mixx By Yas' | 'card' | 'cash';
  payment_type?: 'online' | 'cod';
  notes?: string;
  created_at?: Date;
  items?: OrderItem[];
  business?: any;
  cod_amount?: number;
  cod_received_at?: Date | string;
  cod_confirmed_by?: number;
  business_name?: string;
  items_count?: number;
  user_id?: number;
  updated_at?: Date | string;
  // ✅ Ajouts pour la livraison
  current_assignment_id?: number;
  delivery_status?: 'pending' | 'ready_for_pickup' | 'assigned' | 'in_transit' | 'delivered' | 'failed';
  delivery_address?: string;
  delivery_distance?: number;
}