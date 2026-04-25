import { z } from 'zod';

export const SupplierScoreSchema = z.object({
  supplierId: z.string().uuid(),
  overallScore: z.number().min(0).max(100),
  deliveryScore: z.number().min(0).max(100),
  qualityScore: z.number().min(0).max(100),
  priceScore: z.number().min(0).max(100),
  reliabilityScore: z.number().min(0).max(100),
  calculatedAt: z.string().datetime(),
});

export type SupplierScore = z.infer<typeof SupplierScoreSchema>;

export const ProductScoreSchema = z.object({
  productId: z.string().uuid(),
  overallScore: z.number().min(0).max(100),
  popularityScore: z.number().min(0).max(100),
  marginScore: z.number().min(0).max(100),
  demandScore: z.number().min(0).max(100),
  calculatedAt: z.string().datetime(),
});

export type ProductScore = z.infer<typeof ProductScoreSchema>;

export interface SupplierMetrics {
  supplierId: string;
  onTimeDeliveryRate: number;
  qualityRating: number;
  averagePricePremium: number;
  orderFillRate: number;
  responseTimeHours: number;
  totalOrders: number;
}

export interface ProductMetrics {
  productId: string;
  salesVolume: number;
  profitMargin: number;
  demandTrend: number;
  returnRate: number;
  totalOrders: number;
}

export class ScoringEngine {
  private readonly WEIGHTS = {
    delivery: 0.3,
    quality: 0.3,
    price: 0.2,
    reliability: 0.2,
  };

  calculateSupplierScore(metrics: SupplierMetrics): SupplierScore {
    const deliveryScore = metrics.onTimeDeliveryRate * 100;
    const qualityScore = metrics.qualityRating * 100;
    const priceScore = Math.max(0, 100 - metrics.averagePricePremium * 10);
    const reliabilityScore = metrics.orderFillRate * 100;

    const overallScore =
      deliveryScore * this.WEIGHTS.delivery +
      qualityScore * this.WEIGHTS.quality +
      priceScore * this.WEIGHTS.price +
      reliabilityScore * this.WEIGHTS.reliability;

    return {
      supplierId: metrics.supplierId,
      overallScore: Math.round(overallScore * 100) / 100,
      deliveryScore: Math.round(deliveryScore * 100) / 100,
      qualityScore: Math.round(qualityScore * 100) / 100,
      priceScore: Math.round(priceScore * 100) / 100,
      reliabilityScore: Math.round(reliabilityScore * 100) / 100,
      calculatedAt: new Date().toISOString(),
    };
  }

  calculateProductScore(metrics: ProductMetrics): ProductScore {
    const popularityScore = Math.min(100, (metrics.salesVolume / 100) * 100);
    const marginScore = Math.min(100, metrics.profitMargin * 10);
    const demandScore = Math.max(0, Math.min(100, 50 + metrics.demandTrend * 10));
    const qualityScore = Math.max(0, 100 - metrics.returnRate * 100);

    const overallScore =
      popularityScore * 0.3 +
      marginScore * 0.3 +
      demandScore * 0.2 +
      qualityScore * 0.2;

    return {
      productId: metrics.productId,
      overallScore: Math.round(overallScore * 100) / 100,
      popularityScore: Math.round(popularityScore * 100) / 100,
      marginScore: Math.round(marginScore * 100) / 100,
      demandScore: Math.round(demandScore * 100) / 100,
      calculatedAt: new Date().toISOString(),
    };
  }

  compareSuppliers(scoreA: SupplierScore, scoreB: SupplierScore): number {
    return scoreB.overallScore - scoreA.overallScore;
  }
}

export const scoringEngine = new ScoringEngine();
