# Contributing to SWAMPBOT

## Branching
- `main` is protected.
- Features: `feat/<short-name>`
- Fixes: `fix/<short-name>`
- Chores/docs: `chore/<short-name>` / `docs/<short-name>`

## Making changes
1. Open (or pick up) a GitHub Issue.
2. Create a branch and commit small, focused changes.
3. `npm run lint && npm run build` before pushing.
4. Open a PR with:
   - What changed + why
   - How to test (include the exact curl for `/post-test`)
   - Screenshot/GIF of the card in RingCentral

## Code style
- TypeScript strict mode.
- ESLint + Prettier. Pre-commit can run lint-staged if configured.

## Env & secrets
- `.env` and `tokens.json` are **never committed**.
- Get `tokens.json` from the team vault; drop it in repo root.
- If you must re-install locally, coordinate with the app owner to set your temporary OAuth Redirect URL.

## Local testing checklist
- Server runs: `npm run dev`
- Tunnel up: ngrok or cloudflared
- `GET /healthz` → `ok`
- `GET /chats` → lists chats
- `POST /post-test` → card appears in chosen chat

## Review & merge
- At least one reviewer approval.
- CI (lint+build) must pass.
- Squash merge with conventional title (e.g., `feat(awards): add score and winners card`)
