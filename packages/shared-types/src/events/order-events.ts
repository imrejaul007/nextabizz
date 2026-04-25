import { z } from 'zod';

export const OrderCreatedEventSchema = z.object({
  type: z.literal('ORDER_CREATED'),
  timestamp: z.string().datetime(),
  data: z.object({
    orderId: z.string().uuid(),
    orderNumber: z.string(),
    merchantId: z.string().uuid(),
    supplierId: z.string().uuid(),
    totalAmount: z.number(),
  }),
});

export const OrderStatusChangedEventSchema = z.object({
  type: z.literal('ORDER_STATUS_CHANGED'),
  timestamp: z.string().datetime(),
  data: z.object({
    orderId: z.string().uuid(),
    previousStatus: z.string(),
    newStatus: z.string(),
  }),
});

export const OrderDeliveredEventSchema = z.object({
  type: z.literal('ORDER_DELIVERED'),
  timestamp: z.string().datetime(),
  data: z.object({
    orderId: z.string().uuid(),
    deliveredAt: z.string().datetime(),
  }),
});

export type OrderCreatedEvent = z.infer<typeof OrderCreatedEventSchema>;
export type OrderStatusChangedEvent = z.infer<typeof OrderStatusChangedEventSchema>;
export type OrderDeliveredEvent = z.infer<typeof OrderDeliveredEventSchema>;
