import { z } from 'zod';

/**
 * Hotel PMS Inventory Signal Payload Schema
 * Received when hotel inventory (housekeeping, kitchen, spa, etc.) drops below threshold
 */
export const HotelPMSInventoryPayloadSchema = z.object({
  event: z.literal('inventory.signal.received'),
  merchantId: z.string().min(1, 'merchantId is required'), // Hotel ID
  department: z.enum(['housekeeping', 'kitchen', 'spa', 'front_desk']),
  itemId: z.string().min(1, 'itemId is required'),
  itemName: z.string().min(1, 'itemName is required'),
  category: z.string().min(1, 'category is required'),
  currentStock: z.number().min(0, 'currentStock must be non-negative'),
  threshold: z.number().min(0, 'threshold must be non-negative'),
  unit: z.string().min(1, 'unit is required'),
  severity: z.enum(['low', 'critical', 'out_of_stock']),
  signalType: z.enum(['threshold_breach', 'manual_request', 'forecast_deficit']),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime({ message: 'Invalid ISO timestamp format' }),
});

export type HotelPMSInventoryPayload = z.infer<typeof HotelPMSInventoryPayloadSchema>;

/**
 * Internal Inventory Signal format that all handlers map to
 */
export interface InventorySignal {
  id?: string;
  merchantId: string;
  source: 'hotel-pms';
  sourceMerchantId: string;
  productId: string;
  productName: string;
  department?: string;
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
 * Maps Hotel PMS payload to internal InventorySignal format
 */
export function mapHotelPMSToInventorySignal(
  payload: HotelPMSInventoryPayload
): Omit<InventorySignal, 'id'> {
  return {
    merchantId: payload.merchantId,
    source: 'hotel-pms',
    sourceMerchantId: payload.merchantId,
    productId: payload.itemId,
    productName: payload.itemName,
    department: payload.department,
    currentStock: payload.currentStock,
    threshold: payload.threshold,
    unit: payload.unit,
    category: payload.category,
    severity: payload.severity,
    signalType: payload.signalType,
    metadata: {
      ...payload.metadata,
      hotelDepartment: payload.department,
    },
    signalTimestamp: payload.timestamp,
    receivedAt: new Date().toISOString(),
  };
}

/**
 * Creates an event record for the events table
 */
export interface InventorySignalEvent {
  type: 'inventory.signal.received';
  source: 'hotel-pms';
  payload: HotelPMSInventoryPayload;
  merchantId: string;
  productId: string;
  severity: 'low' | 'critical' | 'out_of_stock';
  timestamp: string;
}

/**
 * Maps Hotel PMS payload to event record format
 */
export function mapHotelPMSToEvent(
  payload: HotelPMSInventoryPayload
): InventorySignalEvent {
  return {
    type: 'inventory.signal.received',
    source: 'hotel-pms',
    payload,
    merchantId: payload.merchantId,
    productId: payload.itemId,
    severity: payload.severity,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Validates and parses Hotel PMS payload
 * @throws ZodError if validation fails
 */
export function validateHotelPMSPayload(data: unknown): HotelPMSInventoryPayload {
  return HotelPMSInventoryPayloadSchema.parse(data);
}

/**
 * Safe validation that returns result instead of throwing
 */
export function validateHotelPMSPayloadSafe(
  data: unknown
): { success: true; data: HotelPMSInventoryPayload } | { success: false; error: z.ZodError } {
  const result = HotelPMSInventoryPayloadSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

/**
 * Hotel PMS webhook handler context
 */
export interface HotelPMSHandlerContext {
  supabaseUrl: string;
  supabaseServiceKey: string;
}

export interface HotelPMSHandlerResult {
  success: boolean;
  signalId?: string;
  eventId?: string;
  error?: string;
}

/**
 * Process a Hotel PMS inventory signal webhook
 *
 * @param payload - The validated Hotel PMS payload
 * @param context - Database connection context
 * @returns Result with signal and event IDs
 */
export async function handleHotelPMSInventorySignal(
  payload: HotelPMSInventoryPayload,
  context: HotelPMSHandlerContext
): Promise<HotelPMSHandlerResult> {
  try {
    // Import Supabase dynamically to avoid issues if not installed
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(context.supabaseUrl, context.supabaseServiceKey);

    // Map to internal format
    const inventorySignal = mapHotelPMSToInventorySignal(payload);
    const eventRecord = mapHotelPMSToEvent(payload);

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
    console.error('Hotel PMS handler error:', message);
    return {
      success: false,
      error: message,
    };
  }
}
