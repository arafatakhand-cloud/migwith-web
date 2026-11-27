import { getApps, getApp, initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import { getAuth } from "firebase/auth";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

const app = getApps().length
  ? getApp()
  : initializeApp(firebaseConfig);

// 🛡️ App Check (like the app's Play Integrity): every request carries a
// reCAPTCHA pass proving it comes from the real miGlife web. Only when the
// site key is set (Vercel env NEXT_PUBLIC_RECAPTCHA_SITE_KEY). It must be set
// up BEFORE App Check is ever enforced in the console — while it is only
// monitored, nothing is refused either way.
const appCheckKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
if (typeof window !== "undefined" && appCheckKey) {
  try {
    initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(appCheckKey), isTokenAutoRefreshEnabled: true });
  } catch (e) {
    console.error("App Check could not start", e);
  }
}

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Must match FUNCTIONS_REGION in the Cloud Functions index.js.
export const functions = getFunctions(app, "asia-south1");

// 🌐 2026-11-27 (leaving Firebase billing, step 1): the same functions also run on
// miGlife's own server. app_settings/api.useVps chooses where every call goes; the
// Firebase copies stay as the backup (the server turns useVps off if the VPS stops).
// The Firebase SDK reads `customDomain` on every call, so switching needs no reload.
export const API_VPS_URL = "https://api.miglife.app";
if (typeof window !== "undefined") {
  onSnapshot(
    doc(db, "app_settings", "api"),
    (s) => {
      (functions as unknown as { customDomain: string | null }).customDomain = s.get("useVps") === true ? API_VPS_URL : null;
    },
    () => {}
  );
}

export default app;
