"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db, functions } from "../../lib/firebase";
import { OFFICIAL_COUNTRY_ROOMS } from "../../lib/rooms";
import { isMainFounderName } from "../../lib/founder";
import { useSession } from "../_components/AppSession";
import { BackPill } from "../_components/BackButton";

// Create ID, the same flow as the app's RegisterPage: fill in the form, get a
// 6-character code by email (sendEmailVerificationCode), enter it
// (verifyEmailVerificationCode), then createNormalUserId makes the account
// and we sign straight in. Open only while the founder has "Other Users ID
// Creation" switched on (app_settings/id_creation); the server checks again.

const sendCode = httpsCallable(functions, "sendEmailVerificationCode");
const verifyCode = httpsCallable(functions, "verifyEmailVerificationCode");
const createId = httpsCallable<Record<string, unknown>, { username?: string }>(functions, "createNormalUserId");
const setSecurityPin = httpsCallable(functions, "setSecurityPin");

const GENDERS = ["Male", "Female", "Other"];
const input =
  "w-full rounded-xl border border-[#46516B] bg-[#17213A] px-3.5 py-3 text-white outline-none placeholder:text-[#9EA9C0] focus:border-[#FFC84A] disabled:opacity-60";
const label = "mb-1 block text-xs font-semibold text-[#9EA9C0]";

export default function RegisterPage() {
  const router = useRouter();
  const { username } = useSession();
  const isFounder = isMainFounderName(username);

  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [migId, setMigId] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [referral, setReferral] = useState("");
  const [terms, setTerms] = useState(false);
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"form" | "verify">("form");
  const [busy, setBusy] = useState<"" | "sending" | "verifying" | "creating">("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "id_creation"),
        (s) => setEnabled(s.get("otherUserCreationEnabled") === true),
        () => setEnabled(false)
      ),
    []
  );

  const minLen = isFounder ? 1 : 6;
  const maxLen = isFounder ? 27 : 16;
  const cleanEmail = email.trim().toLowerCase();

  const send = async () => {
    setError("");
    setInfo("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Please enter a valid email first.");
    setBusy("sending");
    try {
      await sendCode({ email: cleanEmail, migId: migId.trim() });
      setCode("");
      setStep("verify");
      setInfo("A 6-character verification code was sent to your email.");
    } catch (e: any) {
      setError(e?.message || "Could not send verification code.");
    } finally {
      setBusy("");
    }
  };

  const submitForm = () => {
    const id = migId.trim();
    setError("");
    if (!isFounder && !enabled) return setError("ID creation is currently disabled by FOUNDER.");
    if (!new RegExp(`^(?=.*[A-Za-z])[A-Za-z0-9._-]{${minLen},${maxLen}}$`).test(id))
      return setError(`MIG ID must be ${minLen}-${maxLen} characters and contain at least 1 English letter. Allowed: A-Z, a-z, 0-9, . _ -`);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return setError("Please enter a valid email.");
    if (!GENDERS.includes(gender)) return setError("Please select Male, Female or Other.");
    if (!country) return setError("Please select your country.");
    if (!terms) return setError("You must agree to the Terms & Privacy.");
    send();
  };

  const verifyAndCreate = async () => {
    const c = code.trim();
    setError("");
    setInfo("");
    if (c.length !== 6) return setError("Enter the 6-character verification code.");
    setBusy("verifying");
    try {
      await verifyCode({ email: cleanEmail, code: c });
    } catch (e: any) {
      setBusy("");
      return setError(e?.message || "Invalid or expired verification code.");
    }
    setInfo("✓ Email verified. Creating your MIG ID...");
    setBusy("creating");
    const id = migId.trim();
    let created = id;
    try {
      const { data } = await createId({
        migId: id,
        email: cleanEmail,
        password,
        confirmPassword: confirm,
        gender,
        country,
        referralCode: referral.trim(),
        termsAccepted: true,
        verificationCode: c,
      });
      created = data?.username || id;
    } catch (e: any) {
      setBusy("");
      setInfo("");
      return setError(e?.message || "MIG ID creation failed.");
    }
    try {
      await signInWithEmailAndPassword(auth, `${created.toLowerCase()}@login.migwith.local`, password);
      // Every account starts with the default coin-transfer PIN, like the app.
      setSecurityPin({ pin: "123456" }).catch(() => {});
      setInfo("MIG ID created successfully. Welcome to miglife!");
      router.replace("/");
    } catch {
      setBusy("");
      setInfo("");
      setError("MIG ID created, but automatic login failed. Please sign in manually.");
    }
  };

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen bg-gradient-to-b from-[#070A14] via-[#10172C] to-[#1A0E25] px-4 py-6 text-white">
      <div className="mx-auto w-full max-w-md">{children}</div>
    </main>
  );
  const card = "rounded-[30px] border-[1.5px] border-[#D8A62A] bg-[#10182C]/95 p-5 shadow-2xl";

  if (enabled === null) return shell(<p className="pt-24 text-center text-sm text-[#9EA9C0]">Loading…</p>);

  if (!isFounder && !enabled) {
    return shell(
      <div className={`${card} mt-24 text-center`}>
        <div className="text-5xl">🔒</div>
        <p className="mt-3 text-[21px] font-extrabold text-[#FFD66B]">ID CREATION IS OFF</p>
        <p className="mt-2 text-sm text-[#B8C1D3]">The FOUNDER must enable ID creation before a new MIG ID can be created.</p>
        <Link href="/login" className="mt-5 inline-block rounded-2xl bg-[#DDAA2D] px-6 py-3 font-extrabold text-black">
          BACK TO LOGIN
        </Link>
      </div>
    );
  }

  if (step === "verify") {
    return shell(
      <div className={`${card} mt-10 space-y-3 text-center`}>
        <div className="text-5xl">✉️</div>
        <p className="text-[23px] font-extrabold text-[#FFD66B]">VERIFY YOUR EMAIL</p>
        <p className="text-sm text-[#B8C1D3]">We sent a 6-character verification code to</p>
        <p className="break-all font-bold">{email.trim()}</p>
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6));
            setError("");
          }}
          placeholder="Enter code"
          aria-label="6-character code"
          disabled={!!busy}
          className={`${input} text-center text-lg tracking-[0.4em]`}
        />
        {error && <p className="text-sm font-bold text-[#FF6B6B]">{error}</p>}
        {info && <p className="text-sm font-bold text-[#52E38A]">{info}</p>}
        <button
          type="button"
          onClick={verifyAndCreate}
          disabled={!!busy || code.length !== 6}
          className="h-14 w-full rounded-2xl bg-[#DDAA2D] font-extrabold text-black disabled:opacity-50"
        >
          {busy === "verifying" ? "VERIFYING..." : busy === "creating" ? "CREATING..." : "VERIFY EMAIL"}
        </button>
        <button type="button" onClick={send} disabled={!!busy} className="font-bold text-[#FFC84A] disabled:opacity-50">
          {busy === "sending" ? "SENDING..." : "RESEND OTP"}
        </button>
        <div>
          <BackPill
            variant="dark"
            label="Back"
            disabled={!!busy}
            onClick={() => {
              setStep("form");
              setCode("");
              setError("");
              setInfo("");
            }}
          />
        </div>
      </div>
    );
  }

  const off = !!busy;
  return shell(
    <>
      <Link href="/login" className="mb-3 inline-block text-2xl text-[#FFC84A]" aria-label="Back to login">
        ←
      </Link>
      <div className={`${card} space-y-3`}>
        <p className="text-[13px] font-bold tracking-[0.15em] text-[#FFD66B]">✦ miglife</p>
        <p className="text-[27px] font-extrabold leading-tight">CREATE YOUR ID</p>
        <p className="text-xs text-[#9EA9C0]">Create your MIG ID securely with email verification.</p>

        <div>
          <label className={label}>{isFounder ? "MIG ID — 1-27 characters" : "MIG ID — 6-16 characters"}</label>
          <input
            value={migId}
            onChange={(e) => {
              setMigId(e.target.value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, maxLen));
              setError("");
            }}
            placeholder="Letters, numbers, . _ -"
            autoComplete="username"
            disabled={off}
            className={input}
          />
        </div>
        <div>
          <label className={label}>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" disabled={off} className={input} />
        </div>
        <div>
          <label className={label}>Confirm Password</label>
          <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" disabled={off} className={input} />
        </div>
        <div>
          <label className={label}>Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" disabled={off} className={input} />
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div>
            <label className={label}>Gender</label>
            <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={off} className={input}>
              <option value="">Select gender</option>
              {GENDERS.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Country</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={off} className={input}>
              <option value="">Select country</option>
              {OFFICIAL_COUNTRY_ROOMS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={label}>Referral / Invite Code — Optional</label>
          <input value={referral} onChange={(e) => setReferral(e.target.value)} placeholder="Optional" disabled={off} className={input} />
        </div>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} disabled={off} className="h-5 w-5 accent-[#DDAA2D]" />
          I agree to the Terms of Service &amp; Privacy Policy. *
        </label>
        {error && <p className="text-sm font-bold text-[#FF6B6B]">{error}</p>}
        {info && <p className="text-sm font-bold text-[#52E38A]">{info}</p>}
        <button
          type="button"
          onClick={submitForm}
          disabled={off}
          className="h-14 w-full rounded-2xl bg-[#DDAA2D] text-base font-extrabold text-black disabled:opacity-50"
        >
          {busy === "sending" ? "SENDING CODE..." : "CREATE ID"}
        </button>
        <Link href="/login" className="block text-center text-sm text-[#FFC84A]">
          Already have an account? Sign In
        </Link>
      </div>
    </>
  );
}
