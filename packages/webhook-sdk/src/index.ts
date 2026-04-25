/**
 * @nextabizz/webhook-sdk
 *
 * A comprehensive webhook SDK for handling inventory signals from multiple sources:
 * - RestoPapa
 * - ReZ Merchant
 * - Hotel PMS
 */

// Verify signature exports
export {
  verifyWebhookSignature,
  verifyWebhookSignatureDetailed,
  createWebhookSignature,
  type WebhookVerificationOptions,
  type HeadersRecord,
  type VerificationResult,
} from './verify';

// Handler exports
export {
  // RestoPapa
  RestoPapaInventoryPayloadSchema,
  validateRestoPapaPayload,
  validateRestoPapaPayloadSafe,
  handleRestoPapaInventorySignal,
  type RestoPapaHandlerContext,
  type RestoPapaHandlerResult,
  type RestoPapaInventoryPayload,
  // ReZ Merchant
  RezMerchantInventoryPayloadSchema,
  validateRezMerchantPayload,
  validateRezMerchantPayloadSafe,
  handleRezMerchantInventorySignal,
  type RezMerchantHandlerContext,
  type RezMerchantHandlerResult,
  type RezMerchantInventoryPayload,
  // Hotel PMS
  HotelPMSInventoryPayloadSchema,
  validateHotelPMSPayload,
  validateHotelPMSPayloadSafe,
  handleHotelPMSInventorySignal,
  type HotelPMSHandlerContext,
  type HotelPMSHandlerResult,
  type HotelPMSInventoryPayload,
  // Dispatcher
  dispatchWebhook,
  dispatchRestoPapaWebhook,
  dispatchRezMerchantWebhook,
  dispatchHotelPMSWebhook,
  type WebhookSource,
  type WebhookEventType,
  type UnifiedHandlerContext,
  type DispatchResult,
  type UnifiedWebhookPayload,
  identifyWebhookSource,
} from './handlers';

// Types exports
export type { WebhookPayload, WebhookHandler } from './types';
