import { z } from 'zod';

export const WebhookSourceSchema = z.enum(['restopapa', 'rez-merchant', 'hotel-pms']);
export type WebhookSource = z.infer<typeof WebhookSourceSchema>;

export const BaseWebhookEventSchema = z.object({
  id: z.string(),
  source: WebhookSourceSchema,
  type: z.string(),
  timestamp: z.string().datetime(),
  signature: z.string(),
});

export type BaseWebhookEvent = z.infer<typeof BaseWebhookEventSchema>;
