import express from 'express';
import fs from 'fs';
import path from 'path';
import { platform } from '../services/ringcentral.service';

export const oauthRouter = express.Router();
const tokenFile = path.join(process.cwd(), 'tokens.json');

// Normalize so the SDK never tries to refresh
function normalizeAuth(raw: any) {
  const TEN_YEARS = 315360000;
  return {
    token_type: 'bearer',
    access_token: raw?.access_token || '',
    expires_in: String(raw?.expires_in ?? TEN_YEARS),
    refresh_token: '',
    refresh_token_expires_in: String(raw?.refresh_token_expires_in ?? 0),
    scope: raw?.scope || '',
  };
}

// Accept any content-type; reply 200 immediately; DO NOT call RC APIs here
oauthRouter.all('/', express.raw({ type: '*/*' }), (req, res) => {
  res.status(200).end();

  process.nextTick(async () => {
    try {
      const ct = String(req.headers['content-type'] || '');
      const raw = Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : String(req.body ?? '');
      const body = ct.includes('application/json')
        ? JSON.parse(raw)
        : ct.includes('application/x-www-form-urlencoded')
          ? Object.fromEntries(new URLSearchParams(raw).entries())
          : {};

      const normalized = normalizeAuth(body);
      if (!normalized.access_token) {
        console.warn('OAuth: no access_token in payload');
        return;
      }
      platform.auth().setData(normalized);
      fs.writeFileSync(tokenFile, JSON.stringify(normalized, null, 2));
      console.log('✅ token saved (normalized)');
    } catch (e) {
      console.error('OAuth handler error:', e);
    }
  });
});
