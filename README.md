# SWAMPBOT

RingCentral Team Messaging bot (Node + TypeScript).

**Current features**

- OAuth install flow (token saved to `tokens.json`, restored on restart)
- Health check (`/healthz`)
- List chats (`/chats`)
- Post a test Adaptive Card to any chat (`POST /post-test`)

---

## Table of Contents

- [SWAMPBOT](#swampbot)
  - [Table of Contents](#table-of-contents)
  - [Quickstart (Local)](#quickstart-local)
  - [Environment Variables](#environment-variables)
  - [Running the Server](#running-the-server)
  - [Exposing Locally (Tunnel)](#exposing-locally-tunnel)
  - [Installing the Bot (First Time)](#installing-the-bot-first-time)
  - [Smoke Tests](#smoke-tests)
  - [Project Structure](#project-structure)
  - [Scripts](#scripts)
  - [Collaboration \& Git Workflow](#collaboration--git-workflow)
  - [Hosting on Render (Production)](#hosting-on-render-production)
  - [Troubleshooting](#troubleshooting)
  - [Security](#security)
  - [License](#license)

---

## Quickstart (Local)

```bash
# 1) Clone
git clone https://github.com/aaronchenghs/SWAMPbot.git
cd swampbot

# 2) Install deps
npm i

# 4) Run the server (dev mode with auto-reload)
npm run dev
# -> "Server listening on 3000"
```

---

## Environment Variables

Create `.env` (or copy from `.env.example`) with **your** values:

```env
# Ask Aaron Cheng from these values
RINGCENTRAL_CLIENT_ID=YOUR_CLIENT_ID
RINGCENTRAL_CLIENT_SECRET=YOUR_CLIENT_SECRET
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com

# Use your tunnel or prod URL (HTTPS) + the paths below
OAUTH_REDIRECT_URL=https://<your-tunnel-or-prod>/oauth
WEBHOOK_URL=https://<your-tunnel-or-prod>/webhook

PORT=3000
TIMEZONE=America/Chicago
TARGET_CHAT_IDS=
USE_WEBHOOKS=false
```

> We **never** commit `.env` or `tokens.json`.

**Optional (for servers like Render):**

- `RC_BOT_TOKEN_JSON` — paste the JSON contents of `tokens.json` to restore auth on boot.

---

## Running the Server

```bash
# Dev (TS, auto-reload)
npm run dev

# Build & run compiled
npm run build
npm run start

# Health check
curl http://localhost:3000/healthz  # -> ok
```

---

## Exposing Locally (Tunnel)

Pick one:

**ngrok**

```bash
# one-time: ngrok config add-authtoken <YOUR_TOKEN>
ngrok http 3000
# Copy the HTTPS Forwarding URL, e.g. https://abc123.ngrok-free.app
```

**cloudflared (no account needed for quick tunnel)**

```bash
cloudflared tunnel --url http://localhost:3000
# Copy the https://<something>.trycloudflare.com URL
```

Update `.env`:

```
OAUTH_REDIRECT_URL=https://<your-tunnel>/oauth
WEBHOOK_URL=https://<your-tunnel>/webhook
```

Restart `npm run dev` if you changed `.env`.

---

## Installing the Bot (First Time)

> Skip this if you already have a shared `tokens.json` from your team vault—just drop it in the repo root and run.

1. In **RingCentral Developer Console** → your app:
   - Set **OAuth Redirect URL** to `https://<your-tunnel>/oauth`
   - (No “Webhook URL” field in console; webhooks are set by code)
2. With your server + tunnel running, click **Install**.
3. The app will:
   - Receive `/oauth`
   - Save `tokens.json` in the repo root
   - (Optionally attempt to create a webhook subscription if `USE_WEBHOOKS=true` and your app has scope)

---

## Smoke Tests

1. **List chats**

```bash
curl https://<your-tunnel>/chats
# -> [{"id":"<id>","type":"Team","name":"general"}, ...]
```

2. **Post a test Adaptive Card**

```bash
curl -X POST https://<your-tunnel>/post-test   -H "Content-Type: application/json"   -d '{"chatId":"<CHAT_ID_FROM_/chats>"}'
```

You should see “🤖 BangerBot is alive!” in that chat.

> If you don’t see it, make sure the **bot user is added to that chat** in RingCentral (chat → details → Add people → search bot name).

---

## Project Structure

```
src/
├─ server.ts                   # boot: reads config, restores auth, starts HTTP
├─ app.ts                      # builds Express app and mounts routes
├─ config/
│  └─ index.ts                 # env parsing/validation, exports cfg
├─ services/
│  ├─ ringcentral.service.ts   # SDK init, token save/restore (tokens.json or env)
│  └─ subscription.service.ts  # webhook subscription (optional)
├─ controllers/
│  ├─ oauth.controller.ts      # handles OAuth redirect; saves token; (opt) create sub
│  ├─ webhook.controller.ts    # echoes Validation-Token; place to handle events
│  ├─ chats.controller.ts      # GET /chats (utility)
│  └─ test.controller.ts       # POST /post-test (proof-of-life card)
├─ routes/
│  └─ index.ts                 # wires paths: /healthz, /oauth, /webhook, /chats, /post-test
```

---

## Scripts

```bash
npm run dev     # start in dev (ts-node-dev)
npm run build   # compile TypeScript to dist
npm run start   # run compiled build
npm run lint    # eslint
npm run format  # prettier
```

---

## Collaboration & Git Workflow

**After cloning:**

```bash
git clone https://github.com/aaronchenghs/SWAMPbot.git
cd swampbot
npm i
cp .env.example .env                 # fill values
# (optional) drop team-provided tokens.json in repo root
npm run dev
```

**Branching**

- `main` is protected.
- Features: `feat/<short-name>`
- Fixes: `fix/<short-name>`
- Chores/docs: `chore/<short-name>` / `docs/<short-name>`

**Committing**

- Use conventional commits (recommended):
  - `feat(awards): add winners card`
  - `fix(oauth): parse urlencoded bodies`
- Run checks locally:
  ```bash
  npm run lint && npm run build
  ```

**Open a PR**

- What changed + why
- How to test (paste your curl for `/post-test`)
- Screenshot/GIF of the card in RingCentral

**Merge**

- 1 approval + green CI
- Squash merge with a clear title

---

## Hosting on Render (Production)

> GitHub hosts the code; **Render** runs the app.

1. **Create a Web Service**

- **Root Directory:** _(blank or `.`)_
- **Runtime:** Node
- **Build Command:** `npm ci && npm run build`
- **Start Command:** `npm run start`

2. **Set Environment Variables (Render)**

```
RINGCENTRAL_CLIENT_ID=...
RINGCENTRAL_CLIENT_SECRET=...
RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com
TIMEZONE=America/Chicago
TARGET_CHAT_IDS=
USE_WEBHOOKS=false
OAUTH_REDIRECT_URL=https://<placeholder>/oauth
WEBHOOK_URL=https://<placeholder>/webhook
# Optional (recommended): paste your local tokens.json contents
RC_BOT_TOKEN_JSON={"access_token":"...","token_type":"bearer",...}
```

3. **Deploy**  
   Render will give you a URL like `https://swampbot.onrender.com`.

4. **Finalize envs on Render**

```
OAUTH_REDIRECT_URL=https://swampbot.onrender.com/oauth
WEBHOOK_URL=https://swampbot.onrender.com/webhook
```

Save → **Redeploy**.

5. **Auth in prod (pick one)**

- **Fresh install**: In the RingCentral Dev Console set OAuth Redirect URL to `https://swampbot.onrender.com/oauth` and click **Install** (service must be running). This writes `tokens.json` on the instance.
- **Reuse local token**: Keep `RC_BOT_TOKEN_JSON` set; the app restores auth from that env var on every boot (no reinstall).

6. **Prod tests**

```bash
curl https://swampbot.onrender.com/healthz
curl https://swampbot.onrender.com/chats
curl -X POST https://swampbot.onrender.com/post-test   -H "Content-Type: application/json"   -d '{"chatId":"<prod-chat-id>"}'
```

---

## Troubleshooting

- **Dev Console error: “redirect URL unsuccessful”**  
  Ensure the Redirect includes the **path** (`/oauth`) and your `/oauth` route returns **200** quickly.

- **ngrok ERR_NGROK_4018**  
  Authenticate once: `ngrok config add-authtoken <TOKEN>` or run with `--authtoken <TOKEN>`.

- **Webhook subscription error**  
  If you see `application permission is required for [WebHook] transport`, your app lacks the **SubscriptionWebhook** scope. Keep `USE_WEBHOOKS=false` (use polling later) or request scope approval.

- **Card doesn’t appear**  
  Invite the bot to that chat in RingCentral (chat → details → Add people). Verify you’re posting to `/adaptive-cards` with the correct `chatId`.

- **Chats list empty**  
  Bot isn’t in any chats or token missing. Add the bot to a team/DM or reinstall.

---

## Security

- Never commit secrets (`.env`, `tokens.json`).
- Share `tokens.json` via a secure vault if teammates need it.
- In production, prefer `RC_BOT_TOKEN_JSON` (a secret env var) so restarts don’t require reinstall.

---

## License

MIT (or your preferred license)
