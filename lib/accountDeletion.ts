"use client";

import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🗑 Account deletion: requested by email (web.miglife.app/delete-account),
// scheduled by miglife (secret → Delete Account), deleted after 7 days.
// Signing in again before that cancels it.
export const founderAccountDeletion = httpsCallable<
  { username: string; action: "status" | "schedule" | "cancel" },
  { username: string; status: string; scheduledAt?: number; coins?: number }
>(functions, "founderAccountDeletion");
export const cancelAccountDeletion = httpsCallable<Record<string, never>, { cancelled: boolean; scheduledAt?: number }>(
  functions,
  "cancelAccountDeletion"
);

export const SUPPORT_EMAIL = "support@miglife.app";
