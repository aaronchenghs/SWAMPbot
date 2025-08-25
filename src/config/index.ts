import 'dotenv/config';
import { z } from 'zod';

const TokenSchema = z.object({
  token_type: z.string(),
  access_token: z.string().min(1),
  expires_in: z.string().optional(),
  refresh_token: z.string().optional(),
  refresh_token_expires_in: z.string().optional(),
  scope: z.string().optional(),
});

const EnvRaw = z.object({
  RINGCENTRAL_CLIENT_ID: z.string().min(1),
  RINGCENTRAL_CLIENT_SECRET: z.string().min(1),
  RINGCENTRAL_SERVER_URL: z
    .string()
    .default('https://platform.ringcentral.com'),

  OAUTH_REDIRECT_URL: z.string().url(),
  WEBHOOK_URL: z.string().url(),

  PORT: z.coerce.number().default(3000),
  TIMEZONE: z.string().default('America/Chicago'),

  TARGET_CHAT_IDS: z.string().optional(),

  USE_WEBHOOKS: z.enum(['true', 'false']).default('false'),
  GREETER_MODE: z.enum(['webhook', 'poll', 'off']).default('webhook'),

  BOT_NAME: z.string().default('swampbot'),
  COMMAND_PREFIX: z.string().default('!'),

  RC_BOT_TOKEN_JSON: z.string().optional(),
  BOT_EXTENSION_ID: z.string().regex(/^\d+$/).optional(),
  VERIFICATION_TOKEN: z.string().optional(),
});

/**
 * Transform:
 * - Parse RC_BOT_TOKEN_JSON whether it's raw JSON or a quoted JSON string with \n and \"
 * - Split TARGET_CHAT_IDS into an array
 */
const Env = EnvRaw.transform((raw) => {
  // Parse bot token JSON (handles both raw JSON and "escaped string" JSON)
  let RC_BOT_TOKEN: z.infer<typeof TokenSchema> | undefined;
  if (raw.RC_BOT_TOKEN_JSON) {
    try {
      let s = raw.RC_BOT_TOKEN_JSON.trim();

      // If it looks like a JSON string literal (starts/ends with a quote), unstringify once
      if (
        (s.startsWith('"') && s.endsWith('"')) ||
        (s.startsWith("'") && s.endsWith("'"))
      ) {
        s = JSON.parse(s);
      }

      // If we now have an object as string, parse it
      if (s.startsWith('{')) {
        RC_BOT_TOKEN = TokenSchema.parse(JSON.parse(s));
      } else {
        RC_BOT_TOKEN = TokenSchema.parse(JSON.parse(s));
      }
    } catch (err) {
      throw new Error(
        'RC_BOT_TOKEN_JSON is not valid token JSON. Paste raw JSON (no outer quotes), or a properly quoted JSON string.',
      );
    }
  }

  const TARGET_CHAT_ID_LIST = (raw.TARGET_CHAT_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    ...raw,
    RC_BOT_TOKEN,
    TARGET_CHAT_ID_LIST,
  };
});
