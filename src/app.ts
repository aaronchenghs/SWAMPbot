import express from 'express';

export function buildApp() {
  const app = express();

  app.get('/healthz', (_req, res) => res.status(200).send('ok'));
  app.get('/', (_req, res) => res.status(200).send('ok'));

  app.use(express.json({ limit: '256kb' }));

  return app;
}
