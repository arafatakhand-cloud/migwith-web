"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

// 🎚 TRANSFER LIMITS — set by miGlife (miGlife secret → Transfer Limits), the
// app's TransferLimits.kt. Daily transfer caps per role (null = unlimited);
// mentors are always unlimited. merchantAcceptCoins = coins a mentor sends when
// accepting a merchant; merchantNewMax = most coins a NEW merchant may hold.

export type TransferLimits = {
  founder: number | null;
  staff: number | null;
  admin: number | null;
  merchant: number | null;
  user: number | null;
  merchantAcceptCoins: number;
  merchantNewMax: number | null;
};

export const TRANSFER_LIMIT_DEFAULTS: TransferLimits = {
  founder: null,
  staff: 400_000,
  admin: 400_000,
  merchant: 1_500_000,
  user: 400_000,
  merchantAcceptCoins: 200_000,
  merchantNewMax: 300_000,
};

export const transferLimitsCall = httpsCallable<{ action: "get" | "set"; limits?: Record<string, number | null> }, Partial<TransferLimits>>(
  functions,
  "transferLimits"
);

const cap = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
export function cleanLimits(m: Partial<TransferLimits> | null | undefined): TransferLimits {
  if (!m) return TRANSFER_LIMIT_DEFAULTS;
  return {
    founder: cap(m.founder),
    staff: cap(m.staff),
    admin: cap(m.admin),
    merchant: cap(m.merchant),
    user: cap(m.user),
    merchantNewMax: cap(m.merchantNewMax),
    merchantAcceptCoins: typeof m.merchantAcceptCoins === "number" ? m.merchantAcceptCoins : 0,
  };
}

let cache: { at: number; v: TransferLimits } | null = null;

/** The current limits (fetched at most once a minute; defaults until loaded). */
export function useTransferLimits(enabled = true): TransferLimits {
  const [v, setV] = useState<TransferLimits>(cache?.v ?? TRANSFER_LIMIT_DEFAULTS);
  useEffect(() => {
    if (!enabled) return;
    if (cache && Date.now() - cache.at < 60_000) return setV(cache.v);
    let gone = false;
    transferLimitsCall({ action: "get" })
      .then(({ data }) => {
        cache = { at: Date.now(), v: cleanLimits(data) };
        if (!gone) setV(cache.v);
      })
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [enabled]);
  return v;
}

export function rememberTransferLimits(v: TransferLimits) {
  cache = { at: Date.now(), v };
}

/** Daily cap for this account (null = unlimited) — the same rule as the server. */
export function transferCapFor(l: TransferLimits, isFounder: boolean, role: string, roles: string[] = []): number | null {
  const all = [role, ...roles].map((r) => String(r || "").trim().toLowerCase());
  if (isFounder) return l.founder;
  if (all.includes("mentor")) return null;
  if (all.some((r) => r === "admin" || r === "administrator")) return l.admin;
  if (all.includes("staff")) return l.staff;
  if (all.includes("merchant")) return l.merchant;
  return l.user;
}

export const formatLimit = (v: number | null) => (v === null ? "Unlimited" : v.toLocaleString("en-US"));
