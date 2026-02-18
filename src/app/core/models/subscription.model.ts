// src/app/core/models/subscription.model.ts

export interface SubscriptionPlan {
  id: number;
  name: string;
  display_name: string;
  description: string;
  price: number;
  billing_period: 'monthly' | 'yearly' | 'lifetime';
  
  // Limites
  max_menu_items: number | null;
  max_orders_per_month: number | null;
  max_photos: number;
  
  // Fonctionnalités
  can_accept_online_orders: boolean;
  can_accept_reservations: boolean;
  can_accept_special_orders: boolean;
  priority_support: boolean;
  analytics_access: boolean;
  custom_branding: boolean;
  api_access: boolean;
  
  // Commission
  commission_rate: number;
  
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessSubscription {
  id: number;
  business_id: number;
  plan_id: number;
  status: 'active' | 'cancelled' | 'expired' | 'suspended';
  start_date: string;
  end_date: string | null;
  next_billing_date: string | null;
  auto_renew: boolean;
  created_at: string;
  updated_at: string;
  
  // Données du plan (jointure)
  plan_name?: string;
  plan_display_name?: string;
  plan_price?: number;
  billing_period?: string;
  max_menu_items?: number | null;
  max_orders_per_month?: number | null;
  max_photos?: number;
  can_accept_online_orders?: boolean;
  can_accept_reservations?: boolean;
  can_accept_special_orders?: boolean;
  priority_support?: boolean;
  analytics_access?: boolean;
  custom_branding?: boolean;
  api_access?: boolean;
  commission_rate?: number;
}

export interface SubscriptionLimits {
  hasActiveSubscription: boolean;
  plan?: string;
  canAcceptOrders: boolean;
  canAcceptReservations: boolean;
  canAcceptSpecialOrders: boolean;
  canAddMenuItems: boolean;
  menuItemsCount: number;
  maxMenuItems: number | null;
  ordersThisMonth: number;
  maxOrdersPerMonth: number | null;
  commissionRate: number;
}

export interface SubscriptionPayment {
  id: number;
  subscription_id: number;
  business_id: number;
  plan_id: number;
  amount: number;
  currency: string;
  payment_method: string;
  transaction_id: string;
  payment_status: 'pending' | 'success' | 'failed' | 'refunded';
  billing_period_start: string;
  billing_period_end: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  plan_name?: string;
}

export interface Commission {
  id: number;
  order_id: number | null;
  special_order_id: number | null;
  business_id: number;
  order_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'collected' | 'paid' | 'cancelled';
  collected_at: string | null;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
  
  // Jointures
  order_type?: 'order' | 'special_order';
  client_name?: string;
  business_name?: string;
}

export interface CommissionStats {
  total_commissions: number;
  total_commission_amount: number;
  pending_amount: number;
  collected_amount: number;
  paid_amount: number;
  businesses_count?: number;
}

// export interface AppSetting {
//   id: number;
//   key: string;
//   value: string;
//   value_type: 'string' | 'number' | 'boolean' | 'json';
//   category: string;
//   description: string;
//   is_public: boolean;
//   created_at: string;
//   updated_at: string;
// }

export interface SettingsCategory {
  category: string;
  settings_count: number;
}