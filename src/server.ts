import { cfg } from './config';
import { buildApp } from './app';
import { restoreAuthIfExists } from './services/ringcentral.service';
import { ensureSubscription } from './services/subscription.service';

restoreAuthIfExists();

const app = buildApp();

// ensure the server is accepting requests before creating the webhook
app.listen(Number(cfg.PORT), async () => {
  console.log(`Server listening on ${cfg.PORT}`);

  if (cfg.USE_WEBHOOKS === 'true') {
    try {
      await ensureSubscription();
      console.log('✅ webhook subscription ensured on boot');
    } catch (e) {
      console.error('ensureSubscription error', e);
    }
  }
});
