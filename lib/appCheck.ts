"use client";

import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";
import app from "./firebase";

// Firebase App Check for the website: every Firestore / Functions / Storage
// request carries a token proving it came from this site (reCAPTCHA
// Enterprise, invisible). It only turns on when the site key is set in
// NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY.
//
// This alone blocks nothing. Blocking starts only when "Enforce" is switched
// on per product in Firebase console › App Check — and that also blocks the
// Android app unless the app sends valid tokens too (its App Check is off
// for now: ENABLE_APP_CHECK in MainActivity.kt). Don't enforce before that.

let started = false;

export function startAppCheck() {
  if (started || typeof window === "undefined") return;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_KEY;
  if (!siteKey) return;
  started = true;
  // Local testing (npm run dev): a debug token, printed in the browser
  // console, that you register in the console under App Check › Manage debug tokens.
  if (process.env.NODE_ENV !== "production") {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean }).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
  }
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaEnterpriseProvider(siteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.error("App Check could not start", err);
  }
}
