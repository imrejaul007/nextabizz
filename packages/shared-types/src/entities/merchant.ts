import { z } from 'zod';

export const MerchantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  type: z.enum(['restaurant', 'hotel', 'catering', 'other']),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  rezMerchantId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Merchant = z.infer<typeof MerchantSchema>;
