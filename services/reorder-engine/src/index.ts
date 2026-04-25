import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Zod Schemas matching DB CHECK constraints
// DB: severity CHECK IN ('low', 'medium', 'high', 'critical')
const InventorySignalSeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
// DB: signal_type CHECK IN ('low_stock', 'out_of_stock', 'expiring', 'overstock', 'movement')
const InventorySignalTypeSchema = z.enum(['low_stock', 'out_of_stock', 'expiring', 'overstock', 'movement']);
// DB: status CHECK IN ('pending', 'matched', 'po_created', 'dismissed')
const ReorderSignalStatusSchema = z.enum(['pending', 'matched', 'po_created', 'dismissed']);
// DB: urgency CHECK IN ('low', 'medium', 'high', 'urgent')
const UrgencySchema = z.enum(['low', 'medium', 'high', 'urgent']);

type InventorySignalSeverity = z.infer<typeof InventorySignalSeveritySchema>;
type InventorySignalType = z.infer<typeof InventorySignalTypeSchema>;
type ReorderSignalStatus = z.infer<typeof ReorderSignalStatusSchema>;
type Urgency = z.infer<typeof UrgencySchema>;

// Database row types (matching actual Supabase schema columns)
interface InventorySignalRow {
  id: string;
  merchant_id: string;
  source: string;
  source_product_id: string;
  source_merchant_id: string;
  product_name: string;
  sku?: string;
  current_stock: number;
  threshold: number;
  unit: string;
  category?: string;
  severity: InventorySignalSeverity;
  signal_type: InventorySignalType;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface ReorderSignalRow {
  id: string;
  merchant_id: string;
  inventory_signal_id?: string;
  suggested_qty?: number;
  urgency: Urgency;
  status: ReorderSignalStatus;
  match_confidence?: number;
  created_at: string;
  updated_at: string;
}

interface SupplierProductRow {
  id: string;
  supplier_id: string;
  category_id?: string;
  name: string;
  sku?: string;
  description?: string;
  unit: string;
  moq: number;
  price: number;
  bulk_pricing?: { min_qty: number; price: number }[];
  images?: string[];
  is_active: boolean;
  delivery_days?: number;
  created_at: string;
  updated_at: string;
}

interface SupplierRow {
  id: string;
  business_name: string;
  gst_number?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  categories: string[];
  rating: number;
  is_verified: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
    case 'critical':
      // If stock is less than 50% of threshold, it's urgent
      if (signal.current_stock < signal.threshold * 0.5) {
        return 'urgent';
      }
      return 'high';
    case 'high':
      return 'high';
    case 'low':
    case 'medium':
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
  const priceScore = Math.max(0, 1 - (product.price / 10000));

  // Supplier rating score: 0-5 scale, higher is better
  const ratingScore = (supplier.rating ?? 3) / 5;

  // Delivery score: assume max delivery days is 30, lower is better
  const deliveryDays = product.delivery_days ?? 14;
  const deliveryScore = Math.max(0, 1 - (deliveryDays / 30));

  // Availability bonus
  const availabilityScore = product.is_active ? 0.2 : 0;

  // Weighted combination
  return (priceScore * 0.4) + (ratingScore * 0.35) + (deliveryScore * 0.2) + (availabilityScore * 0.05);
}

interface ScoredProduct extends SupplierProductRow {
  matchScore: number;
}

/**
 * Match a reorder signal to suitable supplier products using fuzzy matching
 */
export async function matchToProducts(
  supabase: SupabaseClient,
  _signal: ReorderSignalRow,
  productName: string,
  supplierIds?: string[]
): Promise<ScoredProduct[]> {
  // Search for products matching the signal's product name
  // Using ilike for case-insensitive partial matching
  const searchTerm = `%${productName.toLowerCase()}%`;

  let query = supabase
    .from('supplier_products')
    .select('*, suppliers:supplier_id(id, business_name, rating, is_active)')
    .or(`name.ilike.${searchTerm},description.ilike.${searchTerm}`)
    .eq('is_active', true)
    .limit(20);

  if (supplierIds && supplierIds.length > 0) {
    query = query.in('supplier_id', supplierIds);
  }

  const { data: products, error } = await query;

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
      matchScore: scoreProductMatch(product, (product as { suppliers?: SupplierRow }).suppliers as SupplierRow),
    }))
    .sort((a, b) => b.matchScore - a.matchScore);

  // Take top 3 matches
  return scoredProducts.slice(0, 3);
}

/**
 * Log an event to the events table
 * Note: events table only has: id, type, source, payload, created_at
 */
export async function logEvent(
  supabase: SupabaseClient,
  event: { event_type: string; payload: Record<string, unknown>; source?: string }
): Promise<void> {
  const { error } = await supabase
    .from('events')
    .insert({
      type: event.event_type,
      source: event.source ?? 'reorder-engine',
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

  // Step 1: Query all pending inventory signals with low_stock type
  // Map incoming signal types to our processing types
  const { data: signals, error: signalsError } = await supabase
    .from('inventory_signals')
    .select('*')
    .in('signal_type', ['low_stock', 'out_of_stock'])
    .in('severity', ['low', 'medium', 'high', 'critical']);

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
        .eq('inventory_signal_id', inventorySignal.id)
        .eq('status', 'pending')
        .limit(1);

      if (existingSignals && existingSignals.length > 0) {
        console.log(`Reorder signal already exists for signal ${inventorySignal.id}, skipping`);
        continue;
      }

      // Calculate suggested quantity and urgency
      const suggestedQty = calculateSuggestedQty(inventorySignal);
      const urgency = determineUrgency(inventorySignal);

      // Insert the reorder signal
      // DB columns: merchant_id, inventory_signal_id, suggested_qty, urgency, status
      const reorderSignalData = {
        merchant_id: inventorySignal.merchant_id,
        inventory_signal_id: inventorySignal.id,
        suggested_qty: suggestedQty,
        urgency,
        status: 'pending' as const,
      };

      const { data: insertResult, error: insertError } = await supabase
        .from('reorder_signals')
        .insert(reorderSignalData)
        .select('id')
        .single();

      if (insertError) {
        console.error(`Failed to insert reorder signal for signal ${inventorySignal.id}:`, insertError);
        continue;
      }

      const reorderSignalId = insertResult?.id;
      created++;
      console.log(`Created reorder signal ${reorderSignalId} for product ${inventorySignal.product_name} (qty: ${suggestedQty}, urgency: ${urgency})`);

      // Log the event
      await logEvent(supabase, {
        event_type: 'reorder.signal.created',
        source: 'reorder-engine',
        payload: {
          signal_id: reorderSignalId,
          inventory_signal_id: inventorySignal.id,
          product_name: inventorySignal.product_name,
          suggested_qty: suggestedQty,
          urgency,
          current_stock: inventorySignal.current_stock,
          threshold: inventorySignal.threshold,
        },
      });

      // Step 3: Match to supplier products
      const matchedProducts = await matchToProducts(
        supabase,
        { id: reorderSignalId!, merchant_id: inventorySignal.merchant_id, urgency, status: 'pending' } as ReorderSignalRow,
        inventorySignal.product_name
      );

      if (matchedProducts.length > 0) {
        const avgConfidence = matchedProducts.reduce((sum, p) => sum + p.matchScore, 0) / matchedProducts.length;

        // Update the reorder signal with matches
        const { error: updateError } = await supabase
          .from('reorder_signals')
          .update({
            status: 'matched',
            match_confidence: avgConfidence,
            updated_at: new Date().toISOString(),
          })
          .eq('id', reorderSignalId);

        if (!updateError) {
          matched++;
          console.log(`Matched reorder signal ${reorderSignalId} to ${matchedProducts.length} suppliers`);

          // Log the match event
          await logEvent(supabase, {
            event_type: 'reorder.signal.matched',
            source: 'reorder-engine',
            payload: {
              signal_id: reorderSignalId,
              inventory_signal_id: inventorySignal.id,
              matched_supplier_count: matchedProducts.length,
              match_confidence: avgConfidence,
            },
          });
        }
      }

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
