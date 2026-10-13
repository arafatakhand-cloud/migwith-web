"use client";

import { useEffect, useState, type ReactNode } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { input } from "./_Shell";

// 🔒 miGlife SECRET LOCK (the app's SecretLock.kt). The miGlife account has a
// personal Secret PIN, checked on the SERVER (secretLock in index.js). Every
// founder / secret function refuses to run until the secret is opened on this
// sign-in, so the web opens it with the Secret PIN (no fingerprint here).
// Open for 5 minutes on screen; leaving the page (tab hidden) locks it again.

type Status = { hasPin?: boolean; trusted?: boolean; open?: boolean; lockedUntil?: number };
const secretLock = httpsCallable<Record<string, unknown>, Status & { ok?: boolean }>(functions, "secretLock");

const OPEN_FOR_MS = 5 * 60_000;
let unlockedAt = 0;
const isOpenHere = () => unlockedAt > 0 && Date.now() - unlockedAt < OPEN_FOR_MS;

/** This browser's own random key (the server only keeps its hash). */
function deviceKey(): string {
  try {
    const k = localStorage.getItem("migwith.secretDeviceKey");
    if (k && k.length >= 16) return k;
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const v = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    localStorage.setItem("migwith.secretDeviceKey", v);
    return v;
  } catch {
    return "";
  }
}

const errText = (e: any) => {
  const m = String(e?.message || "");
  return m && m !== "internal" && m !== "INTERNAL" ? m : "Something went wrong. Try again.";
};

/** Shows [children] only after miGlife's secret is opened; otherwise the lock screen. */
export function SecretLockGate({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const [open, setOpen] = useState(isOpenHere);
  const [hasPin, setHasPin] = useState<boolean | null>(null); // null = loading
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // the screen locks itself after 5 minutes, and when the page is hidden
  useEffect(() => {
    if (!open) return;
    const lock = () => {
      if (unlockedAt) secretLock({ action: "lock" }).catch(() => {});
      unlockedAt = 0;
      setOpen(false);
    };
    const t = setTimeout(lock, Math.max(0, OPEN_FOR_MS - (Date.now() - unlockedAt)));
    const onHide = () => document.visibilityState === "hidden" && lock();
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    secretLock({ action: "status", deviceKey: deviceKey() })
      .then(({ data }) => {
        setHasPin(data?.hasPin === true);
        // already open on this sign-in (opened a moment ago) → straight in
        if (data?.hasPin && data.open) {
          unlockedAt = Date.now();
          setOpen(true);
        }
      })
      .catch((e) => {
        setError(errText(e));
        setHasPin(null);
      });
  }, [open]);

  if (open) return <>{children}</>;

  const submit = () => {
    setError(null);
    if (hasPin === false && pin !== pin2) return setError("The two PINs don't match.");
    setBusy(true);
    const data = hasPin === false ? { action: "setPin", pin, deviceKey: deviceKey() } : { action: "unlockPin", pin, deviceKey: deviceKey(), trust: false };
    secretLock(data)
      .then(() => {
        setPin("");
        setPin2("");
        unlockedAt = Date.now();
        setOpen(true);
      })
      .catch((e) => {
        setPin("");
        setError(errText(e));
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col items-center px-2 py-10 text-center">
      <span className="flex h-[84px] w-[84px] items-center justify-center rounded-full bg-[#0B1F3A14] text-[38px]">🔒</span>
      <p className="mt-4 text-[19px] font-extrabold">{hasPin === false ? "Set your Secret PIN" : "miGlife secret is locked"}</p>
      <p className="mt-1.5 max-w-sm text-[13px] text-[#5B6B8C]">
        {hasPin === false
          ? "Choose a Secret PIN (6–20 letters or digits). Only you will know it — it opens miGlife secret on any phone and on the web."
          : hasPin === true
            ? "Enter your Secret PIN."
            : "Checking…"}
      </p>
      {error && <p className="mt-2 text-xs text-[#E53935]">{error}</p>}
      {hasPin !== null && (
        <form
          className="mt-4 w-full max-w-[360px] space-y-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!busy && pin.length >= 6 && (hasPin || pin2)) submit();
          }}
        >
          <input
            type="password"
            autoComplete="off"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20))}
            placeholder={hasPin === false ? "New Secret PIN" : "Secret PIN"}
            className={input}
          />
          {hasPin === false && (
            <input
              type="password"
              autoComplete="off"
              value={pin2}
              onChange={(e) => setPin2(e.target.value.replace(/[^0-9A-Za-z]/g, "").slice(0, 20))}
              placeholder="Type it again"
              className={input}
            />
          )}
          <button
            type="submit"
            disabled={busy || pin.length < 6 || (hasPin === false && !pin2)}
            className="w-full rounded-xl bg-[#2F80ED] py-3 font-bold text-white disabled:opacity-50"
          >
            {busy ? "Checking…" : hasPin === false ? "Save Secret PIN" : "🔓 Unlock"}
          </button>
        </form>
      )}
      <button type="button" onClick={onBack} className="mt-2 text-sm text-[#5B6B8C]">
        Go back
      </button>
    </div>
  );
}
