export interface appPaymentRequest {
  order_id: number;
  amount: number;
  currency: string;
  payment_method: 'tmoney' | 'flooz';
  customer_name: string;
  customer_phone: string;
  customer_email?: string;
}

export interface appPaymentResponse {
  payment_id: string;
  checkout_url: string;
  status: string;
}

export interface appPayment {
  id?: number;
  order_id: number;
  payment_id: string;
  amount: number;
  currency: string;
  payment_method: string;
  status: 'pending' | 'success' | 'failed';
  transaction_id?: string;
  created_at?: Date;
  updated_at?: Date;
}