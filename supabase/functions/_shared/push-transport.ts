import { isAllowedPushEndpoint } from './push-endpoint.ts';

export type PushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };
type RequestDetails = { endpoint: string; method: string; headers: Record<string, string | number>; body: Uint8Array | null };
type GenerateRequest = (subscription: PushSubscription, payload: string, options: { TTL: number }) => RequestDetails;

export class PushDeliveryError extends Error {
  readonly statusCode: number;
  constructor(statusCode = 0) {
    super('Push delivery failed'); // Never include endpoint, tokens or response body.
    this.statusCode = statusCode;
  }
}

// web-push still performs encryption and VAPID signing. Fetch makes the
// no-redirect policy explicit and testable, with no custom cryptography.
export async function sendValidatedPush(subscription: PushSubscription, payload: string,
  generateRequest: GenerateRequest, transport: typeof fetch = fetch): Promise<void> {
  if (!isAllowedPushEndpoint(subscription.endpoint)) throw new PushDeliveryError();
  const details = generateRequest(subscription, payload, { TTL: 3600 });
  if (details.endpoint !== subscription.endpoint || details.method !== 'POST') throw new PushDeliveryError();
  const headers = Object.fromEntries(Object.entries(details.headers).map(([key, value]) => [key, String(value)]));
  const response = await transport(details.endpoint, {
    method: 'POST', headers, body: details.body ? new Uint8Array(details.body) : null,
    redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(15_000),
  });
  // Do not read untrusted response bodies or use Location. A mock or alternative
  // fetch implementation returning a redirect must also fail without a retry.
  await response.body?.cancel();
  if (response.status < 200 || response.status >= 300) throw new PushDeliveryError(response.status);
}
