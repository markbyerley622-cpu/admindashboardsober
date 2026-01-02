// =============================================================================
// WEBHOOK SERVICE - Integration with user app
// =============================================================================
import { prisma } from './database.js';
import { config } from '../config/index.js';
import { createHmacSignature } from '../utils/index.js';
import type { WebhookEventType, WebhookPayload } from '../types/index.js';

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 5000, 30000]; // 1s, 5s, 30s

/**
 * Emit a webhook event to the user app
 * Events are queued and delivered asynchronously with retries
 */
export async function emitWebhook(
  eventType: WebhookEventType,
  data: WebhookPayload['data']
): Promise<string> {
  const payload: WebhookPayload = {
    eventType,
    timestamp: new Date().toISOString(),
    data,
  };

  // Store event in database
  const event = await prisma.webhookEvent.create({
    data: {
      eventType,
      payload: JSON.stringify(payload),
      targetUrl: config.userAppWebhookUrl || '',
      status: 'PENDING',
    },
  });

  // Attempt delivery (fire and forget - retries handled separately)
  if (config.userAppWebhookUrl) {
    deliverWebhook(event.id).catch((err) => {
      console.error(`Webhook delivery failed for ${event.id}:`, err);
    });
  }

  return event.id;
}

/**
 * Deliver a webhook event
 */
async function deliverWebhook(eventId: string): Promise<void> {
  const event = await prisma.webhookEvent.findUnique({
    where: { id: eventId },
  });

  if (!event || event.status === 'DELIVERED') {
    return;
  }

  const payloadStr = event.payload; // Already stringified
  const signature = createHmacSignature(payloadStr, config.webhookSecret);

  try {
    const response = await fetch(event.targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': signature,
        'X-Webhook-Event': event.eventType,
        'X-Webhook-ID': event.id,
      },
      body: payloadStr,
    });

    if (response.ok) {
      await prisma.webhookEvent.update({
        where: { id: eventId },
        data: {
          status: 'DELIVERED',
          deliveredAt: new Date(),
          attempts: { increment: 1 },
          lastAttemptAt: new Date(),
        },
      });
    } else {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await prisma.webhookEvent.update({
      where: { id: eventId },
      data: {
        status: event.attempts >= MAX_RETRIES - 1 ? 'FAILED' : 'RETRYING',
        attempts: { increment: 1 },
        lastAttemptAt: new Date(),
        lastError: errorMessage,
      },
    });

    // Schedule retry if not maxed out
    if (event.attempts < MAX_RETRIES - 1) {
      const delay = RETRY_DELAYS[event.attempts] || RETRY_DELAYS[2];
      setTimeout(() => {
        deliverWebhook(eventId).catch(console.error);
      }, delay);
    }
  }
}

/**
 * Retry failed webhooks (called by scheduled job)
 */
export async function retryFailedWebhooks(): Promise<number> {
  const failedEvents = await prisma.webhookEvent.findMany({
    where: {
      status: 'RETRYING',
      attempts: { lt: MAX_RETRIES },
    },
    take: 100,
  });

  for (const event of failedEvents) {
    await deliverWebhook(event.id);
  }

  return failedEvents.length;
}

/**
 * Get webhook delivery stats
 */
export async function getWebhookStats(): Promise<{
  pending: number;
  delivered: number;
  failed: number;
  retrying: number;
}> {
  const [pending, delivered, failed, retrying] = await Promise.all([
    prisma.webhookEvent.count({ where: { status: 'PENDING' } }),
    prisma.webhookEvent.count({ where: { status: 'DELIVERED' } }),
    prisma.webhookEvent.count({ where: { status: 'FAILED' } }),
    prisma.webhookEvent.count({ where: { status: 'RETRYING' } }),
  ]);

  return { pending, delivered, failed, retrying };
}
