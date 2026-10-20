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
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { AndroidDownload } from "../_components/AndroidDownload";
import { MigLoginLogo, requestWelcomeSplash } from "../_components/LoginWelcome";
import { canBeInvisible } from "../../lib/invisible";
import { migAliasEmail } from "../../lib/migAlias";
import { setUiStyle, useUiStyle } from "../../lib/uiStyle";

const INVISIBLE_KEY = "migwith.loginInvisible";

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // "Log in as Invisible" is no longer on the login page: always a normal login
  // (people who may be invisible can still turn it on inside the app).
  const [invisible, setInvisible] = useState(false);
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

      // Same as the app: every login writes isInvisible (checked or not) and
      // presenceStatus ONLINE, or OFFLINE when logging in as Invisible.
      // 🫥 Only the Founder, official Admins and Staff may log in invisible.
      let hide = invisible;
      if (hide) {
        const me = await getDoc(doc(db, "users", cred.user.uid)).catch(() => null);
        hide = await canBeInvisible(cred.user.uid, me?.get("username"), me?.get("role"));
        if (!hide) {
          setInvisible(false);
          window.alert("Invisible is only for Founder, Admin & Staff.");
        }
      }
      try {
        localStorage.setItem(INVISIBLE_KEY, hide ? "1" : "0");
      } catch {
        // storage blocked
      }
      await updateDoc(doc(db, "users", cred.user.uid), {
        isInvisible: hide,
        presenceStatus: hide ? "OFFLINE" : "ONLINE",
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

        <div className="mt-5 w-full space-y-3">
          <input
            id="identifier"
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            placeholder="Username"
            autoComplete="username"
            aria-label="Username"
            className="w-full rounded-md border border-[#9FB3C8] bg-gradient-to-b from-[#F4F4F4] to-[#DADADA] px-4 py-3 text-lg text-[#1F2937] outline-none placeholder:text-[#6B7280] focus:border-[#F58A3A]"
          />
          <div className="relative">
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleLogin();
              }}
              placeholder="Password"
              autoComplete="current-password"
              aria-label="Password"
              className="w-full rounded-md border border-[#9FB3C8] bg-gradient-to-b from-[#F4F4F4] to-[#DADADA] py-3 pl-4 pr-14 text-lg text-[#1F2937] outline-none placeholder:text-[#6B7280] focus:border-[#F58A3A]"
            />
            <div className="absolute right-2 top-1/2 flex -translate-y-1/2 gap-1.5">
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#6B7280] text-base"
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="mt-4 w-full rounded-md border border-red-300/40 bg-red-500/20 px-4 py-2.5 text-sm text-red-100">{error}</div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="mt-6 w-full rounded-2xl bg-gradient-to-r from-[#F58A3A] to-[#D6521A] py-3.5 text-xl font-extrabold tracking-wide text-white shadow-lg transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "…" : "Log in"}
        </button>

        <div className="mt-6 flex w-full items-center justify-between gap-3 text-base text-white/90">
          <AppCheck checked={rememberMe} onChange={setRememberMe} label="Remember me" />
          {/* Forgot Password where "Log in as Invisible" used to be */}
          <Link href="/forgot-password" className="text-[15px] text-white underline underline-offset-4">
            Forgot Password?
          </Link>
        </div>

        {/* like the app: one big "Create Account" link (Forgot Password is the ? by the password) */}
        <Link href="/register" className="mt-auto pt-14 text-[22px] tracking-wide text-white underline underline-offset-[6px]">
          Create Account
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

/** A grey square tick box with its label, like the app's login page. */
function AppCheck({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className="flex items-center gap-3 text-left text-[15px] text-white">
      <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded border border-[#9C9C9C] bg-[#D5D5D5] text-xl font-bold text-[#2B2B2B]">
        {checked ? "✓" : ""}
      </span>
      {label}
    </button>
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
