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

  app.get('/subs', async (_req, res) => {
    try {
      const r = await platform.get('/restapi/v1.0/subscription');
      res.json(await r.json());
    } catch (e: any) {
      const body = e?.response ? await e.response.text() : e?.message;
      res.status(500).send(body || 'error');
    }
  });

  app.get('/auth-debug', (_req, res) => {
    try {
      const d: any = platform.auth().data?.();
      res.json({
        hasAccessToken: !!d?.access_token,
        scope: d?.scope || '(none)',
        expires_in: d?.expires_in,
        token_type: d?.token_type,
      });
    } catch (e: any) {
      res.status(500).send(e?.message || 'error');
    }
  });
})();
