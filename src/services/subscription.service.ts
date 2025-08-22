import { platform } from './ringcentral.service';
import { cfg } from '../config';

const FILTERS = [
  '/team-messaging/v1/posts',
  '/team-messaging/v1/chats',
  '/restapi/v1.0/account/~/extension/~',
  '/restapi/v1.0/subscription/~?threshold=60&interval=15',
];

export async function ensureSubscription() {
  if (cfg.USE_WEBHOOKS !== 'true') {
    console.log('Webhooks disabled; using polling.');
    return;
  }

  try {
    const list = await platform
      .get('/restapi/v1.0/subscription')
      .then((r) => r.json());
    const existing = (list?.records || []).find(
      (s: any) =>
        s?.deliveryMode?.transportType === 'WebHook' &&
        s?.deliveryMode?.address === cfg.WEBHOOK_URL,
    );

    if (existing) {
      await platform.put(`/restapi/v1.0/subscription/${existing.id}`, {
        eventFilters: FILTERS,
        deliveryMode: { transportType: 'WebHook', address: cfg.WEBHOOK_URL },
      });
      console.log('🔁 webhook renewed/updated', existing.id);
      return;
    }

    const resp = await platform.post('/restapi/v1.0/subscription', {
      eventFilters: FILTERS,
      deliveryMode: { transportType: 'WebHook', address: cfg.WEBHOOK_URL },
      expiresIn: 604799,
    });
    const json = await resp.json();
    console.log('✅ webhook subscription created', json.id);
  } catch (e: any) {
    if (e?.response) {
      const text = await e.response.text();
      console.error(`ensureSubscription error: ${e.response.status}`, text);
    } else {
      console.error('ensureSubscription error', e?.message || e);
    }
    throw e;
  }
}
