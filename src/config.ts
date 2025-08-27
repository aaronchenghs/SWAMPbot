import 'dotenv/config';
import { z } from 'zod';

const Env = z.object({
  RINGCENTRAL_CLIENT_ID: z.string().min(1),
  RINGCENTRAL_CLIENT_SECRET: z.string().min(1),
  RINGCENTRAL_SERVER_URL: z
    .string()
    .default('https://platform.ringcentral.com'),
  OAUTH_REDIRECT_URL: z.string().url(),
  WEBHOOK_URL: z.string().url(),
  PORT: z.string().default('3000'),
  TIMEZONE: z.string().default('America/Chicago'),
  TARGET_CHAT_IDS: z.string().optional(),
  USE_WEBHOOKS: z.enum(['true', 'false']).default('false'),
  BOT_NAME: z.string().default('swampbot'),
  GREETER_MODE: z.enum(['webhook', 'poll', 'off']).default('webhook'),
  VERIFICATION_TOKEN: z.string().min(1),

  // OpenAI tunables (non-secret)
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  OPENAI_API_KEY: z.string().min(1),
  OAI_MAXTOK_CLASSIFY: z.coerce.number().default(96),
  OAI_MAXTOK_ANSWER: z.coerce.number().default(384),
  OAI_TEMP_CLASSIFY: z.coerce.number().default(0.6),
  OAI_TEMP_ANSWER: z.coerce.number().default(0.6),

  DEDUP_LOOKBACK_DAYS: z.coerce.number().default(7),
  DEDUP_MIN_CONFIDENCE: z.coerce.number().default(0.6),
});

export const APP_CONFIG = Env.parse(process.env);
