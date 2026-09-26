"use client";

import { useState } from "react";
import Link from "next/link";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-cyan-300/50 focus:bg-black/30 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-60";

const labelClass = "mb-2 block text-sm font-semibold text-white/80";

const requestPasswordResetEmailCode = httpsCallable<
  { username: string },
  { sent: boolean; emailHint?: string }
>(functions, "requestPasswordResetEmailCode");

const resetPasswordWithEmailCode = httpsCallable(functions, "resetPasswordWithEmailCode");

export default function ForgotPasswordPage() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<"request" | "reset" | "done">("request");
  const [info, setInfo] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRequest = async () => {
    setError("");
    setInfo("");

    const cleanId = username.trim();

    if (!cleanId) {
      setError("Please enter your MIG ID.");
      return;
    }

    try {
      setLoading(true);

      const { data } = await requestPasswordResetEmailCode({ username: cleanId });

      if (!data?.sent) {
        setError(
          "We couldn't send a code. Check your MIG ID, or add a recovery email in the app's Settings first."
        );
        return;
      }

      setStep("reset");
      setInfo(
        `A reset code was sent to ${data.emailHint || "your recovery email"}. It expires in 10 minutes.`
      );
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not send the reset code.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async () => {
    setError("");

    if (!code.trim()) {
      setError("Please enter the code from your email.");
      return;
    }

    if (newPassword.length < 6) {
      setError("New password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);

      await resetPasswordWithEmailCode({
        username: username.trim(),
        code: code.trim(),
        newPassword,
      });

      setStep("done");
      setInfo("Your password has been changed. You can now log in.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not reset the password.");
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
            href="/login"
            className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/70 transition hover:bg-white/10 hover:text-white"
          >
            ← Login
          </Link>
        </div>
      </header>

      <section className="relative z-10 flex min-h-[calc(100vh-82px)] items-center justify-center px-5 py-12">

        <div className="w-full max-w-md">

          <div className="mb-7 text-center">

            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-cyan-300/20 bg-gradient-to-br from-blue-500/20 to-cyan-400/10 shadow-lg shadow-blue-500/10">
              <span className="text-3xl">🔑</span>
            </div>

            <h2 className="text-4xl font-black tracking-tight">
              Forgot Password
            </h2>

            <p className="mt-3 text-sm text-white/45">
              We&apos;ll email a reset code to your recovery email
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-8">

            {/* MIG ID */}
            <div>
              <label htmlFor="username" className={labelClass}>
                MIG ID
              </label>

              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && step === "request") handleRequest();
                }}
                placeholder="Enter your MIG ID"
                autoComplete="username"
                disabled={step !== "request"}
                className={inputClass}
              />
            </div>

            {step === "reset" && (
              <>
                {/* Code */}
                <div className="mt-5">
                  <label htmlFor="code" className={labelClass}>
                    Reset Code
                  </label>

                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="Enter the code"
                    autoComplete="one-time-code"
                    className={`${inputClass} uppercase tracking-widest`}
                  />
                </div>

                {/* New Password */}
                <div className="mt-5">
                  <label htmlFor="newPassword" className={labelClass}>
                    New Password
                  </label>

                  <div className="relative">

                    <input
                      id="newPassword"
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Create a new password"
                      autoComplete="new-password"
                      className={`${inputClass} pr-12`}
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

                {/* Confirm */}
                <div className="mt-5">
                  <label htmlFor="confirmPassword" className={labelClass}>
                    Confirm New Password
                  </label>

                  <input
                    id="confirmPassword"
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleReset();
                    }}
                    placeholder="Re-enter the new password"
                    autoComplete="new-password"
                    className={inputClass}
                  />
                </div>
              </>
            )}

            {/* Info */}
            {info && !error && (
              <div className="mt-5 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
                {info}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Action */}
            {step === "request" && (
              <button
                type="button"
                onClick={handleRequest}
                disabled={loading}
                className="mt-7 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-4 font-bold text-white shadow-xl shadow-blue-500/20 transition duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? "Sending..." : "Send Reset Code →"}
              </button>
            )}

            {step === "reset" && (
              <>
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={loading}
                  className="mt-7 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-4 font-bold text-white shadow-xl shadow-blue-500/20 transition duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Saving..." : "Change Password →"}
                </button>

                <button
                  type="button"
                  onClick={handleRequest}
                  disabled={loading}
                  className="mt-3 w-full text-center text-xs font-medium text-cyan-300 transition hover:text-cyan-200 disabled:opacity-50"
                >
                  Didn&apos;t get it? Send a new code
                </button>
              </>
            )}

            {step === "done" && (
              <Link
                href="/login"
                className="mt-7 block w-full rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-4 text-center font-bold text-white shadow-xl shadow-blue-500/20 transition duration-300 hover:scale-[1.01]"
              >
                Login to MIGwith →
              </Link>
            )}

            {step !== "done" && (
              <Link
                href="/login"
                className="mt-4 block w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                Back to Login
              </Link>
            )}

          </div>

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
