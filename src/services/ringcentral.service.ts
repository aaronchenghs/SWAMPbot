import { SDK } from '@ringcentral/sdk';
import fs from 'fs';
import path from 'path';
import { normalizeAuth } from '../controllers/oauth.controller';
import { APP_CONFIG } from '../config';

const rcsdk = new SDK({
  server: APP_CONFIG.RINGCENTRAL_SERVER_URL,
  clientId: APP_CONFIG.RINGCENTRAL_CLIENT_ID,
  clientSecret: APP_CONFIG.RINGCENTRAL_CLIENT_SECRET,
});
export const platform = rcsdk.platform();

const tokenFile = path.join(process.cwd(), 'tokens.json');

export function restoreAuthIfExists() {
  try {
    const envJson = process.env.RC_BOT_TOKEN_JSON;
    if (envJson) {
      platform.auth().setData(normalizeAuth(JSON.parse(envJson)));
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
  } catch (e) {
    console.error('restoreAuthIfExists error', e);
  }
}

export async function saveToken(access_token: string) {
  const data = normalizeAuth({ access_token });
  platform.auth().setData(data);
  fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
  console.log('✅ token saved (normalized)');
}
