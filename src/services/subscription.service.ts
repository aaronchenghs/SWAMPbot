// src/services/subscription.service.ts
import { platform } from './ringcentral.service';
import { cfg } from '../config';

const FILTERS = [
  '/team-messaging/v1/posts', // message-level events
  '/team-messaging/v1/groups', // chat/group changes (NOT "/chats")
  '/restapi/v1.0/subscription/~?threshold=60&interval=15', // optional aggregation
] as const;

function arraysEqual(a: string[] = [], b: string[] = []) {
  if (a.length !== b.length) return false;
  const A = [...a].sort();
  const B = [...b].sort();
  return A.every((v, i) => v === B[i]);
}

async function listSubs() {
  const r = await platform.get('/restapi/v1.0/subscription');
  const j = await r.json();
  return (j?.records ?? []) as any[];
}

export async function ensureSubscription() {
  if (cfg.USE_WEBHOOKS !== 'true') {
    console.log('Webhooks disabled; using polling.');
    return;
  }

  try {
    const subs = await listSubs();

    // Prefer an existing WebHook sub pointing at our address
    const mine = subs.find(
      (s) =>
        s?.deliveryMode?.transportType === 'WebHook' &&
        s?.deliveryMode?.address === cfg.WEBHOOK_URL,
    );

    if (mine) {
      // Update filters/address if they’ve changed, otherwise just renew
      const currentFilters: string[] = mine?.eventFilters ?? [];
      if (
        !arraysEqual(currentFilters, FILTERS as unknown as string[]) ||
        mine?.deliveryMode?.address !== cfg.WEBHOOK_URL
      ) {
        await platform.put(`/restapi/v1.0/subscription/${mine.id}`, {
          eventFilters: FILTERS,
          deliveryMode: { transportType: 'WebHook', address: cfg.WEBHOOK_URL },
        });
        console.log('🔁 webhook updated', mine.id);
      } else {
        // Lightweight renew to extend expiry
        await platform.post(`/restapi/v1.0/subscription/${mine.id}/renew`);
        console.log('🔁 webhook renewed', mine.id);
      }
      return;
    }

    // No matching sub — create a new one
    await platform.post('/restapi/v1.0/subscription', {
      eventFilters: FILTERS,
      deliveryMode: { transportType: 'WebHook', address: cfg.WEBHOOK_URL },
      expiresIn: 604799, // ~7 days (max allowed)
    });
    console.log('✅ webhook subscription created');
  } catch (e: any) {
    if (e?.response) {
      const text = await e.response.text();
      console.error('ensureSubscription error:', e.response.status, text);
    } else {
      console.error('ensureSubscription error:', e?.message || e);
    }
    throw e;
  }
}
