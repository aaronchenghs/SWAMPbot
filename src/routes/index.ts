import { Router, json } from 'express';
import { oauthRouter } from '../controllers/oauth.controller';
import { webhookRouter } from '../controllers/webhook.controller';
import { chatsRouter } from '../controllers/chats.controller';
import { testRouter } from '../controllers/test.controller';

export const routes = Router();
routes.get('/healthz', (_req, res) => res.send('ok'));

routes.use('/webhook', webhookRouter);
routes.use('/oauth', oauthRouter);

routes.use(json());
routes.use('/chats', chatsRouter);
routes.use('/', testRouter);
