// services/subscription.service.ts
import { platform } from './ringcentral.service';
import { cfg } from '../config';

export async function ensureSubscription() {
  if (cfg.USE_WEBHOOKS !== 'true') {
    console.log('Webhooks disabled; using polling.');
    return;
  }

  // Optional: prove the token is set and which extension/account it is
  const who = await platform
    .get('/restapi/v1.0/account/~/extension/~')
    .then((r) => r.json());
  console.log(`Subscribing as ext ${who.id} (type=${who.type})`);

  const body = {
    eventFilters: [
      '/team-messaging/v1/posts',
      '/team-messaging/v1/chats',
      '/restapi/v1.0/account/~/extension/~', // uninstall detection
      '/restapi/v1.0/subscription/~?threshold=60&interval=15', // auto-renew ping
    ],
    deliveryMode: {
      transportType: 'WebHook',
      address: cfg.WEBHOOK_URL, // e.g. https://swampbot.onrender.com/webhook
    },
    expiresIn: 604799,
  };

  try {
    const resp = await platform.post(
      '/restapi/v1.0/account/~/extension/~/subscription',
      body,
    );
    const json = await resp.json();
    console.log('✅ webhook subscription created', json.id);
  } catch (e: any) {
    // Print the real response body so we can see RC’s exact complaint
    if (e?.response) {
      const text = await e.response.text();
      console.error(`ensureSubscription error: ${e.response.status}`, text);
    } else {
      console.error('ensureSubscription error', e);
    }
    throw e;
  }
}
