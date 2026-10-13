"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🗑 Delete my account (requestAccountDeletion / cancelAccountDeletion in
// index.js): deleted after 7 days; signing in again before that cancels it.
export const requestAccountDeletion = httpsCallable<{ confirm: string }, { ok: boolean; scheduledAt: number; days: number }>(
  functions,
  "requestAccountDeletion"
);
export const cancelAccountDeletion = httpsCallable<Record<string, never>, { cancelled: boolean; scheduledAt?: number }>(
  functions,
  "cancelAccountDeletion"
);

export const SUPPORT_EMAIL = "support@miglife.app";
