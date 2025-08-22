import { cfg } from './config';
import { buildApp } from './app';
import { platform, restoreAuthIfExists } from './services/ringcentral.service';
import { ensureSubscription } from './services/subscription.service';

(async () => {
  await restoreAuthIfExists();

  const app = buildApp();
  app.listen(Number(cfg.PORT), async () => {
    console.log(`Server listening on ${cfg.PORT}`);
    if (cfg.USE_WEBHOOKS === 'true') {
      setTimeout(() => {
        ensureSubscription()
          .then(() => console.log('✅ webhook subscription ensured'))
          .catch((e) => console.error('ensureSubscription error', e));
      }, 500);
    }
  });
})();
