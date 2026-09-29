# CLAUDE.md — MIGlife web (web.miglife.app)

The web version of the **MIGlife** Android app (formerly "MIGwith"). The goal is
always: **the web behaves exactly like the Android app.** When the owner uploads
new Kotlin files (MainActivity.kt, RoomPage.kt, *Game.kt …), `functions/index.js`
or `firestore.rules`, diff them against the previous versions and port the
changes that matter for the web.

## Talking to the owner

- The owner writes **Bengali** (sometimes Banglish). Reply in **Bengali**, simply,
  step by step. Code, commits and comments stay in English.
- Workflow for every change:
  1. New branch from `main` → change → build check → commit → push the branch.
  2. Get the Vercel **preview** URL from the GitHub statuses API and give it to
     the owner ("খুলে **Visit** চাপুন").
  3. Only when the owner says **"done"**: fast-forward `main` to the branch,
     push, and confirm the production deploy finished.
- Never push straight to `main` without the owner's "done".

## Hosting & services

| What | Where |
|------|-------|
| Repo | `arafatakhand-cloud/migwith-web` |
| Hosting | Vercel project **migwith** → `web.miglife.app` (`miglife.app`, `www` redirect 308) |
| Firebase project | `migwith-mumbai` (shared with the Android app) |
| Cloud Functions | region `asia-south1` (the owner deploys `functions/index.js` himself) |

Firebase config lives **only** in Vercel env vars (`NEXT_PUBLIC_FIREBASE_*`,
`NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY`). Never hardcode it.

## Stack & commands

Next.js 15 App Router, React 19, Tailwind v4, TypeScript, Firebase JS v12
(Auth, Firestore, Functions, Storage).

```bash
# Build check (dummy env is enough; prebuild regenerates app/themes.css)
NEXT_PUBLIC_FIREBASE_API_KEY=x NEXT_PUBLIC_FIREBASE_PROJECT_ID=x \
NEXT_PUBLIC_FIREBASE_APP_ID=x NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=x.appspot.com \
npm run build

# Preview URL of a pushed commit
curl -s https://api.github.com/repos/arafatakhand-cloud/migwith-web/commits/<sha>/statuses

# Merge after "done"
git fetch origin main && git merge-base --is-ancestor FETCH_HEAD <branch> \
  && git checkout main && git merge --ff-only <branch> && git push origin main
```

## Hard rules (do not break)

- **Money, games, PINs, gifts, bets: only through Cloud Functions.** The web never
  writes balances, results or bets itself.
- Firestore documents must be written in **exactly the same shape as the app**.
  Check `firestore.rules` before any direct write.
- The main founder is **"miglife" only** (`lib/founder.ts`:
  `MAIN_FOUNDER_USERNAMES`, `isMainFounderName`; rules: `isOwner()`). The old
  "migwith" account has no founder powers. miglife-only tools live in
  `app/secret/` (check `f.isMigwith`).
- Keep login emails `${id}@login.migwith.local` and `migwith.*` localStorage keys.
- Web push never writes the Android `users/{uid}.fcmToken`.
- Never turn on App Check "Enforce". "Reset ALL Balances" is not on the web.
- Do not use mig33 / mig66 names, logos or assets.
- Guard `rm` with `"${VAR:?}"`.
- Commit messages end with the Co-Authored-By / Claude-Session trailer lines;
  no model names in commits.

## Map of the code

- `app/room/[name]/page.tsx` — the chat room (messages, commands, presence
  enter/left lines, game tables, voice/photo). Game components live in
  `app/_components/` (`LuxuryBot`, `LuxuryBet`, `LowCard`, `CricketGame`,
  `TeenPatti`, `Ludo`, `RoyaleGame`, `TwentyNine`).
- `lib/rooms.ts` — official room names, level badges, presence line format,
  role/Color Shop badges, room welcome texts.
- `lib/level.ts` — XP/level curve (must match `xpRequiredForNextLevel` in the app
  and `xpToReachLevel` in the rules).
- `app/secret/` — "miglife secret" founder tools.
- `app/_components/BackButton.tsx` — the standard back button / back pill.
- `lib/appDownload.ts` — Android download button link
  (`app_config/latest.apkUrl`, fallback `app_settings/invite.downloadUrl`).

## Debugging tips

- Firebase SDK error **"internal [0]"** = the function was unreachable / not
  deployed (HTTP status 0) — usually the owner must deploy functions.
- A bug that also happens in the Android app is usually in `functions/index.js`
  or `firestore.rules`; ask the owner for the Functions logs.
- Emergency: the owner can roll back in Vercel → Deployments → ⋯ →
  Promote to Production / Instant Rollback.
