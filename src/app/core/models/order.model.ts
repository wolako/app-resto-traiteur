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
  
  // Statut de la commande
  status: 'pending' | 'confirmed' | 'preparing' | 'ready' | 'delivered' | 'cancelled';
  
  // ✅ MODIFIÉ : Statuts de paiement étendus pour COD
  payment_status: 'pending' | 'paid' | 'failed' | 'cod_pending' | 'cod_received';
  
  // ✅ MODIFIÉ : Méthodes de paiement étendues
  payment_method?: 'tmoney' | 'flooz' | 'Mixx By Yas' | 'card' | 'cash';
  
  // ✅ NOUVEAU : Type de paiement (online ou COD)
  payment_type?: 'online' | 'cod';
  
  notes?: string;
  created_at?: Date;
  items?: OrderItem[];
  business?: any;
  
  // ✅ NOUVEAU : Champs spécifiques au COD
  cod_amount?: number;              // Montant payé en cash
  cod_received_at?: Date | string;  // Date de réception du cash
  cod_confirmed_by?: number;        // ID de l'utilisateur qui a confirmé
  
  // Champs optionnels supplémentaires (pour les dashboards)
  business_name?: string;
  items_count?: number;
  user_id?: number;
  updated_at?: Date | string;
}