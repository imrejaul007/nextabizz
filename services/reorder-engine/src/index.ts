import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Zod Schemas for type safety
const InventorySignalSeveritySchema = z.enum(['low', 'critical', 'out_of_stock', 'forecast_deficit']);
const InventorySignalStatusSchema = z.enum(['pending', 'threshold_breach', 'resolved']);
const ReorderSignalStatusSchema = z.enum(['pending', 'matched', 'ordered', 'cancelled']);
const UrgencySchema = z.enum(['high', 'medium', 'low']);

type InventorySignalSeverity = z.infer<typeof InventorySignalSeveritySchema>;
type InventorySignalStatus = z.infer<typeof InventorySignalStatusSchema>;
type ReorderSignalStatus = z.infer<typeof ReorderSignalStatusSchema>;
type Urgency = z.infer<typeof UrgencySchema>;

// Database row types (matching Supabase schema)
interface InventorySignalRow {
  id: string;
  product_id: string;
  product_name: string;
  current_stock: number;
  threshold: number;
  severity: InventorySignalSeverity;
  status: InventorySignalStatus;
  forecast_deficit_days?: number;
  created_at: string;
  updated_at: string;
}

interface ReorderSignalRow {
  id: string;
  product_id: string;
  product_name: string;
  suggested_qty: number;
  urgency: Urgency;
  status: ReorderSignalStatus;
  match_confidence?: number;
  matched_supplier_ids?: string[];
  created_at: string;
  updated_at: string;
}

interface SupplierProductRow {
  id: string;
  supplier_id: string;
  name: string;
  description?: string;
  unit_price: number;
  min_order_qty?: number;
  delivery_days?: number;
  in_stock: boolean;
  suppliers?: {
    id: string;
    name: string;
    rating?: number;
    status: string;
  };
}

interface SupplierRow {
  id: string;
  name: string;
  rating?: number;
  status: string;
}

interface EventLogRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Calculate suggested reorder quantity using par-level approach
 * Target: threshold * 2 (par level), then subtract current stock
 */
export function calculateSuggestedQty(signal: InventorySignalRow): number {
  const parLevel = signal.threshold * 2;
  const suggestedQty = parLevel - signal.current_stock;
  return Math.max(suggestedQty, 0);
}

/**
 * Determine urgency level based on signal severity and stock levels
 */
export function determineUrgency(signal: InventorySignalRow): Urgency {
  switch (signal.severity) {
    case 'out_of_stock':
      return 'high';
    case 'critical':
      // If stock is less than 50% of threshold, it's high urgency
      if (signal.current_stock < signal.threshold * 0.5) {
        return 'high';
      }
      return 'medium';
    case 'low':
      return 'medium';
    case 'forecast_deficit':
      return 'low';
    default:
      return 'medium';
  }
}

/**
 * Score a product-supplier match based on multiple factors
 * Higher score = better match
 */
export function scoreProductMatch(
  product: SupplierProductRow,
  supplier: SupplierRow
): number {
  // Price score: normalize to 0-1, lower price = higher score
  // Assuming max reasonable price is 10000
  const priceScore = Math.max(0, 1 - (product.unit_price / 10000));

  // Supplier rating score: 0-5 scale, higher is better
  const ratingScore = (supplier.rating ?? 3) / 5;

  // Delivery score: assume max delivery days is 30, lower is better
  const deliveryDays = product.delivery_days ?? 14;
  const deliveryScore = Math.max(0, 1 - (deliveryDays / 30));

  // Availability bonus
  const availabilityScore = product.in_stock ? 0.2 : 0;

  // Weighted combination
  return (priceScore * 0.4) + (ratingScore * 0.35) + (deliveryScore * 0.2) + (availabilityScore * 0.05);
}

/**
 * Match a reorder signal to suitable supplier products using fuzzy matching
 */
export async function matchToProducts(
  supabase: SupabaseClient,
  signal: ReorderSignalRow,
  productName: string
): Promise<SupplierProductRow[]> {
  // Search for products matching the signal's product name
  // Using ilike for case-insensitive partial matching
  const searchTerm = `%${productName.toLowerCase()}%`;

  const { data: products, error } = await supabase
    .from('supplier_products')
    .select(`
      *,
      suppliers:supplier_id (
        id,
        name,
        rating,
        status
      )
    `)
    .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
    .eq('in_stock', true)
    .limit(20);

  if (error) {
    console.error('Error fetching supplier products:', error);
    throw new Error(`Failed to fetch supplier products: ${error.message}`);
  }

  if (!products || products.length === 0) {
    console.log(`No supplier products found matching: ${productName}`);
    return [];
  }

  // Score each product and sort by score
  const scoredProducts = products
    .map((product) => ({
      ...product,
      score: scoreProductMatch(product, product.suppliers as SupplierRow),
    }))
    .sort((a, b) => b.score - a.score);

  // Take top 3 matches
  return scoredProducts.slice(0, 3);
}

/**
 * Log an event to the event_logs table
 */
export async function logEvent(
  supabase: SupabaseClient,
  event: { event_type: string; payload: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase
    .from('event_logs')
    .insert({
      event_type: event.event_type,
      payload: event.payload,
    });

  if (error) {
    console.error(`Failed to log event ${event.event_type}:`, error);
    // Don't throw - logging failure shouldn't break the main flow
  }
}

/**
 * Process all pending inventory signals and generate reorder signals
 */
export async function processPendingSignals(
  supabase: SupabaseClient
): Promise<{ created: number; matched: number }> {
  let created = 0;
  let matched = 0;

  // Step 1: Query all pending inventory signals with threshold_breach status
  const { data: signals, error: signalsError } = await supabase
    .from('inventory_signals')
    .select('*')
    .eq('status', 'threshold_breach')
    .in('severity', ['low', 'critical', 'out_of_stock', 'forecast_deficit']);

  if (signalsError) {
    console.error('Error fetching inventory signals:', signalsError);
    throw new Error(`Failed to fetch inventory signals: ${signalsError.message}`);
  }

  if (!signals || signals.length === 0) {
    console.log('No pending inventory signals to process');
    return { created: 0, matched: 0 };
  }

  console.log(`Processing ${signals.length} pending inventory signals...`);

  // Step 2: For each signal, create a reorder signal
  for (const signal of signals) {
    try {
      const inventorySignal = signal as InventorySignalRow;

      // Check if a reorder signal already exists for this inventory signal
      const { data: existingSignals } = await supabase
        .from('reorder_signals')
        .select('id')
        .eq('product_id', inventorySignal.product_id)
        .eq('status', 'pending')
        .limit(1);

      if (existingSignals && existingSignals.length > 0) {
        console.log(`Reorder signal already exists for product ${inventorySignal.product_id}, skipping`);
        continue;
      }

      // Calculate suggested quantity and urgency
      const suggestedQty = calculateSuggestedQty(inventorySignal);
      const urgency = determineUrgency(inventorySignal);

      // Insert the reorder signal
      const reorderSignal = {
        id: crypto.randomUUID(),
        product_id: inventorySignal.product_id,
        product_name: inventorySignal.product_name,
        suggested_qty: suggestedQty,
        urgency,
        status: 'pending',
      };

      const { error: insertError } = await supabase
        .from('reorder_signals')
        .insert(reorderSignal);

      if (insertError) {
        console.error(`Failed to insert reorder signal for product ${inventorySignal.product_id}:`, insertError);
        continue;
      }

      created++;
      console.log(`Created reorder signal for product ${inventorySignal.product_name} (qty: ${suggestedQty}, urgency: ${urgency})`);

      // Log the event
      await logEvent(supabase, {
        event_type: 'reorder.signal.created',
        payload: {
          signal_id: reorderSignal.id,
          product_id: inventorySignal.product_id,
          product_name: inventorySignal.product_name,
          suggested_qty: suggestedQty,
          urgency,
          current_stock: inventorySignal.current_stock,
          threshold: inventorySignal.threshold,
        },
      });

      // Step 3: Match to supplier products
      const matchedProducts = await matchToProducts(supabase, reorderSignal as ReorderSignalRow, inventorySignal.product_name);

      if (matchedProducts.length > 0) {
        const matchedSupplierIds = matchedProducts.map((p) => p.supplier_id);
        const avgConfidence = matchedProducts.reduce((sum, p) => sum + (p as any).score, 0) / matchedProducts.length;

        // Update the reorder signal with matches
        const { error: updateError } = await supabase
          .from('reorder_signals')
          .update({
            status: 'matched',
            match_confidence: avgConfidence,
            matched_supplier_ids: matchedSupplierIds,
            updated_at: new Date().toISOString(),
          })
          .eq('id', reorderSignal.id);

        if (!updateError) {
          matched++;
          console.log(`Matched reorder signal ${reorderSignal.id} to ${matchedProducts.length} suppliers`);

          // Log the match event
          await logEvent(supabase, {
            event_type: 'reorder.signal.matched',
            payload: {
              signal_id: reorderSignal.id,
              product_id: inventorySignal.product_id,
              matched_supplier_count: matchedProducts.length,
              match_confidence: avgConfidence,
              matched_supplier_ids: matchedSupplierIds,
            },
          });
        }
      }

      // Mark the inventory signal as resolved
      await supabase
        .from('inventory_signals')
        .update({ status: 'resolved', updated_at: new Date().toISOString() })
        .eq('id', inventorySignal.id);

    } catch (err) {
      console.error(`Error processing signal ${signal.id}:`, err);
      // Continue processing other signals
    }
  }

  console.log(`Processing complete: ${created} reorder signals created, ${matched} matched`);
  return { created, matched };
}

/**
 * Initialize the Supabase client
 */
function createSupabaseClient(): SupabaseClient {
  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Main entry point for the reorder engine
 */
async function main(): Promise<void> {
  console.log('Starting Reorder Engine...');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const supabase = createSupabaseClient();

  try {
    const result = await processPendingSignals(supabase);
    console.log(`\nReorder Engine completed successfully:`);
    console.log(`  - Signals created: ${result.created}`);
    console.log(`  - Signals matched: ${result.matched}`);
  } catch (error) {
    console.error('Reorder Engine failed:', error);
    process.exit(1);
  }

  console.log('Reorder Engine exiting...');
}

// Run if executed directly
if (require.main === module) {
  main().catch((err) => {
    console.error('Unhandled error:', err);
    process.exit(1);
  });
}

// Export for use as a module
export { createSupabaseClient, main };
