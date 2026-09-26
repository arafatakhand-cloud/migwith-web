# MIGwith Web

The MIGwith website: landing page, login, registration and password reset,
sharing the same Firebase project and Cloud Functions as the Android app.

Built with Next.js, Tailwind CSS and Firebase.

## Run locally

1. Copy `.env.example` to `.env.local` and fill in the Firebase web app config
   (Firebase console → Project settings → Your apps → Web app).
2. Install and start:

   ```bash
   npm install
   npm run dev
   ```

3. Open http://localhost:3000

## Deploy

Deployed on Vercel. Set the same `NEXT_PUBLIC_FIREBASE_*` variables in the
Vercel project's Environment Variables. Pushes to `main` deploy to production.

## Project layout

- `app/` — pages (`/`, `/login`, `/register`, `/forgot-password`)
- `app/_components/` — shared UI pieces
- `lib/firebase.ts` — Firebase app, Auth, Firestore, Storage and Functions (`asia-south1`)
- `lib/useCurrentUser.ts` — signed-in user and their MIG ID
