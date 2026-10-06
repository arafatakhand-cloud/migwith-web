"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { PageShell } from "../_components/PageShell";
import { BackPill } from "../_components/BackButton";

// Security PIN: change it (needs the current PIN) or reset a forgotten one
// with a code sent to the Recovery Email. The PIN is hashed and checked only
// by the Cloud Functions (setSecurityPin / requestPinResetEmailCode /
// resetPinWithEmailCode); the web never sees or stores it.

const getPinStatus = httpsCallable<Record<string, never>, { hasPin?: boolean; isDefault?: boolean }>(functions, "getPinStatus");
const getMyContactEmail = httpsCallable<Record<string, never>, { contactEmail?: string }>(functions, "getMyContactEmail");
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

// Recovery Email: the same code check sign-up uses, then setContactEmail
// saves it on the caller's own profile.
const sendEmailVerificationCode = httpsCallable<{ email: string }, { ok: boolean }>(
  functions,
  "sendEmailVerificationCode"
);
const verifyEmailVerificationCode = httpsCallable<{ email: string; code: string }, { ok: boolean }>(
  functions,
  "verifyEmailVerificationCode"
);
const setContactEmail = httpsCallable<{ email: string; verificationCode: string }, { ok: boolean }>(
  functions,
  "setContactEmail"
);

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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

  // Recovery Email
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailMsg, setEmailMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    // 🔒 PIN state and your email are private now — only the server gives
    // them, and only to you (getPinStatus / getMyContactEmail).
    getPinStatus({})
      .then(({ data }) => setHasPin(data?.hasPin === true))
      .catch(() => setHasPin(true));
    getMyContactEmail({})
      .then(({ data }) => setEmail(String(data?.contactEmail || "").trim()))
      .catch(() => {});
  }, [user]);

  const sendEmailCode = async () => {
    setEmailMsg(null);
    const e = newEmail.trim().toLowerCase();
    if (!EMAIL.test(e)) return setEmailMsg({ text: "Enter a valid email address.", error: true });
    if (e === email.toLowerCase()) return setEmailMsg({ text: "That is already your Recovery Email.", error: true });
    setEmailBusy(true);
    try {
      await sendEmailVerificationCode({ email: e });
      setEmailCodeSent(true);
      setEmailMsg({ text: `📧 A code was sent to ${e}. It expires in 10 minutes.`, error: false });
    } catch (err: any) {
      setEmailMsg({ text: err?.message || "Could not send the code.", error: true });
    } finally {
      setEmailBusy(false);
    }
  };

  const saveEmail = async () => {
    setEmailMsg(null);
    const e = newEmail.trim().toLowerCase();
    const c = emailCode.trim().toUpperCase();
    if (!c) return setEmailMsg({ text: "Enter the code from your email.", error: true });
    setEmailBusy(true);
    try {
      await verifyEmailVerificationCode({ email: e, code: c });
      await setContactEmail({ email: e, verificationCode: c });
      setEmail(e);
      setEditingEmail(false);
      setEmailCodeSent(false);
      setNewEmail("");
      setEmailCode("");
      setEmailMsg({ text: "✅ Recovery Email saved.", error: false });
    } catch (err: any) {
      setEmailMsg({ text: err?.message || "Could not save the email.", error: true });
    } finally {
      setEmailBusy(false);
    }
  };

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
      <PageShell light>
        <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>
      </PageShell>
    );
  }

  const field =
    "w-full rounded-xl border border-[#D5E3F5] bg-white px-4 py-3 text-sm tracking-widest text-[#0B2A5B] outline-none placeholder:tracking-normal placeholder:text-[#8A9BBC] focus:border-[#2F80ED]";
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
    <PageShell light>
      <section className="mx-auto max-w-md px-4 py-8 sm:px-6">
        <h1 className="text-2xl font-black tracking-wide">🛡️ Security PIN</h1>
        <p className="mt-1 text-sm text-[#35507E]">Your PIN protects coin transfers. Never share it with anyone.</p>

        {/* Recovery Email */}
        <div className="mt-6 space-y-3 rounded-3xl border border-[#BFD7F7] bg-white p-5 shadow-sm">
          <h2 className="font-black">📧 Recovery Email</h2>
          {!editingEmail ? (
            <>
              <p className="text-sm text-[#5B6B8C]">
                {email ? (
                  <>
                    Codes for a forgotten PIN or password go to{" "}
                    <span className="font-semibold text-[#0B2A5B]">{maskEmail(email)}</span>.
                  </>
                ) : (
                  "No Recovery Email yet. Add one so you can reset a forgotten PIN or password."
                )}
              </p>
              <button
                type="button"
                onClick={() => {
                  setEditingEmail(true);
                  setEmailMsg(null);
                }}
                className="w-full rounded-2xl border border-[#2F80ED] py-3 font-bold text-[#2F80ED] hover:bg-[#EAF4FE]"
              >
                {email ? "Change email" : "➕ Add Recovery Email"}
              </button>
            </>
          ) : (
            <>
              <input
                value={newEmail}
                onChange={(e) => {
                  setNewEmail(e.target.value);
                  setEmailCodeSent(false);
                }}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                className={field.replace("tracking-widest", "")}
              />
              {emailCodeSent && (
                <input
                  value={emailCode}
                  onChange={(e) => setEmailCode(e.target.value.toUpperCase().slice(0, 12))}
                  autoComplete="one-time-code"
                  placeholder="Code from your email"
                  className={field}
                />
              )}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingEmail(false);
                    setEmailCodeSent(false);
                    setEmailMsg(null);
                  }}
                  disabled={emailBusy}
                  className="flex-1 rounded-2xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={emailCodeSent ? saveEmail : sendEmailCode}
                  disabled={emailBusy}
                  className="flex-1 rounded-2xl bg-[#2F80ED] py-3 text-sm font-black text-white disabled:opacity-50"
                >
                  {emailBusy ? "Please wait…" : emailCodeSent ? "Verify & Save" : "Send code"}
                </button>
              </div>
              {emailCodeSent && (
                <button
                  type="button"
                  onClick={sendEmailCode}
                  disabled={emailBusy}
                  className="w-full text-center text-xs text-[#5B6B8C] hover:text-[#0B2A5B]"
                >
                  Didn&apos;t get it? Send a new code
                </button>
              )}
            </>
          )}
          {emailMsg && (
            <p className={`text-sm ${emailMsg.error ? "text-rose-600" : "text-emerald-600"}`}>{emailMsg.text}</p>
          )}
        </div>

        {/* Change */}
        <div className="mt-5 space-y-3 rounded-3xl border border-[#BFD7F7] bg-white p-5 shadow-sm">
          <h2 className="font-black">{hasPin === false ? "Set a PIN" : "Change PIN"}</h2>
          {hasPin !== false && pinInput(currentPin, setCurrentPin, "Current PIN")}
          {pinInput(newPin, setNewPin, "New PIN (4–6 digits)")}
          {pinInput(confirmPin, setConfirmPin, "Confirm new PIN")}
          {changeMsg && (
            <p className={`text-sm ${changeMsg.error ? "text-rose-600" : "text-emerald-600"}`}>{changeMsg.text}</p>
          )}
          <button
            type="button"
            onClick={change}
            disabled={changeBusy || hasPin === null}
            className="w-full rounded-2xl bg-[#2F80ED] py-3 font-black text-white disabled:opacity-50"
          >
            {changeBusy ? "Saving…" : hasPin === false ? "Set PIN" : "Change PIN"}
          </button>
          <p className="text-center text-xs text-[#6B7A99]">5 wrong PINs lock it for 15 minutes.</p>
        </div>

        {/* Forgot */}
        {hasPin !== false && (
          <div className="mt-5 space-y-3 rounded-3xl border border-[#FFD9A8] bg-[#FFF8EE] p-5 shadow-sm">
            <h2 className="font-black">Forgot your PIN?</h2>
            {!email ? (
              <p className="text-sm text-[#5B6B8C]">
                A PIN can only be reset with a Recovery Email. Add one above first.
              </p>
            ) : !codeSent ? (
              <>
                <p className="text-sm text-[#5B6B8C]">
                  We&apos;ll send a reset code to <span className="font-semibold text-[#0B2A5B]">{maskEmail(email)}</span>.
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
                  className="w-full text-center text-xs text-[#5B6B8C] hover:text-[#0B2A5B]"
                >
                  Didn&apos;t get it? Send a new code
                </button>
              </>
            )}
            {resetMsg && (
              <p className={`text-sm ${resetMsg.error ? "text-rose-600" : "text-emerald-600"}`}>{resetMsg.text}</p>
            )}
          </div>
        )}

        <p className="mt-6 text-center">
          <BackPill href="/settings" label="Back to Settings" />
        </p>
      </section>
    </PageShell>
  );
}
