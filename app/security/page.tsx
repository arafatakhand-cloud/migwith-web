"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";

// Security PIN: change it (needs the current PIN) or reset a forgotten one
// with a code sent to the Recovery Email. The PIN is hashed and checked only
// by the Cloud Functions (setSecurityPin / requestPinResetEmailCode /
// resetPinWithEmailCode); the web never sees or stores it.

const setSecurityPin = httpsCallable<{ pin: string; currentPin?: string }, { ok: boolean }>(
  functions,
  "setSecurityPin"
);
const requestPinResetEmailCode = httpsCallable<Record<string, never>, { ok: boolean }>(
  functions,
  "requestPinResetEmailCode"
);
const resetPinWithEmailCode = httpsCallable<{ code: string; pin: string }, { ok: boolean }>(
  functions,
  "resetPinWithEmailCode"
);

const PIN = /^\d{4,6}$/;
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 6);

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export default function SecurityPage() {
  const router = useRouter();
  const { user, loading } = useCurrentUser();

  const [hasPin, setHasPin] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");

  // Change PIN
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeMsg, setChangeMsg] = useState<{ text: string; error: boolean } | null>(null);

  // Forgot PIN
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [resetPin, setResetPin] = useState("");
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetBusy, setResetBusy] = useState(false);
  const [resetMsg, setResetMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        setHasPin(snap.get("hasSecurityPin") !== false);
        setEmail(String(snap.get("contactEmail") || "").trim());
      })
      .catch(() => setHasPin(true));
  }, [user]);

  const change = async () => {
    setChangeMsg(null);
    if (hasPin && !PIN.test(currentPin)) return setChangeMsg({ text: "Enter your current PIN.", error: true });
    if (!PIN.test(newPin)) return setChangeMsg({ text: "New PIN must be 4–6 digits.", error: true });
    if (newPin !== confirmPin) return setChangeMsg({ text: "The new PINs don't match.", error: true });
    if (hasPin && newPin === currentPin)
      return setChangeMsg({ text: "The new PIN is the same as the current one.", error: true });
    setChangeBusy(true);
    try {
      await setSecurityPin(hasPin ? { pin: newPin, currentPin } : { pin: newPin });
      setChangeMsg({ text: "✅ Your Security PIN has been changed.", error: false });
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      setHasPin(true);
    } catch (err: any) {
      setChangeMsg({ text: err?.message || "Could not change the PIN.", error: true });
    } finally {
      setChangeBusy(false);
    }
  };

  const sendCode = async () => {
    setResetMsg(null);
    setResetBusy(true);
    try {
      await requestPinResetEmailCode({});
      setCodeSent(true);
      setResetMsg({ text: `📧 A code was sent to ${maskEmail(email)}. It expires in 10 minutes.`, error: false });
    } catch (err: any) {
      setResetMsg({ text: err?.message || "Could not send the code.", error: true });
    } finally {
      setResetBusy(false);
    }
  };

  const reset = async () => {
    setResetMsg(null);
    if (!code.trim()) return setResetMsg({ text: "Enter the code from your email.", error: true });
    if (!PIN.test(resetPin)) return setResetMsg({ text: "New PIN must be 4–6 digits.", error: true });
    if (resetPin !== resetConfirm) return setResetMsg({ text: "The new PINs don't match.", error: true });
    setResetBusy(true);
    try {
      await resetPinWithEmailCode({ code: code.trim().toUpperCase(), pin: resetPin });
      setResetMsg({ text: "✅ Your Security PIN has been reset.", error: false });
      setCode("");
      setResetPin("");
      setResetConfirm("");
      setCodeSent(false);
      setHasPin(true);
    } catch (err: any) {
      setResetMsg({ text: err?.message || "Could not reset the PIN.", error: true });
    } finally {
      setResetBusy(false);
    }
  };

  if (loading || !user) {
    return (
      <PageShell>
        <p className="py-20 text-center text-sm text-white/40">Loading…</p>
      </PageShell>
    );
  }

  const field =
    "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm tracking-widest text-white outline-none placeholder:tracking-normal placeholder:text-white/25 focus:border-cyan-300/50";
  const pinInput = (value: string, set: (v: string) => void, placeholder: string) => (
    <input
      value={value}
      onChange={(e) => set(digits(e.target.value))}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      placeholder={placeholder}
      className={field}
    />
  );

  return (
    <PageShell>
      <section className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <h1 className="text-3xl font-black tracking-tight">🔐 Security PIN</h1>
        <p className="mt-1 text-sm text-white/45">Your PIN protects coin transfers. Never share it with anyone.</p>

        {/* Change */}
        <div className="mt-6 space-y-3 rounded-3xl border border-white/10 bg-white/[0.04] p-5">
          <h2 className="font-black">{hasPin === false ? "Set a PIN" : "Change PIN"}</h2>
          {hasPin !== false && pinInput(currentPin, setCurrentPin, "Current PIN")}
          {pinInput(newPin, setNewPin, "New PIN (4–6 digits)")}
          {pinInput(confirmPin, setConfirmPin, "Confirm new PIN")}
          {changeMsg && (
            <p className={`text-sm ${changeMsg.error ? "text-red-300" : "text-emerald-300"}`}>{changeMsg.text}</p>
          )}
          <button
            type="button"
            onClick={change}
            disabled={changeBusy || hasPin === null}
            className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-500 py-3 font-black disabled:opacity-50"
          >
            {changeBusy ? "Saving…" : hasPin === false ? "Set PIN" : "Change PIN"}
          </button>
          <p className="text-center text-xs text-white/35">5 wrong PINs lock it for 15 minutes.</p>
        </div>

        {/* Forgot */}
        {hasPin !== false && (
          <div className="mt-5 space-y-3 rounded-3xl border border-amber-300/20 bg-amber-300/[0.04] p-5">
            <h2 className="font-black">Forgot your PIN?</h2>
            {!email ? (
              <p className="text-sm text-white/60">
                A PIN can only be reset with a Recovery Email. Add one in the MIGwith app (Settings → Recovery
                Email), then come back here.
              </p>
            ) : !codeSent ? (
              <>
                <p className="text-sm text-white/60">
                  We&apos;ll send a reset code to <span className="font-semibold text-white">{maskEmail(email)}</span>.
                </p>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={resetBusy}
                  className="w-full rounded-2xl bg-amber-500 py-3 font-black text-neutral-900 disabled:opacity-50"
                >
                  {resetBusy ? "Sending…" : "📧 Send reset code"}
                </button>
              </>
            ) : (
              <>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 12))}
                  autoComplete="one-time-code"
                  placeholder="Code from your email"
                  className={field}
                />
                {pinInput(resetPin, setResetPin, "New PIN (4–6 digits)")}
                {pinInput(resetConfirm, setResetConfirm, "Confirm new PIN")}
                <button
                  type="button"
                  onClick={reset}
                  disabled={resetBusy}
                  className="w-full rounded-2xl bg-amber-500 py-3 font-black text-neutral-900 disabled:opacity-50"
                >
                  {resetBusy ? "Resetting…" : "Reset PIN"}
                </button>
                <button
                  type="button"
                  onClick={sendCode}
                  disabled={resetBusy}
                  className="w-full text-center text-xs text-white/45 hover:text-white"
                >
                  Didn&apos;t get it? Send a new code
                </button>
              </>
            )}
            {resetMsg && (
              <p className={`text-sm ${resetMsg.error ? "text-red-300" : "text-emerald-300"}`}>{resetMsg.text}</p>
            )}
          </div>
        )}

        <p className="mt-6 text-center text-xs text-white/30">
          <Link href="/wallet" className="hover:text-white/60">
            ← Back to My Account
          </Link>
        </p>
      </section>
    </PageShell>
  );
}
