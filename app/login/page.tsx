"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { auth } from "../../lib/firebase";

export default function LoginPage() {
  const router = useRouter();

  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
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

      await signInWithEmailAndPassword(
        auth,
        authEmail,
        password
      );

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
    <main className="relative min-h-screen overflow-hidden bg-[#050b1c] text-white">

      <div className="pointer-events-none fixed inset-0">
        <div className="absolute left-1/2 top-[-220px] h-[520px] w-[720px] -translate-x-1/2 rounded-full bg-blue-600/20 blur-[150px]" />
        <div className="absolute bottom-[-180px] left-[-150px] h-[450px] w-[450px] rounded-full bg-cyan-500/10 blur-[130px]" />
        <div className="absolute right-[-150px] top-[35%] h-[420px] w-[420px] rounded-full bg-indigo-600/10 blur-[130px]" />
      </div>

      <header className="relative z-10 border-b border-white/10 bg-[#050b1c]/70 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">

          <Link href="/" className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-cyan-300/30 bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/20">
              <span className="text-xl font-black">M</span>
            </div>

            <div>
              <h1 className="text-2xl font-black tracking-wide">
                MIG<span className="text-cyan-300">with</span>
              </h1>

              <p className="text-[10px] uppercase tracking-[0.35em] text-white/40">
                Connect • Chat • Play
              </p>
            </div>
          </Link>

          <Link
            href="/"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ← Home
          </Link>
        </div>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-82px)] items-center justify-center px-5 py-12">

        <div className="w-full max-w-md">

          <div className="mb-7 text-center">

            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-blue-500/20 to-cyan-400/10 shadow-lg shadow-blue-500/10">
              <span className="text-3xl">🔐</span>
            </div>

            <h2 className="text-4xl font-black tracking-tight">
              Welcome Back
            </h2>

            <p className="mt-3 text-sm text-white/45">
              Login to continue to your MIGwith account
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-8">

            {/* MIG ID */}
            <div>
              <label
                htmlFor="identifier"
                className="mb-2 block text-sm font-semibold text-white/80"
              >
                MIG ID
              </label>

              <input
                id="identifier"
                type="text"
                value={loginId}
                onChange={(e) => setLoginId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLogin();
                }}
                placeholder="Enter your MIG ID"
                autoComplete="username"
                className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-cyan-300/50 focus:bg-black/30 focus:ring-2 focus:ring-cyan-300/10"
              />
            </div>

            {/* Password */}
            <div className="mt-5">

              <div className="mb-2 flex items-center justify-between">

                <label
                  htmlFor="password"
                  className="block text-sm font-semibold text-white/80"
                >
                  Password
                </label>

                <Link
                  href="/forgot-password"
                  className="text-xs font-medium text-cyan-300 transition hover:text-cyan-200"
                >
                  Forgot Password?
                </Link>

              </div>

              <div className="relative">

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleLogin();
                  }}
                  placeholder="Enter your password"
                  autoComplete="current-password"
                  className="w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 pr-12 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-cyan-300/50 focus:bg-black/30 focus:ring-2 focus:ring-cyan-300/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-lg text-white/40 transition hover:text-white"
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>

              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Remember */}
            <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-white/50">

              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/20 accent-cyan-400"
              />

              Remember me

            </label>

            {/* Login */}
            <button
              type="button"
              onClick={handleLogin}
              disabled={loading}
              className="mt-7 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-4 font-bold text-white shadow-xl shadow-blue-500/20 transition duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Logging in..." : "Login to MIGwith →"}
            </button>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">OR</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <Link
              href="/register"
              className="block w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              Create a New MIG ID
            </Link>

          </div>

          <p className="mt-6 text-center text-xs leading-5 text-white/25">
            Your account information is protected by MIGwith security.
          </p>

          <div className="mt-8 flex items-center justify-center gap-3 text-xs text-white/20">
            <span className="h-px w-8 bg-white/10" />
            MIGwith
            <span className="h-px w-8 bg-white/10" />
          </div>

        </div>
      </section>
    </main>
  );
}
