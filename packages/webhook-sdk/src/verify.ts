import { z } from 'zod';
import CryptoJS from 'crypto-js';

export const WebhookSourceSchema = z.enum(['restopapa', 'rez-merchant', 'hotel-pms']);
export type WebhookSource = z.infer<typeof WebhookSourceSchema>;

export interface WebhookPayload {
  id: string;
  source: WebhookSource;
  type: string;
  timestamp: string;
  data: unknown;
}

export interface WebhookHandler<T = unknown> {
  source: WebhookSource;
  type: string;
  handler: (payload: WebhookPayload & { data: T }) => Promise<void>;
}

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = CryptoJS
    .HmacSHA256(payload, secret)
    .toString(CryptoJS.enc.Hex);

  return CryptoJS.timingSafeEqual(
    CryptoJS.enc.Hex.parse(signature),
    CryptoJS.enc.Hex.parse(expectedSignature)
  );
}

export async function processWebhook(
  payload: WebhookPayload,
  signature: string,
  secret: string,
  handlers: WebhookHandler[]
): Promise<void> {
  if (!verifyWebhookSignature(JSON.stringify(payload), signature, secret)) {
    throw new Error('Invalid webhook signature');
  }

  const handler = handlers.find(
    (h) => h.source === payload.source && h.type === payload.type
  );

  if (!handler) {
    throw new Error(`No handler found for ${payload.source}:${payload.type}`);
  }

  await handler.handler(payload);
}
