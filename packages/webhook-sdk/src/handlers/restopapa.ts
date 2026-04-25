import { z } from 'zod';

/**
 * RestoPapa Inventory Signal Payload Schema
 * Received when stock drops below threshold
 */
export const RestoPapaInventoryPayloadSchema = z.object({
  event: z.literal('inventory.signal.received'),
  merchantId: z.string().min(1, 'merchantId is required'),
  productId: z.string().min(1, 'productId is required'),
  productName: z.string().min(1, 'productName is required'),
  sku: z.string().optional(),
  currentStock: z.number().min(0, 'currentStock must be non-negative'),
  threshold: z.number().min(0, 'threshold must be non-negative'),
  unit: z.enum(['kg', 'units', 'liters', 'packs']),
  category: z.string().optional(),
  severity: z.enum(['low', 'critical', 'out_of_stock']),
  signalType: z.enum(['threshold_breach', 'manual_request', 'forecast_deficit']),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime({ message: 'Invalid ISO timestamp format' }),
});

export type RestoPapaInventoryPayload = z.infer<typeof RestoPapaInventoryPayloadSchema>;

/**
 * Internal Inventory Signal format that all handlers map to
 */
export interface InventorySignal {
  id?: string;
  merchantId: string;
  source: 'restopapa';
  sourceMerchantId: string;
  productId: string;
  productName: string;
  sku?: string;
  currentStock: number;
  threshold: number;
  unit: string;
  category?: string;
  severity: 'low' | 'critical' | 'out_of_stock';
  signalType: 'threshold_breach' | 'manual_request' | 'forecast_deficit';
  metadata?: Record<string, unknown>;
  signalTimestamp: string;
  receivedAt: string;
}

/**
 * Maps RestoPapa payload to internal InventorySignal format
 */
export function mapRestoPapaToInventorySignal(
  payload: RestoPapaInventoryPayload
): Omit<InventorySignal, 'id'> {
  return {
    merchantId: payload.merchantId,
    source: 'restopapa',
    sourceMerchantId: payload.merchantId,
    productId: payload.productId,
    productName: payload.productName,
    sku: payload.sku,
    currentStock: payload.currentStock,
    threshold: payload.threshold,
    unit: payload.unit,
    category: payload.category,
    severity: payload.severity,
    signalType: payload.signalType,
    metadata: payload.metadata,
    signalTimestamp: payload.timestamp,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Creates an event record for the events table
 */
export interface InventorySignalEvent {
  type: 'inventory.signal.received';
  source: 'restopapa';
  payload: RestoPapaInventoryPayload;
  merchantId: string;
  productId: string;
  severity: 'low' | 'critical' | 'out_of_stock';
  timestamp: string;
}

/**
 * Maps RestoPapa payload to event record format
 */
export function mapRestoPapaToEvent(
  payload: RestoPapaInventoryPayload
): InventorySignalEvent {
  return {
    type: 'inventory.signal.received',
    source: 'restopapa',
    payload,
    merchantId: payload.merchantId,
    productId: payload.productId,
    severity: payload.severity,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validates and parses RestoPapa payload
 * @throws ZodError if validation fails
 */
export function validateRestoPapaPayload(data: unknown): RestoPapaInventoryPayload {
  return RestoPapaInventoryPayloadSchema.parse(data);
}

/**
 * Safe validation that returns result instead of throwing
 */
export function validateRestoPapaPayloadSafe(
  data: unknown
): { success: true; data: RestoPapaInventoryPayload } | { success: false; error: z.ZodError } {
  const result = RestoPapaInventoryPayloadSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * RestoPapa webhook handler for inventory signals.
 * This is the main handler function that processes incoming webhooks.
 */
export interface RestoPapaHandlerContext {
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface RestoPapaHandlerResult {
  success: boolean;
  signalId?: string;
  eventId?: string;
  error?: string;
}

/**
 * Process a RestoPapa inventory signal webhook
 *
 * @param payload - The validated RestoPapa payload
 * @param context - Database connection context
 * @returns Result with signal and event IDs
 */
export async function handleRestoPapaInventorySignal(
  payload: RestoPapaInventoryPayload,
  context: RestoPapaHandlerContext
): Promise<RestoPapaHandlerResult> {
  try {
    // Import Supabase dynamically to avoid issues if not installed
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(context.supabaseUrl, context.supabaseServiceKey);

    // Map to internal format
    const inventorySignal = mapRestoPapaToInventorySignal(payload);
    const eventRecord = mapRestoPapaToEvent(payload);

    // Insert inventory signal
    const { data: signalData, error: signalError } = await supabase
      .from('inventory_signals')
      .insert(inventorySignal)
      .select('id')
      .single();

    if (signalError) {
      console.error('Failed to insert inventory signal:', signalError);
      return {
        success: false,
        error: `Database error inserting inventory signal: ${signalError.message}`,
      };
    }

    // Insert event record
    const { data: eventData, error: eventError } = await supabase
      .from('events')
      .insert({
        type: eventRecord.type,
        source: eventRecord.source,
        payload: eventRecord.payload,
        merchant_id: eventRecord.merchantId,
        product_id: eventRecord.productId,
        severity: eventRecord.severity,
        timestamp: eventRecord.timestamp,
        created_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (eventError) {
      console.error('Failed to insert event record:', eventError);
      // Signal was inserted successfully, so we don't return error
      // but we log the event insertion failure
    }

    return {
      success: true,
      signalId: signalData.id,
      eventId: eventData?.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('RestoPapa handler error:', message);
    return {
      success: false,
      error: message,
    };
  }
}
