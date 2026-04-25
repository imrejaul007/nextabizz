import { z } from 'zod';

export const RFQStatusSchema = z.enum(['draft', 'sent', 'quoted', 'accepted', 'rejected', 'expired']);
export type RFQStatus = z.infer<typeof RFQStatusSchema>;

export const RFQItemSchema = z.object({
  productName: z.string().min(1),
  quantity: z.number().positive(),
  unit: z.string(),
  specifications: z.string().optional(),
});

export type RFQItem = z.infer<typeof RFQItemSchema>;

export const RFQSchema = z.object({
  id: z.string().uuid(),
  rfqNumber: z.string(),
  merchantId: z.string().uuid(),
  supplierIds: z.array(z.string().uuid()),
  items: z.array(RFQItemSchema),
  status: RFQStatusSchema,
  deadline: z.string().datetime(),
  notes: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type RFQ = z.infer<typeof RFQSchema>;
