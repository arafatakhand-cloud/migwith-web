"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth, db, functions } from "../../lib/firebase";
import { countryFlag, countryInfoFor } from "../../lib/countries";
import { CountryPickerDialog } from "../_components/CountryPicker";
import { isMainFounderName } from "../../lib/founder";
import { migAliasEmail } from "../../lib/migAlias";
import { useSession } from "../_components/AppSession";
import { BackPill } from "../_components/BackButton";

// Create ID, the same flow (and the same redesigned look) as the app's
// RegisterPage — 👤 Account → 🪪 Profile → ✉️ Verify: fill in the form, get a
// 6-character code by email (sendEmailVerificationCode), enter it
// (verifyEmailVerificationCode), then createNormalUserId makes the account
// and we sign straight in. Open only while the founder has "Other Users ID
// Creation" switched on (app_settings/id_creation); the server checks again.

const sendCode = httpsCallable(functions, "sendEmailVerificationCode");
const verifyCode = httpsCallable(functions, "verifyEmailVerificationCode");
const createId = httpsCallable<Record<string, unknown>, { username?: string }>(functions, "createNormalUserId");
const setSecurityPin = httpsCallable(functions, "setSecurityPin");

const GENDERS = ["Male", "Female", "Other"];
const GOLD = "#FFC84A";
const GOLD_BUTTON = "linear-gradient(90deg, #FFD86B, #F5B533, #E09A1E)";
const fieldBox =
  "flex items-center gap-2 rounded-2xl border border-[#2E3A58] bg-[#141C33] px-3 focus-within:border-[#FFC84A] focus-within:bg-[#18223D]";
const fieldInput = "min-w-0 flex-1 bg-transparent py-3.5 text-[15px] text-white outline-none placeholder:text-[#66718C] disabled:opacity-60";
const fieldLabel = "mb-1 block pl-1 text-[11px] font-bold tracking-[1.2px] text-[#9EA9C0]";

function Field({ icon, label, right, children }: { icon: string; label: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <span className={fieldLabel}>{label}</span>
      <div className={fieldBox}>
        <span className="pl-1 text-[17px]">{icon}</span>
        {children}
        {right}
      </div>
    </div>
  );
}

// Password strength, like the app: 4 bars.
function strengthOf(pw: string): [number, string, string] {
  const n = [pw.length >= 6, pw.length >= 10, /\d/.test(pw) && /[A-Za-z]/.test(pw), /[^A-Za-z0-9]/.test(pw) || /[A-Z]/.test(pw)].filter(Boolean).length;
  if (n <= 1) return [n, "Weak", "#FF6B6B"];
  if (n === 2) return [n, "Okay", "#FFB84A"];
  if (n === 3) return [n, "Good", "#8BE36B"];
  return [n, "Strong", "#52E38A"];
}

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
  // 1 Account · 2 Profile · 3 Verify
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [showPw, setShowPw] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [resendWait, setResendWait] = useState(0);
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
      setStep(3);
      setResendWait(60);
      setInfo("A 6-character verification code was sent to your email.");
    } catch (e: any) {
      setError(e?.message || "Could not send verification code.");
    } finally {
      setBusy("");
    }
  };

  // "Resend in 59s…"
  useEffect(() => {
    if (resendWait <= 0) return;
    const t = setTimeout(() => setResendWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);

  const idRe = new RegExp(`^(?=.*[A-Za-z])[A-Za-z0-9._-]{${minLen},${maxLen}}$`);
  const cleanId = migId.trim();
  const idOk = idRe.test(cleanId);
  const confirmOk = confirm.length > 0 && confirm === password;

  // Step 1 → 2: MIG ID and password.
  const nextFromStep1 = () => {
    setError("");
    if (!isFounder && !enabled) return setError("ID creation is currently disabled by FOUNDER.");
    if (!idOk)
      return setError(`MIG ID must be ${minLen}-${maxLen} characters and contain at least 1 English letter. Allowed: A-Z, a-z, 0-9, . _ -`);
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setStep(2);
  };

  // Step 2 → 3: profile, then the code is sent.
  const submitForm = () => {
    setError("");
    if (!isFounder && !enabled) return setError("ID creation is currently disabled by FOUNDER.");
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
      await signInWithEmailAndPassword(auth, migAliasEmail(created), password);
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
    <main className="relative min-h-screen overflow-hidden bg-gradient-to-b from-[#060914] via-[#0E1530] to-[#1B0F2E] px-[18px] py-3 text-white">
      {/* soft glows, like the app */}
      <span className="pointer-events-none absolute -right-[110px] -top-[90px] h-[340px] w-[340px] rounded-full bg-[radial-gradient(circle,rgba(156,91,255,.27),transparent_70%)]" />
      <span className="pointer-events-none absolute -bottom-[80px] -left-[100px] h-[300px] w-[300px] rounded-full bg-[radial-gradient(circle,rgba(255,200,74,.19),transparent_70%)]" />
      <div className="relative mx-auto w-full max-w-md">{children}</div>
    </main>
  );
  const goldBtn = (label: React.ReactNode, onClick: () => void, enabledBtn: boolean) => (
    <button
      type="button"
      onClick={onClick}
      disabled={!enabledBtn}
      className="h-14 w-full rounded-[18px] text-base font-extrabold tracking-[0.5px] text-black shadow-[0_6px_18px_rgba(255,200,74,.35)] disabled:text-[#9EA9C0] disabled:shadow-none"
      style={{ background: enabledBtn || busy ? GOLD_BUTTON : "#3A4360" }}
    >
      {label}
    </button>
  );

  if (enabled === null) return shell(<p className="pt-24 text-center text-sm text-[#9EA9C0]">Loading…</p>);

  if (!isFounder && !enabled) {
    return shell(
      <div
        className="mt-24 rounded-[28px] bg-[#111833]/90 p-[26px] text-center"
        style={{ border: "1.5px solid transparent", background: "linear-gradient(rgba(17,24,51,.92), rgba(17,24,51,.92)) padding-box, linear-gradient(135deg, #FFC84A, #9C5BFF) border-box" }}
      >
        <div className="text-[44px]">🔒</div>
        <p className="mt-3 text-[21px] font-extrabold text-[#FFD66B]">ID CREATION IS OFF</p>
        <p className="mt-2 text-[13px] text-[#B8C1D3]">New IDs can&apos;t be created right now. Please try again later.</p>
        <Link href="/login" className="mt-[18px] inline-block rounded-[18px] px-[26px] py-[13px] font-extrabold text-black" style={{ background: GOLD_BUTTON }}>
          BACK TO LOGIN
        </Link>
      </div>
    );
  }

  const off = !!busy;
  const ci = countryInfoFor(country);
  const [pwN, pwLabel, pwColor] = strengthOf(password);
  const busyLabel = busy === "sending" ? "Sending code…" : busy === "verifying" ? "Verifying…" : "Creating your ID…";
  const back = () => {
    if (off) return;
    setError("");
    setInfo("");
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
    else router.push("/login");
  };

  return shell(
    <div className="space-y-3.5">
      {countryOpen && (
        <CountryPickerDialog
          selected={country}
          onPick={(n) => {
            setCountry(n);
            setCountryOpen(false);
            setError("");
          }}
          onClose={() => setCountryOpen(false)}
        />
      )}
      <BackPill variant="dark" label="Back" disabled={off} onClick={back} />

      {/* header: logo + title */}
      <div className="flex flex-col items-center text-center">
        <div className="rounded-full bg-gradient-to-br from-[#FFC84A] to-[#9C5BFF] p-[3px] shadow-[0_0_24px_rgba(255,200,74,.45)]">
          <div className="flex h-[78px] w-[78px] items-center justify-center rounded-full bg-[#0E1530]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon-192.png" alt="miglife" className="h-[60px] w-[60px] rounded-full" />
          </div>
        </div>
        <p className="mt-3 text-[28px] font-extrabold text-[#FFD66B]">Create your ID</p>
        <p className="text-[13px] text-[#B8C1D3]">
          {step === 1 ? "Pick your MIG ID and a password" : step === 2 ? "A little about you" : "Check your email"}
        </p>
      </div>

      {/* glass card */}
      <div
        className="space-y-[13px] rounded-[30px] p-[18px] shadow-[0_10px_40px_rgba(156,91,255,.3)]"
        style={{
          border: "1.2px solid transparent",
          background:
            "linear-gradient(180deg, rgba(20,28,54,.95), rgba(13,19,40,.95)) padding-box, linear-gradient(135deg, rgba(255,200,74,.67), rgba(156,91,255,.4), rgba(255,255,255,.13)) border-box",
        }}
      >
        {/* steps: progress bar + labels */}
        <div>
          <div className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-[5px] flex-1 rounded-full"
                style={{ background: step > i ? "linear-gradient(90deg, #FFC84A, #FF9BD2)" : "#26314D" }}
              />
            ))}
          </div>
          <div className="mt-2 flex">
            {["👤 Account", "🪪 Profile", "✉️ Verify"].map((l, i) => (
              <span
                key={l}
                className={`flex-1 text-center text-[11px] ${step === i + 1 ? "font-bold" : "font-medium"}`}
                style={{ color: step === i + 1 ? GOLD : step > i + 1 ? "#52E38A" : "#7D88A3" }}
              >
                {step > i + 1 ? "✓ " : ""}
                {l}
              </span>
            ))}
          </div>
        </div>

        {step === 1 && (
          <>
            <div>
              <Field
                icon="🆔"
                label={`MIG ID (${minLen}-${maxLen} CHARACTERS)`}
                right={cleanId && <span className="pr-1 text-base">{idOk ? "✅" : "⚠️"}</span>}
              >
                <input
                  value={migId}
                  onChange={(e) => {
                    setMigId(e.target.value.replace(/[^A-Za-z0-9._-]/g, "").slice(0, maxLen));
                    setError("");
                  }}
                  placeholder="Letters, numbers, . _ -"
                  autoComplete="username"
                  disabled={off}
                  className={fieldInput}
                />
              </Field>
              <p className="mt-1 pl-3 text-[11px] text-[#7D88A3]">
                {cleanId.length} / {maxLen}
              </p>
            </div>
            <Field
              icon="🔑"
              label="PASSWORD (AT LEAST 6)"
              right={
                <button type="button" onClick={() => setShowPw((v) => !v)} aria-label="Show password" className="rounded-full p-2 text-lg">
                  {showPw ? "🙈" : "👁"}
                </button>
              }
            >
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value.slice(0, 64));
                  setError("");
                }}
                autoComplete="new-password"
                disabled={off}
                className={fieldInput}
              />
            </Field>
            {password && (
              <div className="flex items-center gap-2.5">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i < pwN ? pwColor : "#26314D" }} />
                  ))}
                </div>
                <span className="text-[11px] font-bold" style={{ color: pwColor }}>
                  {pwLabel}
                </span>
              </div>
            )}
            <Field icon="🔒" label="CONFIRM PASSWORD" right={confirm && <span className="pr-1 text-base">{confirmOk ? "✅" : "❌"}</span>}>
              <input
                type={showPw ? "text" : "password"}
                value={confirm}
                onChange={(e) => {
                  setConfirm(e.target.value.slice(0, 64));
                  setError("");
                }}
                autoComplete="new-password"
                disabled={off}
                className={fieldInput}
              />
            </Field>
          </>
        )}

        {step === 2 && (
          <>
            <Field icon="📧" label="EMAIL (A CODE WILL BE SENT HERE)">
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value.trim().slice(0, 120));
                  setError("");
                }}
                placeholder="you@example.com"
                autoComplete="email"
                disabled={off}
                className={fieldInput}
              />
            </Field>
            <div>
              <span className={fieldLabel}>GENDER</span>
              <div className="grid grid-cols-3 gap-2.5">
                {(
                  [
                    ["Male", "👨"],
                    ["Female", "👩"],
                    ["Other", "🧑"],
                  ] as const
                ).map(([g, icon]) => {
                  const sel = gender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      disabled={off}
                      onClick={() => {
                        setGender(g);
                        setError("");
                      }}
                      className={`flex flex-col items-center rounded-2xl border-[1.3px] py-3 ${
                        sel ? "border-[#FFC84A] bg-gradient-to-b from-[#FFC84A]/30 to-[#9C5BFF]/[0.13]" : "border-[#2E3A58] bg-[#141C33]"
                      }`}
                    >
                      <span className="text-2xl">{icon}</span>
                      <span className={`mt-1 text-[13px] ${sel ? "font-bold text-[#FFC84A]" : "font-medium text-[#D6DCE8]"}`}>{g}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <span className={fieldLabel}>COUNTRY</span>
              <button
                type="button"
                disabled={off}
                onClick={() => setCountryOpen(true)}
                className={`flex w-full items-center gap-3 rounded-2xl border bg-[#141C33] px-3.5 py-[15px] text-left ${
                  country ? "border-[#FFC84A]" : "border-[#2E3A58]"
                }`}
              >
                <span className="text-[22px] leading-none">{ci ? countryFlag(ci.iso) : "🌍"}</span>
                <span className={`min-w-0 flex-1 truncate text-[15px] ${country ? "font-semibold text-white" : "text-[#66718C]"}`}>
                  {country || "Select your country"}
                </span>
                <span className="text-lg text-[#FFC84A]">▾</span>
              </button>
            </div>
            <Field icon="🎟️" label="REFERRAL / INVITE CODE (OPTIONAL)">
              <input
                value={referral}
                onChange={(e) => {
                  setReferral(e.target.value.trim().slice(0, 40));
                  setError("");
                }}
                disabled={off}
                className={fieldInput}
              />
            </Field>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-[14px] bg-white/[0.08] px-3 py-2.5 text-xs text-[#D6DCE8]">
              <input
                type="checkbox"
                checked={terms}
                onChange={(e) => {
                  setTerms(e.target.checked);
                  setError("");
                }}
                disabled={off}
                className="h-5 w-5 shrink-0 accent-[#FFC84A]"
              />
              I agree to the Terms of Service &amp; Privacy Policy.
            </label>
          </>
        )}

        {step === 3 && (
          <>
            <div className="mx-auto flex h-[72px] w-[72px] items-center justify-center rounded-full bg-gradient-to-br from-[#FFC84A]/30 to-[#9C5BFF]/30 text-[34px]">
              ✉️
            </div>
            <p className="text-center text-[13px] text-[#B8C1D3]">Enter the 6-character code we sent to</p>
            <p className="break-all text-center text-[15px] font-bold text-[#FFC84A]">{cleanEmail}</p>
            <div>
              <span className={fieldLabel}>VERIFICATION CODE</span>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6));
                  setError("");
                }}
                placeholder="e.g. A576D4"
                aria-label="6-character code"
                disabled={off}
                className="w-full rounded-2xl border border-[#2E3A58] bg-[#141C33] px-3 py-3 text-center text-2xl font-extrabold tracking-[8px] text-white outline-none placeholder:text-base placeholder:font-normal placeholder:tracking-normal placeholder:text-[#66718C] focus:border-[#FFC84A]"
              />
            </div>
            <div className="flex justify-between">
              <button
                type="button"
                disabled={off}
                onClick={() => {
                  setError("");
                  setInfo("");
                  setStep(2);
                }}
                className="px-2 py-2 text-sm font-semibold text-[#FFC84A] disabled:opacity-50"
              >
                ✎ Change email
              </button>
              <button
                type="button"
                disabled={off || resendWait > 0}
                onClick={send}
                className={`px-2 py-2 text-sm font-semibold ${resendWait > 0 ? "text-[#7D88A3]" : "text-[#FFC84A]"}`}
              >
                {resendWait > 0 ? `Resend in ${resendWait}s` : "↻ Resend code"}
              </button>
            </div>
          </>
        )}

        {error && (
          <p className="rounded-[14px] border border-[#FF6B6B]/50 bg-[#FF6B6B]/15 p-3 text-[13px] font-bold text-[#FF9A9A]">⚠️ {error}</p>
        )}
        {info && !error && (
          <p className="rounded-[14px] border border-[#52E38A]/40 bg-[#52E38A]/[0.13] p-3 text-[13px] font-bold text-[#6BF0A0]">{info}</p>
        )}

        {goldBtn(
          busy ? busyLabel : step === 1 ? "NEXT  ➜" : step === 2 ? "SEND CODE  ➜" : "VERIFY & CREATE ID  ✨",
          step === 1 ? nextFromStep1 : step === 2 ? submitForm : verifyAndCreate,
          !off && (step !== 3 || code.length === 6)
        )}

        {step === 1 && (
          <Link href="/login" className="block py-1 text-center text-sm">
            <span className="text-[#9EA9C0]">Already have an account? </span>
            <span className="font-bold text-[#FFC84A]">Sign In</span>
          </Link>
        )}
      </div>
    </div>
  );
}
