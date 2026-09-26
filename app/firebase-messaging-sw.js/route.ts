// Service worker for web push. Served at /firebase-messaging-sw.js (the path the
// Firebase SDK expects). The Firebase scripts are copies of the npm package's
// compat builds in public/firebase-sdk/ (update them when upgrading firebase).
// Pushes carry a "webpush.notification", so the SDK shows them and opens their
// link when tapped — no extra code needed here.

export const dynamic = "force-static";

export function GET() {
  const config = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const js = `importScripts("/firebase-sdk/firebase-app-compat.js", "/firebase-sdk/firebase-messaging-compat.js");
firebase.initializeApp(${JSON.stringify(config)});
firebase.messaging();
`;
  return new Response(js, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Service-Worker-Allowed": "/",
      "Cache-Control": "no-cache",
    },
  });
}
