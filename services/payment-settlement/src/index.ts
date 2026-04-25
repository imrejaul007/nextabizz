import { z } from 'zod';

export const PaymentStatusSchema = z.enum(['pending', 'processing', 'completed', 'failed', 'refunded']);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const SettlementStatusSchema = z.enum(['pending', 'calculated', 'approved', 'paid', 'failed']);
export type SettlementStatus = z.infer<typeof SettlementStatusSchema>;

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number().positive(),
  currency: z.string().default('USD'),
  status: PaymentStatusSchema,
  stripePaymentIntentId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Payment = z.infer<typeof PaymentSchema>;

export const SettlementSchema = z.object({
  id: z.string().uuid(),
  supplierId: z.string().uuid(),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  grossAmount: z.number(),
  deductions: z.number(),
  netAmount: z.number(),
  status: SettlementStatusSchema,
  paidAt: z.string().datetime().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Settlement = z.infer<typeof SettlementSchema>;

export interface DeductionBreakdown {
  platformFee: number;
  transactionFees: number;
  chargebacks: number;
  returns: number;
  otherDeductions: number;
}

export class PaymentSettlementService {
  private readonly PLATFORM_FEE_RATE = 0.025; // 2.5%

  calculatePlatformFee(amount: number): number {
    return amount * this.PLATFORM_FEE_RATE;
  }

  calculateTransactionFee(amount: number): number {
    return amount * 0.029 + 0.30; // Stripe's standard rate
  }

  calculateNetAmount(
    grossAmount: number,
    deductions: DeductionBreakdown
  ): number {
    const totalDeductions =
      deductions.platformFee +
      deductions.transactionFees +
      deductions.chargebacks +
      deductions.returns +
      deductions.otherDeductions;

    return grossAmount - totalDeductions;
  }

  generateSettlement(
    supplierId: string,
    grossAmount: number,
    periodStart: Date,
    periodEnd: Date,
    deductions: DeductionBreakdown
  ): Settlement {
    const netAmount = this.calculateNetAmount(grossAmount, deductions);

    return {
      id: crypto.randomUUID(),
      supplierId,
      periodStart: periodStart.toISOString(),
      periodEnd: periodEnd.toISOString(),
      grossAmount,
      deductions: Object.values(deductions).reduce((a, b) => a + b, 0),
      netAmount,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  processPayment(orderId: string, amount: number): Payment {
    return {
      id: crypto.randomUUID(),
      orderId,
      amount,
      currency: 'USD',
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
}

export const paymentSettlementService = new PaymentSettlementService();
