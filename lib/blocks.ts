"use client";

import { doc, getDoc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

// 🔒 My block list lives in user_blocks/{uid} { names } — only I can read it
// (it used to be users/{uid}.blockedUsers, which everyone signed in could
// read). The app uses the same document.

const blocksRef = (uid: string) => doc(db, "user_blocks", uid);
const clean = (raw: unknown): string[] => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string") : []);

export async function getBlockedNames(uid: string): Promise<string[]> {
  const snap = await getDoc(blocksRef(uid));
  return clean(snap.get("names"));
}

/** Live list of the names I blocked (as saved). */
export function watchBlockedNames(uid: string, onChange: (names: string[]) => void): () => void {
  return onSnapshot(
    blocksRef(uid),
    (s) => onChange(clean(s.get("names"))),
    () => onChange([])
  );
}

export async function saveBlockedNames(uid: string, names: string[]): Promise<void> {
  await setDoc(blocksRef(uid), { names, updatedAt: serverTimestamp() });
}

/** Block / unblock one person (any letter case matches). */
export async function setBlocked(uid: string, target: string, blocked: boolean): Promise<void> {
  const current = await getBlockedNames(uid);
  const already = current.some((n) => n.toLowerCase() === target.toLowerCase());
  if (blocked === already) return;
  await saveBlockedNames(uid, blocked ? [...current, target] : current.filter((n) => n.toLowerCase() !== target.toLowerCase()));
}

// 🔒 Profile details (full name, birthday, bio, relationship, cover photo)
// live in profile_details/{uid}: hidden from non-friends when the profile is
// locked (the rules check). The app uses the same document.
export type ProfileDetails = { fullName: string; dateOfBirth: string; bio: string; relationship: string; coverPhotoUrl: string };
const EMPTY_DETAILS: ProfileDetails = { fullName: "", dateOfBirth: "", bio: "", relationship: "", coverPhotoUrl: "" };

/** Someone's details — empty when they are hidden from me (or not set). */
export async function getProfileDetails(uid: string): Promise<ProfileDetails> {
  try {
    const s = await getDoc(doc(db, "profile_details", uid));
    const str = (k: string) => String(s.get(k) || "").trim();
    return { fullName: str("fullName"), dateOfBirth: str("dateOfBirth"), bio: str("bio"), relationship: str("relationship"), coverPhotoUrl: str("coverPhotoUrl") };
  } catch {
    return EMPTY_DETAILS;
  }
}

export async function saveProfileDetails(uid: string, username: string, details: Partial<ProfileDetails>): Promise<void> {
  await setDoc(
    doc(db, "profile_details", uid),
    { ...details, usernameLower: username.trim().toLowerCase(), updatedAt: serverTimestamp() },
    { merge: true }
  );
}
