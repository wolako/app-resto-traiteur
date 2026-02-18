export interface Notification {
  id: number;
  business_id: number;
  type: 'new_order' | 'new_reservation' | 'payment_success' | 'payment_failed' | 'delivery_confirmed' | 'order_cancelled' | 'reservation_cancelled';
  title: string;
  message: string;
  reference_id: number;
  reference_type: 'order' | 'reservation' | 'payment';
  priority: 'low' | 'normal' | 'high' | 'urgent';
  metadata: any;
  is_read: boolean;
  read_at?: Date;
  created_at: Date;
}