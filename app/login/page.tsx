"use client";

import { cancelAccountDeletion } from "../../lib/accountDeletion";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { AndroidDownload } from "../_components/AndroidDownload";
import { MigLoginLogo, requestWelcomeSplash } from "../_components/LoginWelcome";
import { migAliasEmail } from "../../lib/migAlias";
import { setUiStyle, useUiStyle } from "../../lib/uiStyle";

const OFFLINE_KEY = "migwith.loginOffline";

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // "Login as Offline": signed in, but everyone sees you as Offline (anyone may)
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    try {
      setOffline(localStorage.getItem(OFFLINE_KEY) === "1");
    } catch {
      // storage blocked
    }
  }, []);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setError("");

    const cleanId = loginId.trim();

    if (!cleanId || !password) {
      setError("Please enter your MIG ID and password.");
      return;
    }

    try {
      setLoading(true);

      const authEmail = cleanId.includes("@")
        ? cleanId.toLowerCase()
        : migAliasEmail(cleanId);

      await setPersistence(
        auth,
        rememberMe
          ? browserLocalPersistence
          : browserSessionPersistence
      );

      const cred = await signInWithEmailAndPassword(
        auth,
        authEmail,
        password
      );

      // 🔑 Offer to save the ID + password in the browser's own password manager
      // (Google Password Manager on Chrome) — next time it fills them in. The
      // site itself never stores the password.
      try {
        const PC = (window as unknown as { PasswordCredential?: new (d: { id: string; password: string; name?: string }) => Credential }).PasswordCredential;
        if (PC && navigator.credentials?.store) {
          await navigator.credentials.store(new PC({ id: cleanId, password, name: cleanId }));
        }
      } catch {
        // not supported here — the browser may still offer to save on its own
      }

      // Same as the app: every login writes the presence — ONLINE, or OFFLINE
      // when "Login as Offline" is ticked (anyone may be shown as Offline).
      try {
        localStorage.setItem(OFFLINE_KEY, offline ? "1" : "0");
      } catch {
        // storage blocked
      }
      await updateDoc(doc(db, "users", cred.user.uid), {
        isInvisible: false,
        presenceStatus: offline ? "OFFLINE" : "ONLINE",
      }).catch((err) => console.error("presence on login failed", err));

      // 🗑 Signing in again cancels a pending "Delete my account" (7 days).
      try {
        const { data } = await cancelAccountDeletion({});
        if (data?.cancelled) window.alert("Welcome back! Your account deletion was cancelled.");
      } catch {
        // not important for signing in
      }

      requestWelcomeSplash();
      router.push("/");
      router.refresh();
    } catch (err: any) {
      console.error(err);

      if (
        err?.code === "auth/invalid-credential" ||
        err?.code === "auth/wrong-password" ||
        err?.code === "auth/user-not-found"
      ) {
        setError("Incorrect MIG ID or password.");
      } else {
        setError(err?.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#6CCFF6] via-[#36B1EC] to-[#1A8FD6] text-white">
      <section className="relative z-10 mx-auto flex min-h-screen w-full max-w-sm flex-col items-center px-6 pb-10 pt-12">
        {/* mig + life bubble */}
        <Link href="/welcome" aria-label="About MIGlife" className="relative mt-4 block">
          <MigLoginLogo />
        </Link>

        <p className="mt-8 text-[22px] tracking-wide text-white/95">Join the Fun!</p>

        {/* the app's five chat bubbles */}
        <LoginBubbles />

        {/* clean white fields with an icon, like a modern login form */}
        {/* a real form, so the browser recognises the ID + password and offers to save / fill them */}
        <form
          className="mt-6 w-full space-y-3.5"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <label className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 px-4 shadow-sm focus-within:border-[#17375A]">
            <PersonIcon />
            <input
              id="identifier"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              aria-label="Username"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-lg text-[#17375A] outline-none placeholder:text-[#9FB3C8]"
            />
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-white/70 bg-white/95 px-4 shadow-sm focus-within:border-[#17375A]">
            <LockIcon />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              aria-label="Password"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-lg text-[#17375A] outline-none placeholder:text-[#9FB3C8]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="shrink-0 p-1 text-[#9FB3C8]"
            >
              <EyeIcon open={showPassword} />
            </button>
          </label>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>

        <div className="mt-5 flex w-full items-center justify-between gap-3">
          <AppCheck checked={rememberMe} onChange={setRememberMe} label="Remember Me" />
          <AppCheck checked={offline} onChange={setOffline} label="Login as Offline" />
        </div>

        {error && (
          <div className="mt-4 w-full rounded-xl border border-red-300/40 bg-red-500/20 px-4 py-2.5 text-sm text-red-100">{error}</div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="mt-6 w-full rounded-2xl bg-[#17375A] py-3.5 text-xl font-bold text-white shadow-[0_6px_14px_rgba(23,55,90,.35)] transition active:scale-[.98] disabled:opacity-60"
        >
          {loading ? "…" : "Login"}
        </button>
        <Link
          href="/register"
          className="mt-3.5 block w-full rounded-2xl border border-white bg-white py-3.5 text-center text-xl font-bold text-[#111827] shadow-[0_4px_10px_rgba(0,0,0,.12)] transition active:scale-[.98]"
        >
          Create Account
        </Link>
        <Link href="/forgot-password" className="mt-5 text-[17px] text-white/90 underline underline-offset-4">
          Forgot Password?
        </Link>
        {/* ✨ / 📟 The site opens in whichever style is ticked here (same switch as Settings › Appearance). */}
        <LoginStyleChoice />
        {/* Android app download (the link miglife sets in miglife secret) */}
        <AndroidDownload />
      </section>
    </main>
  );
}

function LoginStyleChoice() {
  const style = useUiStyle();
  return (
    <div className="mt-5 flex w-full items-center justify-evenly gap-2 px-2">
      {(
        [
          ["modern", "✨ Modern mode"],
          ["classic", "📟 Classic mode"],
        ] as const
      ).map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => setUiStyle(id)}
          className="flex items-center gap-2 rounded-md px-1 py-1 text-[15px] text-white"
        >
          <span className="flex h-[26px] w-[26px] items-center justify-center rounded border border-[#9C9C9C] bg-[#D5D5D5] text-lg font-bold text-[#2B2B2B]">
            {style === id ? "✓" : ""}
          </span>
          <span className={`whitespace-nowrap ${style === id ? "font-bold" : ""}`}>{label}</span>
        </button>
      ))}
    </div>
  );
}

/** A rounded tick box with its label. */
function AppCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left text-base text-white">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 text-sm font-black ${
          checked ? "border-white bg-white text-[#17375A]" : "border-white/80"
        }`}
      >
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
  );
}

const ICON = "h-6 w-6 shrink-0 text-[#9FB3C8]";
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={ICON} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1Z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={ICON} aria-hidden>
      <rect x="5" y="10" width="14" height="11" rx="3" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3M12 14.5v2" />
    </svg>
  );
}
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" aria-hidden>
      <path d="M12 5c-5 0-9 4.5-10 7 1 2.5 5 7 10 7s9-4.5 10-7c-1-2.5-5-7-10-7Zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm0-2.2a1.8 1.8 0 1 0 0-3.6 1.8 1.8 0 0 0 0 3.6Z" />
      {open && <path d="M3 3l18 18" stroke="currentColor" strokeWidth="2" />}
    </svg>
  );
}

/** The app's five glossy chat bubbles (chat, smile, friends, gift, love). */
function LoginBubbles() {
  const bubbles: [string, string, string, number][] = [
    ["💬", "#5AB2FF", "#2F80ED", 0],
    ["😄", "#FFB15C", "#F07A1A", 1],
    ["👥", "#5FD47A", "#22A447", 2],
    ["💝", "#B98BFF", "#7B4BE0", 1],
    ["❤️", "#FF8DB8", "#E8457E", 0],
  ];
  return (
    <div className="mt-6 flex w-full items-end justify-center gap-2.5">
      {bubbles.map(([e, a, b, lift], i) => (
        <span key={i} className="relative" style={{ marginBottom: lift * 5 }}>
          <span
            className="relative z-10 flex h-[46px] w-[52px] items-center justify-center rounded-[14px] border-[2.5px] border-white text-[22px] shadow-[0_4px_8px_rgba(0,0,0,.18)]"
            style={{ background: `linear-gradient(180deg, ${a}, ${b})` }}
          >
            <span className="absolute left-1.5 right-1.5 top-1 h-2.5 rounded-full bg-white/35" />
            <span className="relative">{e}</span>
          </span>
          {/* the bubble's little tail */}
          <span
            className={`absolute -bottom-[7px] h-3.5 w-3.5 rotate-45 border-b-[2.5px] border-r-[2.5px] border-white ${i % 2 ? "right-3" : "left-3"}`}
            style={{ background: b }}
          />
        </span>
      ))}
    </div>
  );
}
