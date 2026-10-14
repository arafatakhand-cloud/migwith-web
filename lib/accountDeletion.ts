"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🗑 Account deletion: Settings → Delete account (app and web), or by email
// (web.miglife.app/delete-account, scheduled by miglife in secret → Delete
// Account). Deleted after 7 days; signing in again before that cancels it.
export const founderAccountDeletion = httpsCallable<
  { username: string; action: "status" | "schedule" | "cancel" },
  { username: string; status: string; scheduledAt?: number; coins?: number }
>(functions, "founderAccountDeletion");
export const cancelAccountDeletion = httpsCallable<Record<string, never>, { cancelled: boolean; scheduledAt?: number }>(
  functions,
  "cancelAccountDeletion"
);

export const requestAccountDeletion = httpsCallable<{ confirm: string }, { ok: boolean; scheduledAt: number; days: number }>(
  functions,
  "requestAccountDeletion"
);

export const SUPPORT_EMAIL = "support@miglife.app";
