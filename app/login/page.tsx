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
  // "Log in as Invisible", remembered like the app's checkbox.
  const [invisible, setInvisible] = useState(false);
  useEffect(() => {
    try {
      setInvisible(localStorage.getItem(INVISIBLE_KEY) === "1");
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

        <p className="mt-8 text-xl text-white/95">Join the Fun!</p>

        <div className="mt-8 w-full space-y-3">
          <input
            id="identifier"
            type="text"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleLogin();
            }}
            placeholder="MIG ID"
            autoComplete="username"
            aria-label="MIG ID"
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
              className="w-full rounded-md border border-[#9FB3C8] bg-gradient-to-b from-[#F4F4F4] to-[#DADADA] py-3 pl-4 pr-24 text-lg text-[#1F2937] outline-none placeholder:text-[#6B7280] focus:border-[#F58A3A]"
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
              <Link
                href="/forgot-password"
                aria-label="Forgot Password?"
                title="Forgot Password?"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-[#2F80ED] text-lg font-black text-white"
              >
                ?
              </Link>
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
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-7 w-7 rounded accent-[#E0762A]"
            />
            Remember me
          </label>
          <label className="flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={invisible}
              onChange={(e) => setInvisible(e.target.checked)}
              className="h-7 w-7 rounded accent-[#E0762A]"
            />
            Log in as Invisible
          </label>
        </div>

        <p className="mt-auto pt-12 text-center text-sm text-white/80">
          New to MIGlife?{" "}
          <Link href="/register" className="font-bold text-white underline underline-offset-4">
            Create ID
          </Link>
        </p>
        <Link href="/forgot-password" className="mt-3 text-base text-white underline underline-offset-4">
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
