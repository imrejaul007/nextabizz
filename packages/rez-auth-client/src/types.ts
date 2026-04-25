export interface RezMerchant {
  id: string;
  name: string;
  email: string;
  phone?: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RezOrder {
  id: string;
  orderNumber: string;
  merchantId: string;
  status: string;
  totalAmount: number;
  items: RezOrderItem[];
  createdAt: string;
  updatedAt: string;
}

export interface RezOrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}
