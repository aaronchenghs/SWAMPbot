import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  RINGCENTRAL_CLIENT_ID: z.string().min(1),
  RINGCENTRAL_CLIENT_SECRET: z.string().min(1),
  RINGCENTRAL_SERVER_URL: z
    .string()
    .default("https://platform.ringcentral.com"),
  OAUTH_REDIRECT_URL: z.string().url(),
  WEBHOOK_URL: z.string().url(),
  PORT: z.string().default("3000"),
  TIMEZONE: z.string().default("America/Chicago"),
  TARGET_CHAT_IDS: z.string().optional(),
  USE_WEBHOOKS: z.enum(["true", "false"]).default("false"),
});

export const cfg = Env.parse(process.env);
