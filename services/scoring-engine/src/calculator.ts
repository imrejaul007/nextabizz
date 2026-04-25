import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Input data for calculating supplier scores
 */
export interface ScoreInputs {
  totalOrders: number;
  onTimeDeliveries: number;       // PO.status='received' AND actual_delivery <= expected_delivery
  lateDeliveries: number;
  partialDeliveries: number;      // status='partial'
  rejectedOrders: number;        // status='cancelled'
  avgLeadTime: number;           // avg of (actual_delivery - created_at) in days
  rfqResponses: number;          // count of rfq_responses
  totalRFQs: number;             // count of rfqs that expired or were awarded
  priceChanges: number;           // count of PO items where unit_price != original quoted price
}

/**
 * Output supplier score record
 */
export interface SupplierScore {
  id: string;
  supplier_id: string;
  overall_score: number;         // 0-5 scale
  on_time_rate: number;          // 0-1
  quality_rate: number;           // 0-1
  price_consistency: number;      // 0-1
  response_rate: number;          // 0-1
  avg_lead_time_score: number;    // 0-1
  credit_boost: number;          // 0-0.3
  period_start: string;
  period_end: string;
  calculated_at: string;
}

/**
 * Database row types
 */
interface PurchaseOrderRow {
  id: string;
  supplier_id: string;
  status: string;
  created_at: string;
  expected_delivery: string;
  actual_delivery?: string;
}

interface PurchaseOrderItemRow {
  id: string;
  purchase_order_id: string;
  unit_price: number;
  quoted_price?: number;
}

interface RFQRow {
  id: string;
  status: string;
  expires_at: string;
}

interface RFQResponseRow {
  id: string;
  rfq_id: string;
  supplier_id: string;
  created_at: string;
}

interface SupplierScoreRow {
  id: string;
  supplier_id: string;
  overall_score: number;
  on_time_rate: number;
  quality_rate: number;
  price_consistency: number;
  response_rate: number;
  avg_lead_time_score: number;
  credit_boost: number;
  period_start: string;
  period_end: string;
  calculated_at: string;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Collect all scoring inputs for a supplier within a time period
 */
async function collectScoreInputs(
  supabase: SupabaseClient,
  supplierId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ScoreInputs> {
  const startStr = periodStart.toISOString();
  const endStr = periodEnd.toISOString();

  // Fetch all purchase orders for this supplier in the period
  const { data: purchaseOrders, error: poError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('supplier_id', supplierId)
    .gte('created_at', startStr)
    .lte('created_at', endStr);

  if (poError) {
    throw new Error(`Failed to fetch purchase orders: ${poError.message}`);
  }

  const orders = (purchaseOrders || []) as PurchaseOrderRow[];

  // Count orders by status
  const totalOrders = orders.length;
  const receivedOrders = orders.filter((o) => o.status === 'received');
  const partialOrders = orders.filter((o) => o.status === 'partial');
  const cancelledOrders = orders.filter((o) => o.status === 'cancelled');

  // Calculate on-time deliveries
  let onTimeDeliveries = 0;
  let lateDeliveries = 0;
  let totalLeadTimeDays = 0;
  let leadTimeCount = 0;

  for (const order of receivedOrders) {
    if (order.actual_delivery && order.expected_delivery) {
      const actualDate = new Date(order.actual_delivery);
      const expectedDate = new Date(order.expected_delivery);

      if (actualDate <= expectedDate) {
        onTimeDeliveries++;
      } else {
        lateDeliveries++;
      }

      // Calculate lead time in days
      const createdDate = new Date(order.created_at);
      const leadTimeMs = actualDate.getTime() - createdDate.getTime();
      totalLeadTimeDays += leadTimeMs / (1000 * 60 * 60 * 24);
      leadTimeCount++;
    }
  }

  const avgLeadTime = leadTimeCount > 0 ? totalLeadTimeDays / leadTimeCount : 14; // Default to 14 days

  // Fetch RFQ responses for this supplier
  const { data: rfqResponses, error: rfqResponseError } = await supabase
    .from('rfq_responses')
    .select('rfq_id')
    .eq('supplier_id', supplierId)
    .gte('created_at', startStr)
    .lte('created_at', endStr);

  if (rfqResponseError) {
    throw new Error(`Failed to fetch RFQ responses: ${rfqResponseError.message}`);
  }

  const rfqResponsesList = (rfqResponses || []) as { rfq_id: string }[];
  const rfqResponsesCount = rfqResponsesList.length;

  // Fetch total RFQs that expired or were awarded (status: 'expired', 'awarded', or 'closed')
  const { data: rfqs, error: rfqError } = await supabase
    .from('rfqs')
    .select('id')
    .eq('status', 'expired')
    .or(`status.eq.awarded,status.eq.closed`)
    .gte('expires_at', startStr)
    .lte('expires_at', endStr);

  if (rfqError) {
    throw new Error(`Failed to fetch RFQs: ${rfqError.message}`);
  }

  const rfqsList = (rfqs || []) as RFQRow[];
  const totalRFQs = rfqsList.length;

  // Fetch price changes (PO items where unit_price != quoted_price)
  // We need to get PO items for all purchase orders in the period
  const orderIds = orders.map((o) => o.id);

  if (orderIds.length === 0) {
    return {
      totalOrders: 0,
      onTimeDeliveries: 0,
      lateDeliveries: 0,
      partialDeliveries: 0,
      rejectedOrders: 0,
      avgLeadTime: 14,
      rfqResponses: 0,
      totalRFQs: 0,
      priceChanges: 0,
    };
  }

  const { data: poItems, error: poItemsError } = await supabase
    .from('purchase_order_items')
    .select('unit_price, quoted_price')
    .in('purchase_order_id', orderIds);

  if (poItemsError) {
    throw new Error(`Failed to fetch PO items: ${poItemsError.message}`);
  }

  const items = (poItems || []) as PurchaseOrderItemRow[];
  const priceChanges = items.filter(
    (item) => item.quoted_price !== null && item.unit_price !== item.quoted_price
  ).length;

  return {
    totalOrders,
    onTimeDeliveries,
    lateDeliveries,
    partialDeliveries: partialOrders.length,
    rejectedOrders: cancelledOrders.length,
    avgLeadTime,
    rfqResponses: rfqResponsesCount,
    totalRFQs,
    priceChanges,
  };
}

/**
 * Calculate supplier score from inputs
 */
function calculateScore(inputs: ScoreInputs): Omit<SupplierScore, 'id' | 'supplier_id' | 'period_start' | 'period_end' | 'calculated_at'> {
  // Calculate component rates
  const onTimeRate = inputs.totalOrders > 0 ? inputs.onTimeDeliveries / inputs.totalOrders : 0;
  const qualityRate = inputs.totalOrders > 0 ? 1 - (inputs.rejectedOrders / inputs.totalOrders) : 1;
  const priceConsistency = inputs.totalOrders > 0 ? 1 - (inputs.priceChanges / inputs.totalOrders) : 1;
  const responseRate = inputs.totalRFQs > 0 ? inputs.rfqResponses / inputs.totalRFQs : 0;

  // Lead time score: better if <2 days, decays over 12 days
  // Score = 1 - (avgLeadTime - 2) / 10, clamped to [0, 1]
  const avgLeadTimeScore = clamp(1 - (inputs.avgLeadTime - 2) / 10, 0, 1);

  // Weighted overall score (0-5 scale)
  const weightedScore =
    onTimeRate * 0.25 +
    qualityRate * 0.25 +
    priceConsistency * 0.2 +
    responseRate * 0.15 +
    avgLeadTimeScore * 0.15;

  const overallScore = Math.round(weightedScore * 5 * 100) / 100; // Scale to 0-5, round to 2 decimals

  // Credit boost: 0-0.3 based on overall score
  const creditBoost = Math.round(clamp(overallScore / 5 * 0.3, 0, 0.3) * 100) / 100;

  return {
    overall_score: overallScore,
    on_time_rate: Math.round(onTimeRate * 100) / 100,
    quality_rate: Math.round(qualityRate * 100) / 100,
    price_consistency: Math.round(priceConsistency * 100) / 100,
    response_rate: Math.round(responseRate * 100) / 100,
    avg_lead_time_score: Math.round(avgLeadTimeScore * 100) / 100,
    credit_boost: creditBoost,
  };
}

/**
 * Calculate supplier score for a specific period and store in DB
 */
export async function calculateSupplierScore(
  supplierId: string,
  periodStart: Date,
  periodEnd: Date,
  supabase: SupabaseClient
): Promise<SupplierScore> {
  // Collect inputs
  const inputs = await collectScoreInputs(supabase, supplierId, periodStart, periodEnd);

  // Calculate scores
  const scores = calculateScore(inputs);

  // Create score record
  const scoreRecord: SupplierScore = {
    id: crypto.randomUUID(),
    supplier_id: supplierId,
    ...scores,
    period_start: periodStart.toISOString(),
    period_end: periodEnd.toISOString(),
    calculated_at: new Date().toISOString(),
  };

  // Upsert into supplier_scores table
  const { error: upsertError } = await supabase
    .from('supplier_scores')
    .upsert(
      {
        supplier_id: supplierId,
        overall_score: scoreRecord.overall_score,
        on_time_rate: scoreRecord.on_time_rate,
        quality_rate: scoreRecord.quality_rate,
        price_consistency: scoreRecord.price_consistency,
        response_rate: scoreRecord.response_rate,
        avg_lead_time_score: scoreRecord.avg_lead_time_score,
        credit_boost: scoreRecord.credit_boost,
        period_start: scoreRecord.period_start,
        period_end: scoreRecord.period_end,
        calculated_at: scoreRecord.calculated_at,
      },
      {
        onConflict: 'supplier_id,period_start,period_end',
      }
    );

  if (upsertError) {
    throw new Error(`Failed to upsert supplier score: ${upsertError.message}`);
  }

  console.log(
    `Calculated score for supplier ${supplierId}: overall=${scoreRecord.overall_score.toFixed(2)}/5, ` +
    `on_time=${(scoreRecord.on_time_rate * 100).toFixed(0)}%, quality=${(scoreRecord.quality_rate * 100).toFixed(0)}%, ` +
    `lead_time=${inputs.avgLeadTime.toFixed(1)} days`
  );

  return scoreRecord;
}

/**
 * Run monthly scoring for all active suppliers
 */
export async function runMonthlyScoring(
  supabase: SupabaseClient
): Promise<{ scored: number }> {
  // Calculate period: previous month
  const now = new Date();
  const periodEnd = new Date(now.getFullYear(), now.getMonth(), 0); // Last day of previous month
  const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1); // First day of previous month

  console.log(`Running monthly scoring for period: ${periodStart.toISOString()} to ${periodEnd.toISOString()}`);

  // Fetch all active suppliers
  const { data: suppliers, error: suppliersError } = await supabase
    .from('suppliers')
    .select('id, name')
    .eq('status', 'active');

  if (suppliersError) {
    throw new Error(`Failed to fetch suppliers: ${suppliersError.message}`);
  }

  if (!suppliers || suppliers.length === 0) {
    console.log('No active suppliers found');
    return { scored: 0 };
  }

  console.log(`Found ${suppliers.length} active suppliers`);

  let scored = 0;
  const errors: string[] = [];

  for (const supplier of suppliers) {
    try {
      await calculateSupplierScore(supplier.id, periodStart, periodEnd, supabase);
      scored++;

      // Log event
      await supabase.from('event_logs').insert({
        event_type: 'supplier.scored',
        payload: {
          supplier_id: supplier.id,
          supplier_name: supplier.name,
          period_start: periodStart.toISOString(),
          period_end: periodEnd.toISOString(),
        },
      });
    } catch (err) {
      const errorMsg = `Failed to score supplier ${supplier.id} (${supplier.name}): ${(err as Error).message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }

  if (errors.length > 0) {
    console.warn(`Scoring completed with ${errors.length} errors:`);
    errors.forEach((e) => console.warn(`  - ${e}`));
  }

  console.log(`Monthly scoring complete: ${scored}/${suppliers.length} suppliers scored`);
  return { scored };
}
