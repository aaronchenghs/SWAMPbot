# Contributing to SWAMPBOT (Hackathon Edition)

## TL;DR

- Clone, `npm i`, `npm run dev`, start a tunnel `ngrok http 3000`, test `/post-test`.

---

## 0) Setup in ~3 minutes

```bash
git clone https://github.com/<you-or-org>/swampbot.git
cd swampbot
npm i
npm run dev                 # http://localhost:3000/healthz -> ok
# in another shell: ngrok http 3000   (or: cloudflared tunnel --url http://localhost:3000)
```

Update `.env` with your tunnel:

```
OAUTH_REDIRECT_URL=https://<your-tunnel>/oauth
WEBHOOK_URL=https://<your-tunnel>/webhook
```

**Smoke test**

```bash
curl https://<your-tunnel>/chats
curl -X POST https://<your-tunnel>/post-test -H "Content-Type: application/json" -d '{"chatId":"<an-id>"}'
```

---

## 1) Branching & commits (keep it light)

- Base off `main` → `git checkout -b feat/<thing>` or `fix/<thing>`.
- Commit early/often. One-liners are fine: `feat: add winners card title`.
- Co-authorship welcome:
  ```
  Co-authored-by: Name <email@example.com>
  ```
- Push the branch and either:
  - open a **tiny PR** (preferred), or
  - keep pushing to the branch and ping someone if you want eyes.

**PR template (short)**

- What changed & why
- How to test (paste the `curl` for `/post-test`)
- Screenshot/GIF of the RingCentral card

> If CI yells, fix or punt (it’s lint/build only).

---

## 2) Code style (good-enough)

- TypeScript strict is on.
- `npm run lint` and `npm run format` if you have time.
- Prefer small functions over cleverness.

---

## 3) Env & secrets

- **Never** commit `.env` or `tokens.json`.
- Share `tokens.json` via a vault/DM if needed.
- On servers, use `RC_BOT_TOKEN_JSON` env to persist auth instead of files.

---

## 4) Common tasks

**Start dev server**

```bash
npm run dev
```

**Start a tunnel (pick one)**

```bash
ngrok http 3000
# or
cloudflared tunnel --url http://localhost:3000
```

**List chats**

```bash
curl https://<your-tunnel>/chats
```

**Post a proof-of-life card**

```bash
curl -X POST https://<your-tunnel>/post-test \
  -H "Content-Type: application/json" \
  -d '{"chatId":"<CHAT_ID>"}'
```

---

## 5) Deploying to Render (prod-ish)

1. Connect the repo → New Web Service
2. Root dir: blank (`.`). Build: `npm ci && npm run build`. Start: `npm run start`.
3. Env vars on Render:
   - `RINGCENTRAL_CLIENT_ID`, `RINGCENTRAL_CLIENT_SECRET`
   - `RINGCENTRAL_SERVER_URL=https://platform.ringcentral.com`
   - `TIMEZONE=America/Chicago`
   - `TARGET_CHAT_IDS=` (optional)
   - `USE_WEBHOOKS=false`
   - `OAUTH_REDIRECT_URL=https://<app>.onrender.com/oauth`
   - `WEBHOOK_URL=https://<app>.onrender.com/webhook`
   - _(optional)_ `RC_BOT_TOKEN_JSON=<paste your tokens.json>`
4. Redeploy. Health: `GET /healthz`.
5. If you didn’t set `RC_BOT_TOKEN_JSON`, do a one-time **Install** in the RingCentral Dev Console pointing to the Render `/oauth` URL.

---

## 7) Quick FAQ

- **Do I need to change the OAuth Redirect URL every time my ngrok changes?**  
  No. Only when you are doing a fresh **Install**. Otherwise, use `tokens.json`.
- **Bot can’t post in a chat?**  
  Add the bot to that chat in RingCentral (details → Add people).
- **Webhook error about permissions?**  
  Ignore for hackathon; we’re not using webhooks yet (`USE_WEBHOOKS=false`).
