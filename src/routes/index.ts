import { Router, json } from 'express';
import { oauthRouter } from '../controllers/oauth.controller';
import { webhookRouter } from '../controllers/webhook.controller';
import { chatsRouter } from '../controllers/chats.controller';
import { testRouter } from '../controllers/test.controller';
import { platform } from '../services/ringcentral.service';

export const routes = Router();

routes.get('/healthz', (_req, res) => res.send('ok'));

routes.use('/webhook', webhookRouter);
routes.use('/oauth', oauthRouter);

routes.use(json());
routes.use('/chats', chatsRouter);
routes.use('/', testRouter);

// 🔎 DEBUG (remove later or guard with env)
routes.get('/whoami', async (_req, res) => {
  try {
    const r = await platform.get('/restapi/v1.0/account/~/extension/~');
    res.json(await r.json());
  } catch (e: any) {
    const body = e?.response ? await e.response.text() : e?.message;
    res.status(500).send(body || 'error');
  }
});

routes.get('/chats-debug', async (_req, res) => {
  try {
    const r = await platform.get('/team-messaging/v1/chats', {
      recordCount: '50',
    });
    res.json(await r.json());
  } catch (e: any) {
    const body = e?.response ? await e.response.text() : e?.message;
    res.status(500).send(body || 'error');
  }
});
