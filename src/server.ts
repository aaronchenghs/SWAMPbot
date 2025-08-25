import { buildApp } from './app';
import { APP_CONFIG } from './config';
import { restoreAuthIfExists } from './services/ringcentral.service';
import { ensureSubscription } from './services/subscription.service';

(async () => {
  await restoreAuthIfExists();

  const app = buildApp();
  app.listen(Number(APP_CONFIG.PORT), async () => {
    console.log(`Server listening on ${APP_CONFIG.PORT}`);
    if (APP_CONFIG.USE_WEBHOOKS === 'true') {
      setTimeout(() => {
        ensureSubscription()
          .then(() => console.log('✅ webhook subscription ensured'))
          .catch((e) => console.error('ensureSubscription error', e));
      }, 500);
    }
  });
})();
