import { platform } from "./ringcentral.service";
import { cfg } from "../config";

export async function ensureSubscription() {
  if (cfg.USE_WEBHOOKS !== "true") {
    console.log("Webhooks disabled; using polling.");
    return;
  }
  await platform.post("/restapi/v1.0/subscription", {
    eventFilters: [
      "/team-messaging/v1/posts",
      "/team-messaging/v1/chats",
      "/restapi/v1.0/subscription/~?threshold=60&interval=15",
    ],
    deliveryMode: { transportType: "WebHook", address: cfg.WEBHOOK_URL },
    expiresIn: 604799,
  });
  console.log("✅ webhook subscription created");
}
