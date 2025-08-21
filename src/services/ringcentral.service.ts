import { SDK } from '@ringcentral/sdk';
import fs from 'fs';
import path from 'path';
import { cfg } from '../config';

const rcsdk = new SDK({
  server: cfg.RINGCENTRAL_SERVER_URL,
  clientId: cfg.RINGCENTRAL_CLIENT_ID,
  clientSecret: cfg.RINGCENTRAL_CLIENT_SECRET,
});
export const platform = rcsdk.platform();

const tokenFile = path.join(process.cwd(), 'tokens.json');

// 👉 normalize any shape (body from /oauth, env, or file) into a long-lived token
function normalizeAuth(raw: any) {
  if (!raw) raw = {};
  const access = raw.access_token || raw.accessToken || '';
  return {
    token_type: 'bearer',
    access_token: access,
    // make them strings; very long so SDK won't refresh
    expires_in: String(raw.expires_in ?? 315360000), // 10 years
    refresh_token: raw.refresh_token ?? '', // none for private bot
    refresh_token_expires_in: String(raw.refresh_token_expires_in ?? 0),
    scope: raw.scope || raw.scopes || raw.scopeString || '',
  };
}

export function restoreAuthIfExists() {
  try {
    const fromEnv = process.env.RC_BOT_TOKEN_JSON;
    if (fromEnv) {
      const data = normalizeAuth(JSON.parse(fromEnv));
      platform.auth().setData(data);
      console.log('✅ restored token from RC_BOT_TOKEN_JSON');
      return;
    }
    if (fs.existsSync(tokenFile)) {
      const data = normalizeAuth(
        JSON.parse(fs.readFileSync(tokenFile, 'utf8')),
      );
      platform.auth().setData(data);
      console.log('✅ restored token from tokens.json');
    } else {
      console.log('ℹ️ no token found yet; install will populate one');
    }
  } catch (e) {
    console.error('restoreAuthIfExists error', e);
  }
}

export async function saveToken(access_token: string) {
  const data = normalizeAuth({ access_token });
  await platform.auth().setData(data);
  fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
  console.log('✅ token saved');
}
