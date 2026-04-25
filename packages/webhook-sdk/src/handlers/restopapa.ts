import { WebhookHandler } from '../verify';

export interface RestoPapaInventoryData {
  productId: string;
  productName: string;
  currentStock: number;
  unit: string;
  lastUpdated: string;
}

export const restoPapaHandlers: WebhookHandler[] = [
  {
    source: 'restopapa',
    type: 'inventory.updated',
    handler: async (payload) => {
      console.log('RestoPapa inventory updated:', payload.data);
      // Handle inventory sync logic
    },
  },
  {
    source: 'restopapa',
    type: 'product.created',
    handler: async (payload) => {
      console.log('RestoPapa product created:', payload.data);
      // Handle product creation logic
    },
  },
];
