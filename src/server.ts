import { cfg } from './config';
import { buildApp } from './app';
import { restoreAuthIfExists } from './services/ringcentral.service';
import { ensureSubscription } from './services/subscription.service';

restoreAuthIfExists();
const app = buildApp();

app.listen(Number(cfg.PORT), () => {
  console.log(`Server listening on ${cfg.PORT}`);
  if (cfg.USE_WEBHOOKS === 'true') {
    setTimeout(() => {
      ensureSubscription()
        .then(() => console.log('✅ webhook subscription ensured'))
        .catch((e) => console.error('ensureSubscription error', e));
    }, 500);
  }
});
