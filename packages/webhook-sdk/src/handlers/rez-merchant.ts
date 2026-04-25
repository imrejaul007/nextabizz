import { WebhookHandler } from '../verify';

export interface RezMerchantOrderData {
  orderId: string;
  orderNumber: string;
  status: string;
  items: Array<{
    productId: string;
    quantity: number;
    price: number;
  }>;
}

export const rezMerchantHandlers: WebhookHandler[] = [
  {
    source: 'rez-merchant',
    type: 'order.created',
    handler: async (payload) => {
      console.log('REZ Merchant order created:', payload.data);
      // Handle order creation logic
    },
  },
  {
    source: 'rez-merchant',
    type: 'order.updated',
    handler: async (payload) => {
      console.log('REZ Merchant order updated:', payload.data);
      // Handle order update logic
    },
  },
];
