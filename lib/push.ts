"use client";

import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { httpsCallable } from "firebase/functions";
import app, { functions } from "./firebase";

// Web push. The browser's token is saved by the registerWebPushToken Cloud
// Function in users_private/{uid}.webPushTokens — never in users/{uid}.fcmToken,
// which belongs to the Android app.

const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY || "";
const FLAG = "migwith.push"; // "on" once the person turned push on in this browser

const registerCall = httpsCallable<{ token: string }, { ok: boolean }>(functions, "registerWebPushToken");
const unregisterCall = httpsCallable<{ token: string }, { ok: boolean }>(functions, "unregisterWebPushToken");

export type PushStatus = "unsupported" | "ios-install" | "blocked" | "off" | "on";

function flag(): boolean {
  try {
    return localStorage.getItem(FLAG) === "on";
  } catch {
    return false;
  }
}

function setFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(FLAG, "on");
    else localStorage.removeItem(FLAG);
  } catch {
    // ignore
  }
}

export async function pushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined" || !VAPID_KEY) return "unsupported";
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true;
  // iPhone only allows web push for a site added to the home screen.
  if (ios && !standalone) return "ios-install";
  if (!("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported().catch(() => false))) {
    return "unsupported";
  }
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && flag() ? "on" : "off";
}

async function currentToken(): Promise<string> {
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  return getToken(getMessaging(app), { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
}

/** Asks for permission (if needed) and saves this browser for the signed-in user. */
export async function turnPushOn(): Promise<void> {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications were not allowed.");
  const token = await currentToken();
  if (!token) throw new Error("Could not get a push token.");
  await registerCall({ token });
  setFlag(true);
}

/** Stops pushes to this browser. */
export async function turnPushOff(): Promise<void> {
  setFlag(false);
  try {
    const token = await currentToken();
    if (token) await unregisterCall({ token });
    await deleteToken(getMessaging(app));
  } catch (err) {
    console.error("turn push off", err);
  }
}

/** After sign-in: keep this browser's (possibly refreshed) token saved for this user. */
export async function syncPush(): Promise<void> {
  if ((await pushStatus()) !== "on") return;
  try {
    const token = await currentToken();
    if (token) await registerCall({ token });
  } catch (err) {
    console.error("push sync", err);
  }
}

/** Before sign-out: this browser should stop getting the old account's pushes. */
export async function detachPushForLogout(): Promise<void> {
  if ((await pushStatus()) !== "on") return;
  try {
    const token = await currentToken();
    if (token) await unregisterCall({ token });
  } catch (err) {
    console.error("push detach", err);
  }
}
