import { buildApp } from './app';
import { APP_CONFIG } from './config';
import { restoreAuthIfExists } from './services/ringcentral.service';

(async () => {
  await restoreAuthIfExists();

  const app = buildApp();
  const server = app.listen(Number(APP_CONFIG.PORT), () => {
    console.log(`Server listening on ${APP_CONFIG.PORT}`);
  });

  setImmediate(async () => {
    try {
      const { routes } = await import('./routes/index');
      app.use(routes);
      console.log('✅ routes mounted');
    } catch (e) {
      console.error('Failed to mount routes', e);
    }
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;
})();
