import { z } from 'zod';

// Product Source Enum
export const ProductSourceSchema = z.enum(['restopapa', 'rez-merchant', 'hotel-pms']);
export type ProductSource = z.infer<typeof ProductSourceSchema>;

// Signal Severity Enum
export const SignalSeveritySchema = z.enum(['low', 'critical', 'out_of_stock']);
export type SignalSeverity = z.infer<typeof SignalSeveritySchema>;

// Signal Type Enum
export const SignalTypeSchema = z.enum(['threshold_breach', 'manual_request', 'forecast_deficit']);
export type SignalType = z.infer<typeof SignalTypeSchema>;

// Reorder Signal Status Enum
export const ReorderSignalStatusSchema = z.enum(['pending', 'matched', 'po_created', 'ignored']);
export type ReorderSignalStatus = z.infer<typeof ReorderSignalStatusSchema>;

// Reorder Signal Urgency Enum
export const ReorderUrgencySchema = z.enum(['high', 'medium', 'low']);
export type ReorderUrgency = z.infer<typeof ReorderUrgencySchema>;

// Inventory Signal Entity
export interface InventorySignal {
  id: string;
  merchantId: string;
  source: ProductSource;
  sourceProductId: string;
  sourceMerchantId: string;
  productName: string;
  sku?: string;
  currentStock: number;
  threshold: number;
  unit: string;
  category?: string;
  severity: SignalSeverity;
  signalType: SignalType;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

// Inventory Signal Zod Schema
export const InventorySignalSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  source: ProductSourceSchema,
  sourceProductId: z.string().min(1),
  sourceMerchantId: z.string().min(1),
  productName: z.string().min(1, 'Product name is required'),
  sku: z.string().optional(),
  currentStock: z.number().min(0),
  threshold: z.number().min(0),
  unit: z.string().min(1, 'Unit is required'),
  category: z.string().optional(),
  severity: SignalSeveritySchema,
  signalType: SignalTypeSchema,
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.date(),
});

// Create Inventory Signal Input
export interface CreateInventorySignalInput {
  merchantId: string;
  source: ProductSource;
  sourceProductId: string;
  sourceMerchantId: string;
  productName: string;
  sku?: string;
  currentStock: number;
  threshold: number;
  unit: string;
  category?: string;
  severity: SignalSeverity;
  signalType: SignalType;
  metadata?: Record<string, unknown>;
}

// Create Inventory Signal Zod Schema
export const CreateInventorySignalSchema = z.object({
  merchantId: z.string().uuid(),
  source: ProductSourceSchema,
  sourceProductId: z.string().min(1),
  sourceMerchantId: z.string().min(1),
  productName: z.string().min(1, 'Product name is required'),
  sku: z.string().optional(),
  currentStock: z.number().min(0),
  threshold: z.number().min(0),
  unit: z.string().min(1, 'Unit is required'),
  category: z.string().optional(),
  severity: SignalSeveritySchema,
  signalType: SignalTypeSchema,
  metadata: z.record(z.unknown()).optional(),
});

// Reorder Signal Entity
export interface ReorderSignal {
  id: string;
  merchantId: string;
  inventorySignalId?: string;
  suggestedQty?: number;
  urgency: ReorderUrgency;
  status: ReorderSignalStatus;
  matchConfidence?: number;
  createdAt: Date;
  updatedAt: Date;
}

// Reorder Signal Zod Schema
export const ReorderSignalSchema = z.object({
  id: z.string().uuid(),
  merchantId: z.string().uuid(),
  inventorySignalId: z.string().uuid().optional(),
  suggestedQty: z.number().positive().optional(),
  urgency: ReorderUrgencySchema,
  status: ReorderSignalStatusSchema,
  matchConfidence: z.number().min(0).max(100).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Create Reorder Signal Input
export interface CreateReorderSignalInput {
  merchantId: string;
  inventorySignalId?: string;
  suggestedQty?: number;
  urgency: ReorderUrgency;
  matchConfidence?: number;
}

// Create Reorder Signal Zod Schema
export const CreateReorderSignalSchema = z.object({
  merchantId: z.string().uuid(),
  inventorySignalId: z.string().uuid().optional(),
  suggestedQty: z.number().positive().optional(),
  urgency: ReorderUrgencySchema,
  matchConfidence: z.number().min(0).max(100).optional(),
});

// Update Reorder Signal Input
export interface UpdateReorderSignalInput {
  status?: ReorderSignalStatus;
  matchConfidence?: number;
}

// Update Reorder Signal Zod Schema
export const UpdateReorderSignalSchema = z.object({
  status: ReorderSignalStatusSchema.optional(),
  matchConfidence: z.number().min(0).max(100).optional(),
});

