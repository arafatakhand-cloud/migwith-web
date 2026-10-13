"use client";

import { getApps, initializeApp } from "firebase/app";
import { getAuth, inMemoryPersistence, setPersistence, signInWithCustomToken, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { useEffect, useState } from "react";
import app, { auth, functions } from "./firebase";
import { migAliasEmail } from "./migAlias";
import { detachPushForLogout } from "./push";
import { leaveAllOpenRooms } from "./openRooms";
import { markOfflineForLogout } from "./heartbeat";
import { clearRememberedAmounts } from "./amountMemory";

// 🔀 Switch Account (miglife): up to 5 saved accounts, each added ONCE with its
// password, then opened with one tap; "Return to miglife" comes back. The
// server (founderSwitchAccount / founderSavedAccounts / founderReturnToMain in
// index.js) checks everything — this file only calls it.

export type SavedAccount = { uid: string; username: string; level: number; photo: string };

const savedCall = httpsCallable<
  { action: "list" | "add" | "remove"; username?: string; proofToken?: string; uid?: string },
  { accounts: SavedAccount[]; max: number; currentUid: string }
>(functions, "founderSavedAccounts");
const switchCall = httpsCallable<{ username: string; proofToken?: string }, { token: string; username: string }>(functions, "founderSwitchAccount");
const returnCall = httpsCallable<Record<string, never>, { token: string; username: string }>(functions, "founderReturnToMain");

export const listSavedAccounts = () => savedCall({ action: "list" }).then((r) => r.data);
export const removeSavedAccount = (uid: string) => savedCall({ action: "remove", uid }).then((r) => r.data);

/** Checks the ID's password with a separate, throw-away login; returns its fresh sign-in token. */
async function passwordProof(username: string, password: string): Promise<string> {
  const check = getApps().find((a) => a.name === "switchCheck") || initializeApp(app.options, "switchCheck");
  const checkAuth = getAuth(check);
  await setPersistence(checkAuth, inMemoryPersistence);
  try {
    const cred = await signInWithEmailAndPassword(checkAuth, migAliasEmail(username), password);
    return await cred.user.getIdToken(true);
  } catch (e: any) {
    const code = String(e?.code || "");
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      throw new Error("Wrong MIG ID or password.");
    }
    throw e;
  } finally {
    await signOut(checkAuth).catch(() => {});
  }
}

export async function addSavedAccount(username: string, password: string) {
  const proofToken = await passwordProof(username, password);
  return (await savedCall({ action: "add", username, proofToken })).data;
}

// Leave this account cleanly (rooms, push, online), then sign in with the token.
async function signInAs(token: string) {
  const uid = auth.currentUser?.uid;
  await detachPushForLogout().catch(() => {});
  if (uid) await leaveAllOpenRooms(uid).catch(() => {});
  await markOfflineForLogout(uid).catch(() => {});
  clearRememberedAmounts();
  await signInWithCustomToken(auth, token);
  window.location.href = "/";
}

export async function switchToAccount(username: string) {
  const { data } = await switchCall({ username });
  await signInAs(data.token);
}

export async function returnToMiglife() {
  const { data } = await returnCall({});
  await signInAs(data.token);
}

/** True in an account miglife switched into (its sign-in carries founderUid). */
export function useSwitchedSession(): boolean {
  const [switched, setSwitched] = useState(false);
  useEffect(
    () =>
      auth.onIdTokenChanged(async (u) => {
        if (!u) return setSwitched(false);
        const r = await u.getIdTokenResult().catch(() => null);
        setSwitched(!!r?.claims?.founderUid);
      }),
    []
  );
  return switched;
}
