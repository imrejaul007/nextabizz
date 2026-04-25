import { z } from 'zod';

export const InventoryLowStockEventSchema = z.object({
  type: z.literal('INVENTORY_LOW_STOCK'),
  timestamp: z.string().datetime(),
  data: z.object({
    productId: z.string().uuid(),
    currentStock: z.number(),
    reorderPoint: z.number(),
    supplierId: z.string().uuid(),
  }),
});

export const InventoryReorderSuggestedEventSchema = z.object({
  type: z.literal('INVENTORY_REORDER_SUGGESTED'),
  timestamp: z.string().datetime(),
  data: z.object({
    productId: z.string().uuid(),
    suggestedQuantity: z.number(),
    reason: z.string(),
    urgency: z.enum(['low', 'medium', 'high']),
  }),
});

export type InventoryLowStockEvent = z.infer<typeof InventoryLowStockEventSchema>;
export type InventoryReorderSuggestedEvent = z.infer<typeof InventoryReorderSuggestedEventSchema>;
