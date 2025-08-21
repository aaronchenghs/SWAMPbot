import express from "express";
import { saveToken } from "../services/ringcentral.service";
import { ensureSubscription } from "../services/subscription.service";

export const oauthRouter = express.Router();

// Accept any content-type and respond 200 immediately
oauthRouter.all("/", express.raw({ type: "*/*" }), (req, res) => {
  res.status(200).end();
  process.nextTick(async () => {
    try {
      const ct = String(req.headers["content-type"] || "");
      const raw = Buffer.isBuffer(req.body)
        ? req.body.toString("utf8")
        : String(req.body ?? "");
      let token: string | undefined;

      if (ct.includes("application/json"))
        token = JSON.parse(raw)?.access_token;
      else if (ct.includes("application/x-www-form-urlencoded"))
        token = new URLSearchParams(raw).get("access_token") ?? undefined;

      if (!token) return console.warn("OAuth hit without token");
      await saveToken(token);
      await ensureSubscription();
    } catch (e) {
      console.error("OAuth post-work error", e);
    }
  });
});
