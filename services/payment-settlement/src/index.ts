import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as crypto from 'crypto';
import * as z from 'zod';

// Environment variables
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Zod Schemas for validation
const PaymentMethodSchema = z.enum(['net_terms', 'bnpl', 'prepaid']);
const PaymentStatusSchema = z.enum(['pending', 'processing', 'paid', 'failed', 'refunded', 'overdue']);

type PaymentMethod = z.infer<typeof PaymentMethodSchema>;
type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

// Database row types
interface PurchaseOrderRow {
  id: string;
  merchant_id: string;
  supplier_id: string;
  net_amount: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  expected_delivery: string;
  tenor_days?: number;
  status: string;
  created_at: string;
  updated_at: string;
}

interface CreditLineRow {
  id: string;
  merchant_id: string;
  credit_limit: number;
  utilized: number;
  available: number;
  status: string;
  expires_at?: string;
  created_at: string;
  updated_at: string;
}

interface PaymentWebhookPayload {
  event: string;
  payload: {
    payment: {
      entity: {
        id: string;
        order_id: string;
        amount: number;
        currency: string;
        status: string;
        method?: string;
        UPI?: {
          vpa?: string;
        };
        bank?: {
          ifsc?: string;
          account_number?: string;
        };
      };
    };
  };
  created_at: number;
}

interface EventLogRow {
  id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

/**
 * Create Supabase client with service role key
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
 * Verify Razorpay webhook signature
 */
function verifyWebhookSignature(payload: string, signature: string): boolean {
  if (!RAZORPAY_KEY_SECRET) {
    console.warn('RAZORPAY_KEY_SECRET not set, skipping signature verification');
    return true;
  }

  const expectedSignature = crypto
    .createHmac('sha256', RAZORPAY_KEY_SECRET)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Log an event to the event_logs table
 */
async function logEvent(
  supabase: SupabaseClient,
  event: { event_type: string; payload: Record<string, unknown> }
): Promise<void> {
  const { error } = await supabase.from('event_logs').insert({
    event_type: event.event_type,
    payload: event.payload,
  });

  if (error) {
    console.error(`Failed to log event ${event.event_type}:`, error);
  }
}

/**
 * Check credit availability for a merchant
 */
export async function checkCreditAvailability(
  supabase: SupabaseClient,
  merchantId: string,
  amount: number
): Promise<{ available: boolean; creditLine?: CreditLineRow }> {
  // Get the merchant's credit line
  const { data: creditLine, error } = await supabase
    .from('credit_lines')
    .select('*')
    .eq('merchant_id', merchantId)
    .eq('status', 'active')
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No credit line found
      return { available: false };
    }
    throw new Error(`Failed to fetch credit line: ${error.message}`);
  }

  const credit = creditLine as CreditLineRow;

  // Check if credit line has expired
  if (credit.expires_at && new Date(credit.expires_at) < new Date()) {
    console.log(`Credit line ${credit.id} has expired`);
    return { available: false };
  }

  // Check if enough credit is available
  const availableCredit = credit.available ?? (credit.credit_limit - credit.utilized);
  const isAvailable = availableCredit >= amount;

  return {
    available: isAvailable,
    creditLine: credit,
  };
}

/**
 * Settle BNPL payment - increment the credit line utilized amount
 */
export async function settleBNPLPayment(
  supabase: SupabaseClient,
  poId: string,
  amount: number
): Promise<void> {
  // Get the purchase order to find the merchant
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('merchant_id')
    .eq('id', poId)
    .single();

  if (poError) {
    throw new Error(`Failed to fetch purchase order: ${poError.message}`);
  }

  if (!po) {
    throw new Error(`Purchase order ${poId} not found`);
  }

  // Get the credit line
  const { data: creditLine, error: clError } = await supabase
    .from('credit_lines')
    .select('*')
    .eq('merchant_id', po.merchant_id)
    .eq('status', 'active')
    .single();

  if (clError) {
    throw new Error(`Failed to fetch credit line: ${clError.message}`);
  }

  if (!creditLine) {
    throw new Error(`No active credit line found for merchant ${po.merchant_id}`);
  }

  const credit = creditLine as CreditLineRow;
  const newUtilized = credit.utilized + amount;
  const newAvailable = credit.credit_limit - newUtilized;

  // Update credit line
  const { error: updateError } = await supabase
    .from('credit_lines')
    .update({
      utilized: newUtilized,
      available: Math.max(0, newAvailable),
      updated_at: new Date().toISOString(),
    })
    .eq('id', credit.id);

  if (updateError) {
    throw new Error(`Failed to update credit line: ${updateError.message}`);
  }

  // Update purchase order payment status
  const { error: poUpdateError } = await supabase
    .from('purchase_orders')
    .update({
      payment_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('id', poId);

  if (poUpdateError) {
    throw new Error(`Failed to update purchase order: ${poUpdateError.message}`);
  }

  console.log(`BNPL payment settled for PO ${poId}: amount=${amount}, new utilized=${newUtilized}`);

  await logEvent(supabase, {
    event_type: 'payment.bnpl.settled',
    payload: {
      po_id: poId,
      merchant_id: po.merchant_id,
      credit_line_id: credit.id,
      amount,
      new_utilized: newUtilized,
    },
  });
}

/**
 * Initiate payment for a purchase order
 */
export async function initiatePayment(
  supabase: SupabaseClient,
  poId: string
): Promise<{ success: boolean; paymentUrl?: string; error?: string }> {
  // Fetch the purchase order
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', poId)
    .single();

  if (poError) {
    return { success: false, error: `Failed to fetch purchase order: ${poError.message}` };
  }

  if (!po) {
    return { success: false, error: `Purchase order ${poId} not found` };
  }

  const purchaseOrder = po as PurchaseOrderRow;

  try {
    switch (purchaseOrder.payment_method) {
      case 'net_terms': {
        // NET_TERMS: Payment is pending until due date
        // No immediate action needed, just confirm initiation
        console.log(`NET_TERMS payment initiated for PO ${poId}`);

        await logEvent(supabase, {
          event_type: 'payment.net_terms.initiated',
          payload: {
            po_id: poId,
            merchant_id: purchaseOrder.merchant_id,
            net_amount: purchaseOrder.net_amount,
            tenor_days: purchaseOrder.tenor_days ?? 30,
          },
        });

        return { success: true };
      }

      case 'bnpl': {
        // BNPL: Check credit availability
        const { available, creditLine } = await checkCreditAvailability(
          supabase,
          purchaseOrder.merchant_id,
          purchaseOrder.net_amount
        );

        if (!available || !creditLine) {
          return {
            success: false,
            error: 'Insufficient credit line or no active credit line found',
          };
        }

        // Settle the BNPL payment
        await settleBNPLPayment(supabase, poId, purchaseOrder.net_amount);

        return { success: true };
      }

      case 'prepaid': {
        // PREPAID: Generate payment URL (Razorpay)
        // In a real implementation, this would create a Razorpay order
        const razorpayOrderId = `order_${crypto.randomUUID().replace(/-/g, '')}`;
        const paymentUrl = `https://api.razorpay.com/v1/checkout/embedded/${razorpayOrderId}`;

        // Update PO status
        await supabase
          .from('purchase_orders')
          .update({
            payment_status: 'processing',
            updated_at: new Date().toISOString(),
          })
          .eq('id', poId);

        await logEvent(supabase, {
          event_type: 'payment.prepaid.initiated',
          payload: {
            po_id: poId,
            merchant_id: purchaseOrder.merchant_id,
            razorpay_order_id: razorpayOrderId,
            amount: purchaseOrder.net_amount,
          },
        });

        console.log(`PREPAID payment initiated for PO ${poId}: ${paymentUrl}`);
        return { success: true, paymentUrl };
      }

      default:
        return { success: false, error: `Unknown payment method: ${purchaseOrder.payment_method}` };
    }
  } catch (err) {
    const error = err as Error;
    console.error(`Payment initiation failed for PO ${poId}:`, error);
    return { success: false, error: error.message };
  }
}

/**
 * Handle payment webhook from Razorpay/UPI
 */
export async function handlePaymentWebhook(
  supabase: SupabaseClient,
  payload: PaymentWebhookPayload,
  signature?: string
): Promise<void> {
  // Verify webhook signature if provided
  if (signature) {
    const payloadStr = JSON.stringify(payload);
    if (!verifyWebhookSignature(payloadStr, signature)) {
      throw new Error('Invalid webhook signature');
    }
  }

  const paymentEntity = payload.payload.payment.entity;
  const razorpayPaymentId = paymentEntity.id;
  const razorpayOrderId = paymentEntity.order_id;
  const paymentStatus = paymentEntity.status;

  console.log(`Processing webhook: event=${payload.event}, payment_id=${razorpayPaymentId}, status=${paymentStatus}`);

  // Find the purchase order by razorpay order_id
  // In a real implementation, we'd store the razorpay order_id in the PO
  const { data: po, error: poError } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('razorpay_order_id', razorpayOrderId)
    .single();

  if (poError) {
    // Try to find by payment reference
    const { data: poByRef } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('payment_reference', razorpayPaymentId)
      .single();

    if (!poByRef) {
      console.warn(`Purchase order not found for payment ${razorpayPaymentId}`);
      return;
    }

    await processPaymentStatusUpdate(supabase, poByRef as PurchaseOrderRow, paymentStatus, razorpayPaymentId);
    return;
  }

  if (po) {
    await processPaymentStatusUpdate(supabase, po as PurchaseOrderRow, paymentStatus, razorpayPaymentId);
  }
}

/**
 * Process payment status update based on Razorpay status
 */
async function processPaymentStatusUpdate(
  supabase: SupabaseClient,
  purchaseOrder: PurchaseOrderRow,
  razorpayStatus: string,
  razorpayPaymentId: string
): Promise<void> {
  let newStatus: PaymentStatus;
  let eventType: string;

  switch (razorpayStatus) {
    case 'captured':
    case 'authorized':
      newStatus = 'paid';
      eventType = 'payment.completed';
      break;
    case 'failed':
      newStatus = 'failed';
      eventType = 'payment.failed';
      break;
    case 'refunded':
      newStatus = 'refunded';
      eventType = 'payment.refunded';
      break;
    case 'pending':
    default:
      newStatus = 'processing';
      eventType = 'payment.processing';
  }

  // Update purchase order
  const { error: updateError } = await supabase
    .from('purchase_orders')
    .update({
      payment_status: newStatus,
      payment_reference: razorpayPaymentId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', purchaseOrder.id);

  if (updateError) {
    throw new Error(`Failed to update purchase order: ${updateError.message}`);
  }

  await logEvent(supabase, {
    event_type: eventType,
    payload: {
      po_id: purchaseOrder.id,
      merchant_id: purchaseOrder.merchant_id,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_status: razorpayStatus,
      new_payment_status: newStatus,
    },
  });

  console.log(`Payment status updated for PO ${purchaseOrder.id}: ${newStatus}`);
}

/**
 * Check for overdue payments and update their status
 */
export async function checkOverduePayments(
  supabase: SupabaseClient
): Promise<{ overduePOs: PurchaseOrderRow[] }> {
  const now = new Date();

  // Find NET_TERMS purchase orders that are past due
  // Due date = expected_delivery + tenor_days
  const { data: overdueOrders, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('payment_method', 'net_terms')
    .eq('payment_status', 'pending')
    .eq('status', 'delivered'); // Only orders that have been delivered

  if (error) {
    throw new Error(`Failed to fetch overdue orders: ${error.message}`);
  }

  const orders = (overdueOrders || []) as PurchaseOrderRow[];
  const overduePOs: PurchaseOrderRow[] = [];

  for (const order of orders) {
    const expectedDelivery = new Date(order.expected_delivery);
    const tenorDays = order.tenor_days ?? 30;
    const dueDate = new Date(expectedDelivery.getTime() + tenorDays * 24 * 60 * 60 * 1000);

    if (now > dueDate) {
      overduePOs.push(order);

      // Update status to overdue
      await supabase
        .from('purchase_orders')
        .update({
          payment_status: 'overdue',
          updated_at: now.toISOString(),
        })
        .eq('id', order.id);

      await logEvent(supabase, {
        event_type: 'payment.overdue.detected',
        payload: {
          po_id: order.id,
          merchant_id: order.merchant_id,
          due_date: dueDate.toISOString(),
          days_overdue: Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)),
        },
      });

      console.log(`Payment overdue for PO ${order.id}: due ${dueDate.toISOString()}`);
    }
  }

  console.log(`Found ${overduePOs.length} overdue payments`);
  return { overduePOs };
}

/**
 * Send payment reminder for upcoming due dates
 */
async function sendPaymentReminders(supabase: SupabaseClient): Promise<void> {
  const now = new Date();
  const reminderWindow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days from now

  // Find NET_TERMS orders due within 3 days
  const { data: upcomingOrders, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('payment_method', 'net_terms')
    .eq('payment_status', 'pending')
    .eq('status', 'delivered');

  if (error) {
    throw new Error(`Failed to fetch upcoming orders: ${error.message}`);
  }

  const orders = (upcomingOrders || []) as PurchaseOrderRow[];

  for (const order of orders) {
    const expectedDelivery = new Date(order.expected_delivery);
    const tenorDays = order.tenor_days ?? 30;
    const dueDate = new Date(expectedDelivery.getTime() + tenorDays * 24 * 60 * 60 * 1000);

    if (dueDate <= reminderWindow && dueDate > now) {
      // Send reminder
      await logEvent(supabase, {
        event_type: 'payment.reminder.sent',
        payload: {
          po_id: order.id,
          merchant_id: order.merchant_id,
          due_date: dueDate.toISOString(),
          days_until_due: Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        },
      });

      console.log(`Payment reminder sent for PO ${order.id}: due in ${Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))} days`);
    }
  }
}

/**
 * Main entry point for payment settlement service
 */
async function main(): Promise<void> {
  console.log('Starting Payment Settlement Service...');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  const supabase = createSupabaseClient();

  try {
    // Check for overdue payments
    const overdueResult = await checkOverduePayments(supabase);
    console.log(`\nOverdue payments: ${overdueResult.overduePOs.length}`);

    // Send reminders for upcoming due dates
    await sendPaymentReminders(supabase);

  } catch (error) {
    console.error('Payment Settlement Service failed:', error);
    process.exit(1);
  }

  console.log('Payment Settlement Service exiting...');
}
