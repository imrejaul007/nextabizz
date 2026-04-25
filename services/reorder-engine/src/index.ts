import { z } from 'zod';

export const ReorderSuggestionSchema = z.object({
  productId: z.string().uuid(),
  supplierId: z.string().uuid(),
  currentStock: z.number(),
  reorderPoint: z.number(),
  suggestedQuantity: z.number(),
  urgency: z.enum(['low', 'medium', 'high']),
  reason: z.string(),
  estimatedCost: z.number().optional(),
  generatedAt: z.string().datetime(),
});

export type ReorderSuggestion = z.infer<typeof ReorderSuggestionSchema>;

export interface InventoryLevel {
  productId: string;
  currentStock: number;
  reorderPoint: number;
  averageConsumption: number;
  leadTimeDays: number;
}

export class ReorderEngine {
  private calculateUrgency(
    currentStock: number,
    reorderPoint: number,
    averageConsumption: number,
    leadTimeDays: number
  ): 'low' | 'medium' | 'high' {
    const daysOfStock = currentStock / averageConsumption;
    const safetyStock = reorderPoint * 1.5;

    if (currentStock <= reorderPoint) {
      return 'high';
    }
    if (daysOfStock <= leadTimeDays * 1.5) {
      return 'medium';
    }
    return 'low';
  }

  private calculateSuggestedQuantity(
    currentStock: number,
    reorderPoint: number,
    averageConsumption: number,
    leadTimeDays: number
  ): number {
    const targetStock = reorderPoint * 3;
    const projectedUsage = averageConsumption * leadTimeDays * 2;
    return Math.max(0, targetStock + projectedUsage - currentStock);
  }

  generateReorderSuggestions(inventory: InventoryLevel[]): ReorderSuggestion[] {
    return inventory
      .filter((item) => item.currentStock <= item.reorderPoint * 2)
      .map((item) => ({
        productId: item.productId,
        supplierId: '', // Will be populated from product data
        currentStock: item.currentStock,
        reorderPoint: item.reorderPoint,
        suggestedQuantity: this.calculateSuggestedQuantity(
          item.currentStock,
          item.reorderPoint,
          item.averageConsumption,
          item.leadTimeDays
        ),
        urgency: this.calculateUrgency(
          item.currentStock,
          item.reorderPoint,
          item.averageConsumption,
          item.leadTimeDays
        ),
        reason: this.generateReason(item),
        generatedAt: new Date().toISOString(),
      }));
  }

  private generateReason(item: InventoryLevel): string {
    const daysOfStock = item.currentStock / item.averageConsumption;
    if (item.currentStock <= item.reorderPoint) {
      return `Stock critically low (${daysOfStock.toFixed(1)} days of supply)`;
    }
    return `Stock approaching reorder point (${daysOfStock.toFixed(1)} days of supply)`;
  }
}

export const reorderEngine = new ReorderEngine();
