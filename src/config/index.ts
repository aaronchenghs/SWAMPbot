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
