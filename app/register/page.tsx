"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../lib/firebase";

// Same rule createNormalUserId enforces on the server.
const MIG_ID_PATTERN = /^(?=.*[A-Za-z])[A-Za-z0-9._-]{1,27}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const GENDERS = ["Male", "Female"];

const COUNTRIES = [
  "Bangladesh",
  "India",
  "Pakistan",
  "Nepal",
  "Sri Lanka",
  "Saudi Arabia",
  "United Arab Emirates",
  "Qatar",
  "Kuwait",
  "Oman",
  "Bahrain",
  "Malaysia",
  "Singapore",
  "United Kingdom",
  "United States",
  "Canada",
  "Other",
];

const inputClass =
  "w-full rounded-2xl border border-white/10 bg-black/20 px-4 py-3.5 text-sm text-white outline-none placeholder:text-white/25 transition focus:border-cyan-300/50 focus:bg-black/30 focus:ring-2 focus:ring-cyan-300/10 disabled:opacity-60";

const labelClass = "mb-2 block text-sm font-semibold text-white/80";

const sendEmailVerificationCode = httpsCallable(functions, "sendEmailVerificationCode");
const verifyEmailVerificationCode = httpsCallable(functions, "verifyEmailVerificationCode");
const createNormalUserId = httpsCallable(functions, "createNormalUserId");

export default function RegisterPage() {
  const router = useRouter();

  const [migId, setMigId] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("Bangladesh");
  const [referralCode, setReferralCode] = useState("");
  const [agree, setAgree] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState<"" | "send" | "verify" | "create">("");

  const cleanEmail = email.trim().toLowerCase();

  const handleSendCode = async () => {
    setError("");
    setInfo("");

    if (!EMAIL_PATTERN.test(cleanEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    try {
      setLoading("send");
      await sendEmailVerificationCode({ email: cleanEmail, migId: migId.trim() });
      setCodeSent(true);
      setEmailVerified(false);
      setCode("");
      setInfo(`A verification code was sent to ${cleanEmail}.`);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not send the verification code.");
    } finally {
      setLoading("");
    }
  };

  const handleVerifyCode = async () => {
    setError("");
    setInfo("");

    if (!code.trim()) {
      setError("Please enter the code from your email.");
      return;
    }

    try {
      setLoading("verify");
      await verifyEmailVerificationCode({ email: cleanEmail, code: code.trim() });
      setEmailVerified(true);
      setInfo("Email verified.");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Could not verify the code.");
    } finally {
      setLoading("");
    }
  };

  const handleRegister = async () => {
    setError("");
    setInfo("");

    const cleanId = migId.trim();

    if (!MIG_ID_PATTERN.test(cleanId)) {
      setError(
        "MIG ID must be 1-27 characters, at least 1 English letter, and only A-Z a-z 0-9 . _ -"
      );
      return;
    }

    if (!emailVerified) {
      setError("Please verify your email first.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!gender || !country) {
      setError("Please select your gender and country.");
      return;
    }

    if (!agree) {
      setError("Please accept the terms to continue.");
      return;
    }

    try {
      setLoading("create");

      await createNormalUserId({
        migId: cleanId,
        email: cleanEmail,
        password,
        confirmPassword,
        gender,
        country,
        referralCode: referralCode.trim(),
        termsAccepted: agree,
        verificationCode: code.trim(),
      });

      await signInWithEmailAndPassword(
        auth,
        `${cleanId.toLowerCase()}@login.migwith.local`,
        password
      );

      router.push("/");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Registration failed.");
    } finally {
      setLoading("");
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
              <span className="text-3xl">✨</span>
            </div>

            <h2 className="text-4xl font-black tracking-tight">
              Create MIG ID
            </h2>

            <p className="mt-3 text-sm text-white/45">
              Join MIGwith and start connecting today
            </p>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-6 shadow-2xl shadow-black/30 backdrop-blur-2xl sm:p-8">

            {/* MIG ID */}
            <div>
              <label htmlFor="migId" className={labelClass}>
                MIG ID
              </label>

              <input
                id="migId"
                type="text"
                value={migId}
                onChange={(e) => setMigId(e.target.value)}
                placeholder="Choose your MIG ID"
                autoComplete="username"
                className={inputClass}
              />

              <p className="mt-2 text-xs text-white/30">
                1-27 characters, at least 1 letter. Only A-Z a-z 0-9 . _ -
              </p>
            </div>

            {/* Email */}
            <div className="mt-5">
              <label htmlFor="email" className={labelClass}>
                Recovery Email
              </label>

              <div className="flex gap-2">
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setCodeSent(false);
                    setEmailVerified(false);
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  disabled={emailVerified}
                  className={inputClass}
                />

                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading !== "" || emailVerified}
                  className="shrink-0 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {emailVerified
                    ? "✓ Verified"
                    : loading === "send"
                      ? "Sending..."
                      : codeSent
                        ? "Resend"
                        : "Send Code"}
                </button>
              </div>

              <p className="mt-2 text-xs text-white/30">
                Used to reset your password if you forget it
              </p>
            </div>

            {/* Verification Code */}
            {codeSent && !emailVerified && (
              <div className="mt-5">
                <label htmlFor="code" className={labelClass}>
                  Verification Code
                </label>

                <div className="flex gap-2">
                  <input
                    id="code"
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleVerifyCode();
                    }}
                    placeholder="Enter the code"
                    autoComplete="one-time-code"
                    className={`${inputClass} uppercase tracking-widest`}
                  />

                  <button
                    type="button"
                    onClick={handleVerifyCode}
                    disabled={loading !== ""}
                    className="shrink-0 rounded-2xl border border-cyan-300/30 bg-cyan-300/10 px-4 text-sm font-semibold text-cyan-200 transition hover:bg-cyan-300/20 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading === "verify" ? "Checking..." : "Verify"}
                  </button>
                </div>
              </div>
            )}

            {/* Password */}
            <div className="mt-5">
              <label htmlFor="password" className={labelClass}>
                Password
              </label>

              <div className="relative">

                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Create a password"
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

            {/* Confirm Password */}
            <div className="mt-5">
              <label htmlFor="confirmPassword" className={labelClass}>
                Confirm Password
              </label>

              <input
                id="confirmPassword"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your password"
                autoComplete="new-password"
                className={inputClass}
              />
            </div>

            {/* Gender + Country */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="gender" className={labelClass}>
                  Gender
                </label>

                <select
                  id="gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className={`${inputClass} appearance-none`}
                >
                  <option value="" className="bg-[#0b1430]">
                    Select
                  </option>
                  {GENDERS.map((g) => (
                    <option key={g} value={g} className="bg-[#0b1430]">
                      {g}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="country" className={labelClass}>
                  Country
                </label>

                <select
                  id="country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={`${inputClass} appearance-none`}
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} className="bg-[#0b1430]">
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Referral */}
            <div className="mt-5">
              <label htmlFor="referral" className={labelClass}>
                Referral Code <span className="font-normal text-white/30">(optional)</span>
              </label>

              <input
                id="referral"
                type="text"
                value={referralCode}
                onChange={(e) => setReferralCode(e.target.value)}
                placeholder="Enter referral code"
                className={inputClass}
              />
            </div>

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

            {/* Terms */}
            <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm text-white/50">

              <input
                type="checkbox"
                checked={agree}
                onChange={(e) => setAgree(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-black/20 accent-cyan-400"
              />

              I agree to the MIGwith terms and community rules

            </label>

            {/* Register */}
            <button
              type="button"
              onClick={handleRegister}
              disabled={loading !== ""}
              className="mt-7 w-full rounded-2xl bg-gradient-to-r from-blue-500 to-cyan-400 px-6 py-4 font-bold text-white shadow-xl shadow-blue-500/20 transition duration-300 hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading === "create" ? "Creating..." : "Create MIG ID →"}
            </button>

            <div className="my-7 flex items-center gap-4">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">OR</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <Link
              href="/login"
              className="block w-full rounded-2xl border border-white/10 bg-white/5 px-6 py-4 text-center font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              I already have a MIG ID
            </Link>

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
