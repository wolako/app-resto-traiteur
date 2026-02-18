export interface MenuItem {
  id?: number;
  menu_id: number;
  name: string;
  description?: string;
  price: number;
  category?: string;
  is_available?: boolean;
  image_url?: string;
}

export interface Menu {
  id?: number;
  business_id: number;
  name: string;
  description?: string;
  is_active?: boolean;
  created_at?: Date;
  items?: MenuItem[];
}