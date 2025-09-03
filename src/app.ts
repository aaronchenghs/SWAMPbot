import express from 'express';
import { routes } from './routes';

export function buildApp() {
  const app = express();

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));

  app.use(express.json({ limit: '256kb' }));
  app.use(routes);
  return app;
}
