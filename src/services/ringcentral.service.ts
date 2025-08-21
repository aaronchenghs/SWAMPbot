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
  const TEN_YEARS = 315360000; // seconds
  return {
    token_type: 'bearer',
    access_token: raw?.access_token || raw?.accessToken || '',
    // Strings, not numbers; very long so SDK won’t attempt refresh
    expires_in: String(raw?.expires_in ?? TEN_YEARS),
    refresh_token: '', // private install => none
    refresh_token_expires_in: String(raw?.refresh_token_expires_in ?? 0),
    scope: raw?.scope || raw?.scopes || '',
  };
}

export function restoreAuthIfExists() {
  const fromEnv = process.env.RC_BOT_TOKEN_JSON;
  if (fromEnv) {
    platform.auth().setData(normalizeAuth(JSON.parse(fromEnv)));
    console.log('✅ restored token from RC_BOT_TOKEN_JSON');
    return;
  }
  if (fs.existsSync(tokenFile)) {
    platform
      .auth()
      .setData(normalizeAuth(JSON.parse(fs.readFileSync(tokenFile, 'utf8'))));
    console.log('✅ restored token from tokens.json');
  } else {
    console.log('ℹ️ no token found yet; install will populate one');
  }
}

export async function saveToken(access_token: string) {
  const data = normalizeAuth({ access_token });
  platform.auth().setData(data);
  fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
  console.log('✅ token saved');
}
