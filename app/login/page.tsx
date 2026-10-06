"use client";

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

const INVISIBLE_KEY = "migwith.loginInvisible";

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  // "Login as Invisible", remembered like the app's checkbox.
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
        : `${cleanId.toLowerCase()}@login.migwith.local`;

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
      try {
        localStorage.setItem(INVISIBLE_KEY, invisible ? "1" : "0");
      } catch {
        // storage blocked
      }
      await updateDoc(doc(db, "users", cred.user.uid), {
        isInvisible: invisible,
        presenceStatus: invisible ? "OFFLINE" : "ONLINE",
      }).catch((err) => console.error("presence on login failed", err));

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
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#1B4F86] via-[#154272] to-[#0E2F55] text-white">
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
          className="mt-6 w-full rounded-md border border-[#8A3A0E] bg-gradient-to-b from-[#E0762A] to-[#B8410F] py-3.5 text-2xl font-medium text-white/95 shadow-lg transition hover:brightness-110 disabled:opacity-60"
        >
          {loading ? "…" : "Go!"}
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
            Login as Invisible
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
        {/* Android app download (the link miglife sets in miglife secret) */}
        <AndroidDownload />
      </section>
    </main>
  );
}
