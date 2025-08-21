import { SDK } from "@ringcentral/sdk";
import fs from "fs";
import path from "path";
import { cfg } from "../config";

const rcsdk = new SDK({
  server: cfg.RINGCENTRAL_SERVER_URL,
  clientId: cfg.RINGCENTRAL_CLIENT_ID,
  clientSecret: cfg.RINGCENTRAL_CLIENT_SECRET,
});

export const platform = rcsdk.platform();

const tokenFile = path.join(process.cwd(), "tokens.json");

export function restoreAuthIfExists() {
  if (fs.existsSync(tokenFile)) {
    platform.auth().setData(JSON.parse(fs.readFileSync(tokenFile, "utf8")));
  }
}

export async function saveToken(access_token: string) {
  const data = {
    token_type: "bearer",
    access_token,
    expires_in: "999999999",
    refresh_token: "",
    refresh_token_expires_in: "0",
  };
  await platform.auth().setData(data);
  fs.writeFileSync(tokenFile, JSON.stringify(data, null, 2));
  console.log("✅ token saved");
}
