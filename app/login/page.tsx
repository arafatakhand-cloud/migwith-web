"use client";

import { cancelAccountDeletion } from "../../lib/accountDeletion";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";
import { AndroidDownload } from "../_components/AndroidDownload";
import { MigLoginLogo, requestWelcomeSplash } from "../_components/LoginWelcome";
import { migAliasEmail } from "../../lib/migAlias";
import { setUiStyle, useUiStyle } from "../../lib/uiStyle";

const REMEMBER_ID_KEY = "migwith.rememberedId";
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
      // "Remember Me" (like the app): the MIG ID is filled in next time
      const saved = localStorage.getItem(REMEMBER_ID_KEY);
      if (saved) {
        setLoginId(saved);
        setRememberMe(true);
      }
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

      // Stay signed in like the app (closing / minimising the browser used to
      // sign you out when "Remember Me" was off). "Remember Me" now only
      // remembers the MIG ID, same as the app.
      await setPersistence(auth, browserLocalPersistence);
      try {
        if (rememberMe) localStorage.setItem(REMEMBER_ID_KEY, cleanId);
        else localStorage.removeItem(REMEMBER_ID_KEY);
      } catch {
        // storage blocked
      }

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
      } else if (err?.code === "auth/too-many-requests") {
        // Firebase stopped logins from this device for a while (too many tries)
        setError("Too many login attempts from this device. Please wait 30–60 minutes and try again.");
      } else {
        setError(err?.message || "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    // 🫧 / 🔵 the look follows the theme (globals.css: .login-page under the Glass theme)
    <main className="login-page relative min-h-dvh overflow-x-hidden bg-gradient-to-b from-[#6CCFF6] via-[#36B1EC] to-[#1A8FD6] text-white">
      <FitToScreen>
        {/* mig + life bubble */}
        <Link href="/welcome" aria-label="About MIGlife" className="relative mt-4 block">
          <MigLoginLogo />
        </Link>

        <p className="login-ink mt-5 text-[24px] font-extrabold tracking-tight text-white">Join the Fun!</p>
        <p className="login-sub mt-1 text-[13px] text-white/75">Log in to continue chatting</p>

        {/* the app's five chat bubbles */}
        <LoginBubbles />

        {/* clean white fields with an icon, like a modern login form */}
        {/* a real form, so the browser recognises the ID + password and offers to save / fill them */}
        <form
          className="mt-6 w-full space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <label className="login-field flex items-center gap-3 rounded-[14px] border border-white/70 bg-white/95 px-4 shadow-sm transition focus-within:border-[#2563EB] focus-within:ring-4 focus-within:ring-[#2563EB]/15">
            <PersonIcon />
            <input
              id="identifier"
              type="text"
              value={loginId}
              onChange={(e) => setLoginId(e.target.value)}
              placeholder="Username"
              autoComplete="username"
              aria-label="Username"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-[16px] text-[#0F1D3A] caret-[#2563EB] outline-none placeholder:text-[#8494B2]"
            />
          </label>
          <label className="login-field flex items-center gap-3 rounded-[14px] border border-white/70 bg-white/95 px-4 shadow-sm transition focus-within:border-[#2563EB] focus-within:ring-4 focus-within:ring-[#2563EB]/15">
            <LockIcon />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
              aria-label="Password"
              className="min-w-0 flex-1 bg-transparent py-3.5 text-[16px] text-[#0F1D3A] caret-[#2563EB] outline-none placeholder:text-[#8494B2]"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="shrink-0 p-1 text-[#8494B2]"
            >
              <EyeIcon open={showPassword} />
            </button>
          </label>
          <button type="submit" hidden aria-hidden tabIndex={-1} />
        </form>

        <div className="mt-4 flex w-full items-center justify-between gap-3 px-0.5">
          <AppSwitch checked={rememberMe} onChange={setRememberMe} label="Remember me" />
          <AppSwitch checked={offline} onChange={setOffline} label="Login as offline" right />
        </div>

        {error && (
          <div className="mt-4 w-full rounded-xl border border-red-300/40 bg-red-500/20 px-4 py-2.5 text-sm text-red-100">{error}</div>
        )}

        <button
          type="button"
          onClick={handleLogin}
          disabled={loading}
          className="login-main mt-5 w-full rounded-[14px] border border-white/20 bg-gradient-to-b from-[#24508C] to-[#14325C] py-3.5 text-[17px] font-bold tracking-wide text-white shadow-[0_10px_22px_-10px_rgba(20,50,92,.9)] transition active:scale-[.98] disabled:opacity-60"
        >
          {loading ? "…" : "Login"}
        </button>
        <Link
          href="/register"
          className="login-alt mt-3 block w-full rounded-[14px] border border-white bg-white py-3.5 text-center text-[17px] font-bold text-[#1D4ED8] shadow-[0_4px_10px_rgba(0,0,0,.10)] transition active:scale-[.98]"
        >
          Create Account
        </Link>
        <Link href="/forgot-password" className="login-link mt-4 text-[15px] font-semibold text-white">
          Forgot password?
        </Link>
        {/* ── APPEARANCE ── */}
        <div className="login-sub mb-3 mt-6 flex w-full items-center gap-2.5 text-[11px] font-bold tracking-[0.16em] text-white/65">
          <span className="login-rule h-px flex-1 bg-white/25" />
          APPEARANCE
          <span className="login-rule h-px flex-1 bg-white/25" />
        </div>
        {/* ✨ / 📟 The site opens in whichever style is chosen here (same switch as Settings › Appearance). */}
        <LoginStyleChoice />
        {/* 🫧 Glass / 🔵 Blue: pick the look before signing in (it is the theme too) */}
        <LoginThemeChoice />
        {/* Android app download (the link miglife sets in miglife secret) */}
        <AndroidDownload />
      </FitToScreen>
    </main>
  );
}

function LoginStyleChoice() {
  const style = useUiStyle();
  return (
    <LoginSegment
      options={[
        ["modern", "✨ Modern"],
        ["classic", "📟 Classic"],
      ]}
      value={style === "classic" ? "classic" : "modern"}
      onPick={(id) => setUiStyle(id as "modern" | "classic")}
    />
  );
}

/** Two-part picker (Modern | Classic, Glass | Blue): the chosen half is a white pill. */
function LoginSegment({ options, value, onPick }: { options: [string, string][]; value: string; onPick: (id: string) => void }) {
  return (
    <div className="login-seg mb-2 flex w-full rounded-xl border border-white/25 bg-white/15 p-[3px]">
      {options.map(([id, label]) => (
        <button
          key={id}
          type="button"
          onClick={() => onPick(id)}
          className={`flex-1 whitespace-nowrap rounded-[9px] py-2 text-[14px] transition ${
            value === id ? "login-seg-on bg-white font-bold text-[#1D4ED8] shadow-[0_2px_6px_-2px_rgba(30,60,120,.35)]" : "login-ink font-medium text-white/90"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** A rounded tick box with its label. */
// 📱 The whole login page fits on the phone's screen — no scrolling. When it is
// taller than the screen it is shrunk (zoom) to fit; the tallest screen height
// seen is used, so the keyboard opening doesn't shrink it further.
function FitToScreen({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    let tallest = 0;
    let width = window.innerWidth;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      if (window.innerWidth !== width) {
        // turned the phone: start again
        width = window.innerWidth;
        tallest = 0;
      }
      tallest = Math.max(tallest, window.innerHeight);
      // its height at full size
      const was = el.style.zoom;
      el.style.zoom = "1";
      const natural = el.getBoundingClientRect().height;
      el.style.zoom = was;
      if (natural > 0) setZoom(Math.max(0.6, Math.min(1, tallest / natural)));
    };
    fit();
    const t = setTimeout(fit, 400); // after the fonts / pictures settle
    window.addEventListener("resize", fit);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", fit);
    };
  }, []);
  return (
    <section
      ref={ref}
      style={{ zoom }}
      className="relative z-10 mx-auto flex w-full max-w-sm flex-col items-center px-6 pb-5 pt-6"
    >
      {children}
    </section>
  );
}

// 🫧 Glass / 🔵 Blue (miGlife Classic): the same choice as Settings › Appearance,
// saved in this browser, so the site opens in it after signing in too.
function LoginThemeChoice() {
  const [glass, setGlass] = useState(true);
  useEffect(() => setGlass(document.documentElement.dataset.theme === "glass"), []);
  const pick = (g: boolean) => {
    setGlass(g);
    try {
      localStorage.setItem("migwith.theme", g ? "glass" : "sky_blue");
    } catch {
      // storage blocked
    }
    if (g) document.documentElement.dataset.theme = "glass";
    else delete document.documentElement.dataset.theme;
  };
  return (
    <LoginSegment
      options={[
        ["glass", "🫧 Glass"],
        ["blue", "🔵 Blue"],
      ]}
      value={glass ? "glass" : "blue"}
      onPick={(id) => pick(id === "glass")}
    />
  );
}

/** A small on/off switch with its label (Remember me / Login as offline). */
function AppSwitch({ checked, onChange, label, right }: { checked: boolean; onChange: (v: boolean) => void; label: string; right?: boolean }) {
  const sw = (
    <span
      className={`login-sw relative h-[21px] w-9 shrink-0 rounded-full transition-colors ${checked ? "login-sw-on bg-[#1D4ED8]" : "bg-white/35"}`}
    >
      <span
        className={`absolute top-[2.5px] h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.3)] transition-all ${checked ? "left-[17.5px]" : "left-[2.5px]"}`}
      />
    </span>
  );
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="login-ink flex items-center gap-2.5 text-left text-[14.5px] text-white"
    >
      {!right && sw}
      {label}
      {right && sw}
    </button>
  );
}

const ICON = "h-[22px] w-[22px] shrink-0 text-[#6B7FA6]";
function PersonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1Z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={ICON} aria-hidden>
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
    ["😄", "#FFB15C", "#F07A1A", 0],
    ["👥", "#5FD47A", "#22A447", 0],
    ["💝", "#B98BFF", "#7B4BE0", 0],
    ["❤️", "#FF8DB8", "#E8457E", 0],
  ];
  return (
    <div className="mt-5 flex w-full items-end justify-center gap-3">
      {bubbles.map(([e, a, b, lift], i) => (
        <span key={i} className="relative" style={{ marginBottom: lift * 5 }}>
          <span
            className="relative z-10 flex h-[42px] w-[48px] items-center justify-center rounded-[14px] border-2 border-white/90 text-[20px] shadow-[0_6px_14px_-6px_rgba(20,40,90,.5)]"
            style={{ background: `linear-gradient(180deg, ${a}, ${b})` }}
          >
            <span className="absolute left-1.5 right-1.5 top-1 h-2.5 rounded-full bg-white/35" />
            <span className="relative">{e}</span>
          </span>
          {/* the bubble's little tail */}
          <span
            className={`absolute -bottom-[6px] h-3 w-3 rotate-45 border-b-2 border-r-2 border-white/90 ${i % 2 ? "right-3" : "left-3"}`}
            style={{ background: b }}
          />
        </span>
      ))}
    </div>
  );
}
