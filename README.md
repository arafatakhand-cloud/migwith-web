# MIGwith Web

The MIGwith website at [migwith.vercel.app](https://migwith.vercel.app). It is a web version of the
MIGwith Android app for chat rooms, gifts and games.

It uses the **same Firebase project** as the app. Web and app users share the same accounts, coins,
rooms and messages. Nothing here keeps its own data.

Built with Next.js 15 (App Router), React 19, Tailwind CSS 4 and the Firebase JS SDK.

## Features

| Area | Pages | What it does |
|------|-------|--------------|
| Account | `/login`, `/register`, `/forgot-password` | Sign in with MIG ID and password. Register with an email code. Reset a password by email code. |
| Rooms | `/rooms`, `/room/[name]` | Official country and game rooms plus user rooms. Live chat, who is in the room, entry and leave notices. |
| Room tools | inside a room | Photos 📷, voice messages 🎤, gifts 🎁. `/` social commands (`/me`, `/hug`, `/roll`, `/pick` …). |
| Room owners | inside a room | Create a room (Level 10+). Kick, ban, mute, lock, silence, entry level, mods and super mods. Rooms have a capacity limit. |
| Games | game rooms | Luxury Bot, MIG Royale, Teen Patti, Cricket, 29, LowCard and Ludo. |
| Private chat | `/messages`, `/chat/[username]` | 1:1 messages with read ticks, photos and gifts. |
| People | `/profile/[username]`, `/profile/edit`, `/friends` | Profiles with follow, block and footprints. Profile editing with photo and cover upload. Friend requests. |
| Alerts | `/alerts` | Friend requests, invites and coin transfers, with a 🔔 badge. |
| Coins | `/wallet`, `/security` | Balance, activity history and coin transfer with a PIN. Change or reset the Security PIN. Recovery Email. |
| Leader Board | `/leaderboard` | Game boards, gifts sent and received, and top levels. |
| Phone | — | Bottom tab bar on phones. Installable to the home screen (PWA). |

## How it talks to Firebase

- **Money, games and anything security-related go through Cloud Functions** (region `asia-south1`).
  This covers gifts, transfers, PINs, game moves and sign-up. The website never writes a coin balance
  itself.
- **Simple data is read and written directly in Firestore.** This covers chat messages, presence,
  friend requests, alerts and profile fields. The Firestore security rules decide what is allowed.
- Firestore documents are written in **exactly the same shape as the Android app**. The code comments
  point to the app files they copy (`RoomPage.kt`, `MainActivity.kt` …). When the app changes a
  document shape, change it here too.
- Uploads use the app's Storage folders: `profile_pictures/`, `cover_pictures/`, `room_images/`,
  `room_audio/` and `private_images/`.

## Run locally

Requirements: Node.js 20+.

1. Copy `.env.example` to `.env.local` and fill in the Firebase **web app** config. You find it in
   Firebase console → Project settings → Your apps → Web app.

   ```
   NEXT_PUBLIC_FIREBASE_API_KEY=
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=
   NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
   NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
   NEXT_PUBLIC_FIREBASE_APP_ID=
   NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=
   ```

   `.env.local` is git-ignored. Never commit keys.

2. Install and start:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:3000.

To check a production build:

```bash
npm run build
```

## Deploy

The site is hosted on **Vercel** and connected to this repository.

- A push to **any branch** creates a **Preview** deployment with its own link. Use it for testing.
- A push to **`main`** deploys to production at **migwith.vercel.app**.
- The same `NEXT_PUBLIC_FIREBASE_*` variables are set in Vercel → Project → Settings → Environment
  Variables, for both Production and Preview.

Workflow: make the change on a branch, test its Preview link, then merge into `main`.

## Project layout

```
app/
  layout.tsx            root layout; <AppSession> provides the signed-in user and badge counts to the whole site
  manifest.ts           PWA manifest (install to home screen)
  page.tsx              landing page
  login/ register/ forgot-password/
  rooms/                room list and "Create Room"
  room/[name]/          a chat room: chat, presence, moderation, media, gifts and the game for that room
  messages/ chat/[username]/
  profile/[username]/ profile/edit/ friends/ alerts/
  wallet/ security/ leaderboard/
  _components/
    PageShell.tsx       dark background, header and phone bottom bar
    AuthControls.tsx    header buttons and home-page actions
    BottomNav.tsx       phone tab bar
    AppSession.tsx      one shared sign-in listener and one set of badge listeners
    GiftPanel.tsx       send-a-gift sheet (rooms and private chat)
    VoiceRecorder.tsx   🎤 record → review → send
    InstallApp.tsx      "Install MIGwith" button
    Cards.tsx           playing-card faces for the card games
    LuxuryBot.tsx RoyaleGame.tsx TeenPatti.tsx CricketGame.tsx TwentyNine.tsx LowCard.tsx Ludo.tsx
lib/
  firebase.ts           Firebase app, Auth, Firestore, Storage, Functions (asia-south1)
  useCurrentUser.ts     signed-in user + MIG ID
  rooms.ts              official room names, presence timings, entry/leave texts
  roomCommands.ts       "/" social commands, /pick, /invite, /whois
  roomModeration.ts     room roles and kick / ban / mute / lock / silence / level / mods
  privateChat.ts        chat ids, friends, unread counts
  friends.ts            friend requests (send / accept / decline / cancel / remove)
  alerts.ts useBadges.ts giftActivity.ts imageUpload.ts
public/                 app icons
```

Each game component has a `useX()` hook, a `xHandleCommand()` function and a table component.
- The hook listens to `room_game/{room}` and sends moves to that game's Cloud Functions.
- `xHandleCommand()` handles the `!` chat commands.
- The table component draws the game.

The server decides every result. The web only shows the game state and nudges the `tick…` function
once a timer has passed.

## Adding a feature

1. Find how the Android app does it: which Firestore documents it reads and writes, and which Cloud
   Functions it calls. Copy those shapes exactly.
2. Build it on a branch and run `npm run build`.
3. Push the branch, test the Vercel Preview (ideally together with the app), then merge into `main`.
