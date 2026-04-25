import { z } from 'zod';

export const ProductUnitSchema = z.enum(['kg', 'g', 'lb', 'oz', 'l', 'ml', 'unit', 'case', 'pack']);
export type ProductUnit = z.infer<typeof ProductUnitSchema>;

export const ProductSchema = z.object({
  id: z.string().uuid(),
  sku: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string(),
  unit: ProductUnitSchema,
  unitPrice: z.number().positive(),
  supplierId: z.string().uuid(),
  minOrderQuantity: z.number().positive().optional(),
  inStock: z.boolean().default(true),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Product = z.infer<typeof ProductSchema>;
