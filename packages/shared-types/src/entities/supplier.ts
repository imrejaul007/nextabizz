import { z } from 'zod';

export const SupplierStatusSchema = z.enum(['active', 'inactive', 'pending']);
export type SupplierStatus = z.infer<typeof SupplierStatusSchema>;

export const SupplierSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  address: z.string().optional(),
  status: SupplierStatusSchema,
  score: z.number().min(0).max(100).optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Supplier = z.infer<typeof SupplierSchema>;
