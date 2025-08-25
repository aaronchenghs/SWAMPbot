import { APP_CONFIG } from '../config';
import { platform } from './ringcentral.service';

const FILTERS = [
  '/team-messaging/v1/posts',
  '/team-messaging/v1/chats', // (docs show "chats"; OK to keep)
  '/restapi/v1.0/account/~/extension/~', // uninstall detection
  '/restapi/v1.0/subscription/~?threshold=60&interval=15', // heartbeat/renew
];

export async function ensureSubscription() {
  if (APP_CONFIG.USE_WEBHOOKS !== 'true') {
    console.log('Webhooks disabled; using polling.');
    return;
  }

  try {
    const who = await platform
      .get('/restapi/v1.0/account/~/extension/~')
      .then((r) => r.json());
    console.log(
      `Subscribing as account ${who?.account?.id} ext ${who?.id} (${who?.type})`,
    );

    const createBody = {
      eventFilters: FILTERS,
      deliveryMode: {
        transportType: 'WebHook',
        address: APP_CONFIG.WEBHOOK_URL,
      },
      expiresIn: 604799,
    };

    try {
      const r = await platform.post(
        '/restapi/v1.0/account/~/extension/~/subscription',
        createBody,
      );
      const j = await r.json();
      console.log('✅ webhook subscription created', j.id);
      return;
    } catch (errCreate: any) {
      if (errCreate?.response) {
        const t = await errCreate.response.text();
        console.warn(
          'create-subscription failed; will try renew/update:',
          errCreate.response.status,
          t,
        );
      } else {
        console.warn(
          'create-subscription failed; will try renew/update:',
          String(errCreate),
        );
      }
    }

    const list = await platform
      .get('/restapi/v1.0/subscription')
      .then((r) => r.json());
    const existing = (list?.records || []).find(
      (s: any) =>
        s?.deliveryMode?.transportType === 'WebHook' &&
        s?.deliveryMode?.address === APP_CONFIG.WEBHOOK_URL,
    );

    if (existing) {
      await platform.put(`/restapi/v1.0/subscription/${existing.id}`, {
        eventFilters: FILTERS,
        deliveryMode: {
          transportType: 'WebHook',
          address: APP_CONFIG.WEBHOOK_URL,
        },
      });
      console.log('🔁 webhook renewed/updated', existing.id);
      return;
    }

    throw new Error('Could not create or find an existing subscription');
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
