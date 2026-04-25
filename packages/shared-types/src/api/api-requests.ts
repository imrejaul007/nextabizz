import { z } from 'zod';

export const CreateOrderRequestSchema = z.object({
  merchantId: z.string().uuid(),
  supplierId: z.string().uuid(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    quantity: z.number().positive(),
  })),
  deliveryDate: z.string().datetime().optional(),
  notes: z.string().optional(),
});

export type CreateOrderRequest = z.infer<typeof CreateOrderRequestSchema>;

export const CreateRFQRequestSchema = z.object({
  merchantId: z.string().uuid(),
  supplierIds: z.array(z.string().uuid()),
  items: z.array(z.object({
    productName: z.string().min(1),
    quantity: z.number().positive(),
    unit: z.string(),
    specifications: z.string().optional(),
  })),
  deadline: z.string().datetime(),
  notes: z.string().optional(),
});

export type CreateRFQRequest = z.infer<typeof CreateRFQRequestSchema>;

export const UpdateOrderStatusRequestSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']),
});

export type UpdateOrderStatusRequest = z.infer<typeof UpdateOrderStatusRequestSchema>;
