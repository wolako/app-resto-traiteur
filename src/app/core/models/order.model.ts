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
  payment_status: 'pending' | 'paid' | 'failed';
  payment_method?: 'tmoney' | 'flooz';
  notes?: string;
  created_at?: Date;
  items?: OrderItem[];
  business?: any;
}