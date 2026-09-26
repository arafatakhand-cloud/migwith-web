"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../lib/firebase";
import { getLang, setLang, type Lang } from "../../lib/i18n";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import { PastelCard, SectionLabel } from "../_components/LightCards";

// Settings, like the app's: Profile Lock / Email Privacy switches, Blocked
// Users, Change Password (after the Security Question, same as the app),
// Security PIN and Recovery Email, Language. Same fields the app writes on users/{uid}.

const getSecurityQuestion = httpsCallable<Record<string, never>, { hasQuestion?: boolean; question?: string }>(
  functions,
  "getSecurityQuestion"
);
const verifySecurityAnswer = httpsCallable<{ answer: string }, unknown>(functions, "verifySecurityAnswer");

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${on ? "bg-[#174EA6]" : "bg-[#C5D0E0]"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black">{title}</h2>
        {children}
      </div>
    </div>
  );
}

const input =
  "w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]";
const primary = "flex-1 rounded-xl bg-[#2F80ED] py-3 text-sm font-black text-white disabled:opacity-50";
const secondary = "flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]";

export default function SettingsPage() {
  const ready = useRequireLogin();
  const { user } = useSession();
  const uid = user?.uid;

  const [profileLock, setProfileLock] = useState(false);
  const [emailPrivacy, setEmailPrivacy] = useState(true);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [lang, setL] = useState<Lang>("en");
  const [dialog, setDialog] = useState<"" | "blocked" | "gate" | "password">("");

  useEffect(() => setL(getLang()), []);

  useEffect(() => {
    if (!uid) return;
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        setProfileLock(snap.get("profileLocked") === true);
        setEmailPrivacy(snap.get("emailPrivacy") !== false);
        const b = snap.get("blockedUsers");
        setBlocked(Array.isArray(b) ? b.map(String) : []);
        setLoaded(true);
      })
      .catch((e) => setMessage(e?.message || "Could not load settings."));
  }, [uid]);

  const save = async (field: string, value: unknown, ok: string) => {
    if (!uid) return false;
    try {
      await updateDoc(doc(db, "users", uid), { [field]: value });
      setMessage(ok);
      return true;
    } catch (e: any) {
      setMessage(e?.message || "Could not save setting.");
      return false;
    }
  };

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <div className="flex items-center gap-3 pt-4">
          <Link
            href="/"
            aria-label="Back"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[#BFD7F2] bg-white text-lg shadow-sm"
          >
            ←
          </Link>
          <h1 className="text-2xl font-black tracking-wide">SETTINGS</h1>
        </div>
        <p className="mt-1 text-sm text-[#35507E]">MIGwith · Privacy, security & account controls</p>

        {message && <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{message}</p>}

        {ready && (
          <>
            <SectionLabel>Privacy</SectionLabel>
            <div className="space-y-2.5">
              <PastelCard
                icon="🔒"
                title="Profile Lock"
                subtitle="Lock your profile from others"
                color="#7B3FC7"
                right={
                  <Switch
                    on={profileLock}
                    disabled={!loaded}
                    onChange={async (v) => {
                      if (await save("profileLocked", v, v ? "Profile locked." : "Profile unlocked.")) setProfileLock(v);
                    }}
                  />
                }
              />
              <PastelCard
                icon="✉️"
                title="Email Privacy"
                subtitle="Allow other users to email you"
                color="#3984D9"
                right={
                  <Switch
                    on={emailPrivacy}
                    disabled={!loaded}
                    onChange={async (v) => {
                      if (await save("emailPrivacy", v, v ? "Email privacy updated." : "Email contact disabled.")) setEmailPrivacy(v);
                    }}
                  />
                }
              />
              <PastelCard icon="🚫" title="Blocked Users" subtitle="Manage users you have blocked" color="#E12A2A" onClick={() => setDialog("blocked")} />
            </div>

            <SectionLabel>Security</SectionLabel>
            <div className="space-y-2.5">
              <PastelCard icon="🔐" title="Change Password" subtitle="Update your account password securely" color="#D4AF37" onClick={() => setDialog("gate")} />
              <PastelCard icon="🛡️" title="Security PIN" subtitle="Set or change your PIN for coin transfers" color="#12AFC7" href="/security" />
              <PastelCard icon="📧" title="Recovery Email" subtitle="For a forgotten PIN or password" color="#2F80ED" href="/security" />
              <PastelCard icon="❓" title="Security Question" subtitle="Required before you can change your password or PIN" color="#7B1FB8" note="In app" />
            </div>

            <SectionLabel>App preferences</SectionLabel>
            <div className="space-y-2.5">
              <PastelCard icon="🎨" title="Appearance & Theme" subtitle="Customize the MIGwith visual style" color="#E12A6B" note="In app" />
              <PastelCard
                icon="🌐"
                title="Language"
                subtitle={lang === "bn" ? "বাংলা" : "English"}
                color="#3984D9"
                onClick={() => {
                  setLang(lang === "bn" ? "en" : "bn");
                  window.location.reload();
                }}
              />
            </div>

            <SectionLabel>Support</SectionLabel>
            <div className="space-y-2.5">
              <PastelCard icon="❔" title="Help & Support" subtitle="Get help or report an issue" color="#43B65A" note="In app" />
              <PastelCard icon="💬" title="Feedback & Report" subtitle="Send feedback or report a problem" color="#7B1FB8" note="In app" />
              <PastelCard icon="ℹ️" title="About MIGwith" subtitle="MIGwith Web" color="#D4AF37" note="Web" />
            </div>
          </>
        )}
      </section>

      {dialog === "blocked" && uid && (
        <BlockedDialog uid={uid} blocked={blocked} onUpdated={setBlocked} onMessage={setMessage} onClose={() => setDialog("")} />
      )}
      {dialog === "gate" && <SecurityGate onClose={() => setDialog("")} onVerified={() => setDialog("password")} />}
      {dialog === "password" && (
        <PasswordDialog
          onClose={() => setDialog("")}
          onDone={() => {
            setDialog("");
            setMessage("Password changed successfully.");
          }}
        />
      )}
    </PageShell>
  );
}

function BlockedDialog({
  uid,
  blocked,
  onUpdated,
  onMessage,
  onClose,
}: {
  uid: string;
  blocked: string[];
  onUpdated: (list: string[]) => void;
  onMessage: (m: string) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const write = async (list: string[], ok: string) => {
    setBusy(true);
    setError("");
    try {
      await updateDoc(doc(db, "users", uid), { blockedUsers: list });
      onUpdated(list);
      onMessage(ok);
      return true;
    } catch (e: any) {
      setError(e?.message || "Could not save.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const block = async () => {
    const q = target.trim();
    if (!q) return setError("Enter a username or MIG ID.");
    if (blocked.some((b) => b.toLowerCase() === q.toLowerCase())) return setError("User is already blocked.");
    setBusy(true);
    try {
      const snap = await getDocs(query(collection(db, "users"), where("username", "==", q), limit(1)));
      const d = snap.docs[0];
      if (!d) return setError("User not found.");
      if (d.id === uid) return setError("You cannot block yourself.");
      const name = String(d.get("username") || q);
      if (await write(Array.from(new Set([...blocked, name])), "User blocked.")) setTarget("");
    } catch (e: any) {
      setError(e?.message || "Could not find user.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="🚫 Blocked Users" onClose={() => !busy && onClose()}>
      {blocked.length === 0 ? (
        <p className="text-sm text-[#5B6B8C]">No blocked users.</p>
      ) : (
        <ul className="max-h-60 space-y-1 overflow-y-auto">
          {blocked.map((name) => (
            <li key={name} className="flex items-center rounded-xl bg-[#F4F9FF] px-3 py-2">
              <span data-notranslate className="flex-1 truncate font-semibold">
                {name}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => write(blocked.filter((b) => b.toLowerCase() !== name.toLowerCase()), `${name} unblocked.`)}
                className="text-xs font-bold text-[#2F80ED]"
              >
                Unblock
              </button>
            </li>
          ))}
        </ul>
      )}
      <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username / MIG ID" className={input} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Close
        </button>
        <button type="button" onClick={block} disabled={busy} className={primary}>
          {busy ? "Working…" : "Block"}
        </button>
      </div>
    </Modal>
  );
}

// Same gate as the app: the account's Security Question must be answered first.
function SecurityGate({ onClose, onVerified }: { onClose: () => void; onVerified: () => void }) {
  const [loading, setLoading] = useState(true);
  const [question, setQuestion] = useState("");
  const [hasQuestion, setHasQuestion] = useState(true);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getSecurityQuestion({})
      .then((r) => {
        setHasQuestion(r.data?.hasQuestion === true);
        setQuestion(String(r.data?.question || ""));
      })
      .catch((e) => setError(e?.message || "Could not load your Security Question."))
      .finally(() => setLoading(false));
  }, []);

  const verify = async () => {
    if (!answer.trim()) return setError("Enter your answer.");
    setBusy(true);
    setError("");
    try {
      await verifySecurityAnswer({ answer: answer.trim() });
      onVerified();
    } catch (e: any) {
      setError(e?.message || "That answer is not correct.");
      setBusy(false);
    }
  };

  return (
    <Modal title="Verify it's you" onClose={() => !busy && onClose()}>
      {loading ? (
        <p className="text-sm text-[#5B6B8C]">Checking your Security Question…</p>
      ) : !hasQuestion ? (
        <p className="text-sm text-rose-600">
          You need to set a Security Question first (in the MIGwith app: Settings › Security Question) before you can change
          your password.
        </p>
      ) : (
        <>
          <p data-notranslate className="font-bold">
            {question}
          </p>
          <input
            type="password"
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && verify()}
            placeholder="Answer"
            className={input}
          />
        </>
      )}
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        {hasQuestion && !loading && (
          <button type="button" onClick={verify} disabled={busy} className={primary}>
            {busy ? "Checking…" : "Verify"}
          </button>
        )}
      </div>
    </Modal>
  );
}

function PasswordDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const change = async () => {
    setError("");
    const u = auth.currentUser;
    if (!u || !u.email) return setError("Could not identify your account.");
    if (!current) return setError("Enter your current password.");
    if (next.length < 6) return setError("New password must be at least 6 characters.");
    if (next !== confirm) return setError("Passwords do not match.");
    if (next === current) return setError("The new password must be different.");
    setBusy(true);
    try {
      await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, current));
    } catch {
      setBusy(false);
      return setError("Current password is incorrect.");
    }
    try {
      await updatePassword(u, next);
      onDone();
    } catch (e: any) {
      setError(e?.message || "Could not change password.");
      setBusy(false);
    }
  };

  const type = show ? "text" : "password";
  return (
    <Modal title="🔐 Change Password" onClose={() => !busy && onClose()}>
      <p className="text-xs text-[#5B6B8C]">Enter your current password, then choose a new one.</p>
      <div className="relative">
        <input type={type} value={current} onChange={(e) => setCurrent(e.target.value)} placeholder="Current password" autoComplete="current-password" className={input} />
        <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-lg" aria-label="Show password">
          {show ? "🙈" : "👁"}
        </button>
      </div>
      <input type={type} value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password" autoComplete="new-password" className={input} />
      <input type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className={input} />
      {error && <p className="text-sm text-rose-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onClose} disabled={busy} className={secondary}>
          Cancel
        </button>
        <button type="button" onClick={change} disabled={busy} className={primary}>
          {busy ? "Saving…" : "Change"}
        </button>
      </div>
    </Modal>
  );
}
