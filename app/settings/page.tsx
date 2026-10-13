"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { EmailAuthProvider, reauthenticateWithCredential, signOut, updatePassword } from "firebase/auth";
import { collection, doc, getDoc, getDocs, limit, query, updateDoc, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../../lib/firebase";
import { getLang, setLang, type Lang } from "../../lib/i18n";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { ClassicTitleBar, useIsClassic } from "../_components/Classic";
import { setUiStyle, useUiStyle, type UiStyle } from "../../lib/uiStyle";
import { CHAT_TEXT_MAX, CHAT_TEXT_MIN, setChatTextSize, useChatTextSize } from "../../lib/chatTextSize";
import { clearRememberedAmounts } from "../../lib/amountMemory";
import { detachPushForLogout } from "../../lib/push";
import { leaveAllOpenRooms } from "../../lib/openRooms";
import { markOfflineForLogout } from "../../lib/heartbeat";


// Settings, like the app's: Profile Lock / Email Privacy switches, Blocked
// Users, Change Password (after the Security Question, same as the app),
// Security PIN and Recovery Email, Language. Same fields the app writes on users/{uid}.

const getSecurityQuestion = httpsCallable<Record<string, never>, { hasQuestion?: boolean; question?: string }>(
  functions,
  "getSecurityQuestion"
);
const verifySecurityAnswer = httpsCallable<{ answer: string }, unknown>(functions, "verifySecurityAnswer");
const setSecurityQuestion = httpsCallable<{ question: string; answer: string }, unknown>(functions, "setSecurityQuestion");
const submitFeedback = httpsCallable<{ message: string }, unknown>(functions, "submitFeedback");
const submitSupportRequest = httpsCallable<{ message: string }, unknown>(functions, "submitSupportRequest");

const SECURITY_QUESTIONS = [
  "What was your childhood nickname?",
  "What is the name of your first school?",
  "What is your favorite teacher's name?",
  "What was the name of your first pet?",
  "What city were you born in?",
  "What is your mother's maiden name?",
  "Custom question",
];

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

// ⚙ Settings rows: grouped white cards, a coloured icon tile, title + short
// line, and a switch / value / › on the right.
function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#5B6B8C]">{title}</p>
      <div className="divide-y divide-[#EEF2F8] overflow-hidden rounded-3xl bg-white shadow-[0_2px_10px_rgba(16,40,90,0.06)]">{children}</div>
    </section>
  );
}

function Row({
  icon,
  tint,
  title,
  subtitle,
  value,
  right,
  href,
  onClick,
}: {
  icon: string;
  tint: string;
  title: string;
  subtitle?: string;
  value?: string;
  right?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const body = (
    <>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ background: `linear-gradient(145deg, ${tint}26, ${tint}12)`, boxShadow: `inset 0 0 0 1px ${tint}22` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-[#0B1F3A]">{title}</span>
        {subtitle && <span className="block truncate text-xs text-[#6B7A99]">{subtitle}</span>}
      </span>
      {right ?? (
        <span className="flex shrink-0 items-center gap-1.5">
          {value && <span className="text-[13px] font-semibold text-[#5B6B8C]">{value}</span>}
          <span className="text-xl leading-none text-[#A9B4C2]">›</span>
        </span>
      )}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F9FD]";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

// 🔠 Room text size inside the Appearance group: A− · size · A+ (saved in this browser).
function TextSizeRow() {
  const size = useChatTextSize();
  const step = (d: number) => setChatTextSize(Math.min(CHAT_TEXT_MAX, Math.max(CHAT_TEXT_MIN, size + d)));
  return (
    <Row
      icon="🔠"
      tint="#174EA6"
      title="Room text size"
      subtitle="How big chat text is in rooms"
      right={
        <span className="flex shrink-0 items-center gap-1.5">
          <button type="button" disabled={size <= CHAT_TEXT_MIN} onClick={() => step(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#174EA6]/10 text-xs font-extrabold text-[#174EA6] disabled:opacity-40">
            A−
          </button>
          <span className="w-6 text-center text-sm font-bold text-[#0B1F3A]">{size}</span>
          <button type="button" disabled={size >= CHAT_TEXT_MAX} onClick={() => step(1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#174EA6]/10 text-[15px] font-extrabold text-[#174EA6] disabled:opacity-40">
            A+
          </button>
        </span>
      }
    />
  );
}

// 📱 App mode picker: two little previews of the look, tap one to switch.
function AppModeCard() {
  const style = useUiStyle();
  const tile = (id: UiStyle, label: string, hint: string, preview: React.ReactNode) => {
    const on = style === id;
    return (
      <button
        type="button"
        onClick={() => setUiStyle(id)}
        className={`flex-1 rounded-2xl border-2 p-2 text-left transition ${on ? "border-[#E0A800] bg-[#FFFBEB] shadow-md" : "border-[#E3EAF4] bg-white hover:border-[#C9D6E8]"}`}
        aria-pressed={on}
      >
        <div className="h-[92px] overflow-hidden rounded-xl border border-black/5">{preview}</div>
        <p className="mt-2 flex items-center gap-1.5 text-[14px] font-extrabold text-[#0B1F3A]">
          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white ${on ? "bg-[#E0A800]" : "border border-[#C5D0E0] bg-white"}`}>
            {on ? "✓" : ""}
          </span>
          {label}
        </p>
        <p className="pl-[22px] text-[11px] text-[#6B7A99]">{hint}</p>
      </button>
    );
  };
  return (
    <section>
      <p className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#5B6B8C]">App mode</p>
      <div className="flex gap-2.5 rounded-3xl bg-white p-2.5 shadow-[0_2px_10px_rgba(16,40,90,0.06)]">
        {tile(
          "modern",
          "Modern",
          "Cards, gradients, bubbles",
          <div className="h-full bg-[#EAF4FE]">
            <div className="h-5 bg-gradient-to-r from-[#2F6FD6] to-[#7C4DFF]" />
            <div className="space-y-1.5 p-2">
              <div className="h-5 rounded-lg bg-gradient-to-r from-[#2F6FD6] to-[#174EA6]" />
              <div className="flex gap-1.5">
                <div className="h-6 flex-1 rounded-lg bg-white shadow-sm" />
                <div className="h-6 flex-1 rounded-lg bg-white shadow-sm" />
              </div>
              <div className="ml-auto h-3 w-2/3 rounded-full bg-[#2F80ED]" />
            </div>
          </div>
        )}
        {tile(
          "classic",
          "Classic",
          "Orange bar, simple lists",
          <div className="h-full bg-white">
            <div className="h-5 bg-gradient-to-b from-[#FF9D2E] to-[#F07A00]" />
            <div className="h-2.5 bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD]" />
            <div className="space-y-1 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-1.5 border-b border-[#EEF2F8] pb-1">
                  <span className="h-3 w-3 rounded-sm bg-gradient-to-b from-[#FF9D2E] to-[#F07A00]" />
                  <span className="h-1.5 flex-1 rounded-full bg-[#C9D2DE]" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
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
  const classic = useIsClassic();
  const ready = useRequireLogin();
  const { user } = useSession();
  const logout = async () => {
    await detachPushForLogout();
    if (uid) await leaveAllOpenRooms(uid);
    await markOfflineForLogout(uid);
    clearRememberedAmounts();
    await signOut(auth);
  };
  const uid = user?.uid;

  const [profileLock, setProfileLock] = useState(false);
  const [emailPrivacy, setEmailPrivacy] = useState(true);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [lang, setL] = useState<Lang>("en");
  const [dialog, setDialog] = useState<"" | "blocked" | "gate" | "password" | "question" | "help" | "feedback" | "about">("");

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
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-10 sm:px-6">
        {classic ? (
          <div className="-mx-3 sm:-mx-6">
            <ClassicTitleBar title="⚙ Settings" subtitle="Privacy, security & account controls" backHref="/" />
          </div>
        ) : (
          <>
            <div className="flex items-center gap-3 pt-4">
              <BackButton href="/" />
              <h1 className="text-2xl font-black tracking-wide">SETTINGS</h1>
            </div>
            <p className="mt-1 text-sm text-[#35507E]">MIGlife · Privacy, security & account controls</p>
          </>
        )}

        {message && <p className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{message}</p>}

        {ready && (
          <div className="mt-4 space-y-5">
            {/* 📱 App mode: Modern or Classic (saved in this browser, like the app's App style) */}
            <AppModeCard />

            <Group title="Appearance">
              <Row icon="🎨" tint="#E12A6B" title="Theme & style" subtitle="Colours, Classic or Modern look" href="/appearance" />
              <Row
                icon="🌐"
                tint="#3984D9"
                title="Language"
                subtitle="App language"
                value={lang === "bn" ? "বাংলা" : "English"}
                onClick={() => {
                  setLang(lang === "bn" ? "en" : "bn");
                  window.location.reload();
                }}
              />
              <TextSizeRow />
            </Group>

            <Group title="Privacy">
              <Row
                icon="🔒"
                tint="#7B3FC7"
                title="Profile lock"
                subtitle="Only friends can see your profile"
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
              <Row
                icon="✉️"
                tint="#2F80ED"
                title="Mail from others"
                subtitle="Let other users send you mail"
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
              <Row icon="🚫" tint="#E12A2A" title="Blocked users" subtitle="People you have blocked" value={String(blocked.length)} onClick={() => setDialog("blocked")} />
            </Group>

            <Group title="Security">
              <Row icon="🔐" tint="#D4A017" title="Change password" subtitle="Update your login password" onClick={() => setDialog("gate")} />
              <Row icon="🛡️" tint="#12AFC7" title="Security PIN" subtitle="For coin transfers" href="/security" />
              <Row icon="📧" tint="#2F80ED" title="Recovery email" subtitle="For a forgotten PIN or password" href="/security" />
              <Row icon="❓" tint="#7B1FB8" title="Security question" subtitle="Needed to change your password or PIN" onClick={() => setDialog("question")} />
            </Group>

            <Group title="Help">
              <Row icon="🛟" tint="#43B65A" title="Help & Support" subtitle="Get help or report an issue" onClick={() => setDialog("help")} />
              <Row icon="💬" tint="#7B1FB8" title="Feedback & Report" subtitle="Tell us what to improve" onClick={() => setDialog("feedback")} />
            </Group>

            <Group title="About">
              <Row icon="📄" tint="#3984D9" title="Privacy Policy" subtitle="What we collect and why" href="/privacy" />
              <Row icon="ℹ️" tint="#D4AF37" title="About miGlife" subtitle="miGlife Web" onClick={() => setDialog("about")} />
            </Group>

            <button
              type="button"
              onClick={logout}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#F2B8B5] bg-[#FFF5F4] py-3.5 text-[15px] font-bold text-[#C62828] hover:bg-[#FFECEA]"
            >
              ↪ Log out
            </button>
            <p className="text-center text-[11px] text-[#8A97A8]">miGlife Web</p>
          </div>
        )}
      </section>

      {dialog === "blocked" && uid && (
        <BlockedDialog uid={uid} blocked={blocked} onUpdated={setBlocked} onMessage={setMessage} onClose={() => setDialog("")} />
      )}
      {dialog === "gate" && <SecurityGate onClose={() => setDialog("")} onVerified={() => setDialog("password")} />}
      {dialog === "question" && (
        <QuestionDialog
          onClose={() => setDialog("")}
          onDone={() => {
            setDialog("");
            setMessage("Security Question saved.");
          }}
        />
      )}
      {(dialog === "help" || dialog === "feedback") && (
        <SendDialog
          kind={dialog}
          onClose={() => setDialog("")}
          onDone={(m) => {
            setDialog("");
            setMessage(m);
          }}
        />
      )}
      {dialog === "about" && (
        <Modal title="About MIGlife" onClose={() => setDialog("")}>
          <p className="text-sm leading-5 text-[#5B6B8C]">
            MIGlife — chat rooms, friends, gifts and games. This is the web version; it uses the same account, rooms and coins as
            the app.
          </p>
          <div className="flex">
            <button type="button" className={primary} onClick={() => setDialog("")}>
              OK
            </button>
          </div>
        </Modal>
      )}
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
  // No Security Question yet → set it right here, then carry straight on.
  const [setNow, setSetNow] = useState(false);

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

  // just made the question (and typed its answer twice) → go on
  if (setNow) return <QuestionDialog onClose={() => setSetNow(false)} onDone={onVerified} />;

  return (
    <Modal title={!loading && !hasQuestion ? "🔐 Security Question needed" : "Verify it's you"} onClose={() => !busy && onClose()}>
      {loading ? (
        <div className="h-1" />
      ) : !hasQuestion ? (
        <>
          <p className="text-sm">Set a Security Question first — it protects your PIN and password.</p>
          <button
            type="button"
            onClick={() => setSetNow(true)}
            className="w-full rounded-[14px] py-3.5 text-sm font-bold text-white"
            style={{ background: "linear-gradient(90deg, #7B1FB8, #B04BD6)" }}
          >
            👉 Set up SQ first — please tap here
          </button>
        </>
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

// Set / change the Security Question (the server hashes the answer), like the app.
function QuestionDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [question, setQuestion] = useState(SECURITY_QUESTIONS[0]);
  const [custom, setCustom] = useState("");
  const [answer, setAnswer] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async () => {
    const q = question === "Custom question" ? custom.trim() : question;
    if (!q) return setError("Choose or write a question.");
    if (!answer.trim()) return setError("Enter an answer.");
    if (answer !== confirm) return setError("Answers do not match.");
    setBusy(true);
    setError("");
    try {
      await setSecurityQuestion({ question: q, answer: answer.trim() });
      onDone();
    } catch (e: any) {
      setError(e?.message || "Could not save Security Question.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="Security Question" onClose={() => !busy && onClose()}>
      <p className="text-xs text-[#5B6B8C]">
        This answer will be required before you can change your password or Security PIN — pick something only you would know.
      </p>
      <select value={question} onChange={(e) => setQuestion(e.target.value)} disabled={busy} className={input}>
        {SECURITY_QUESTIONS.map((q) => (
          <option key={q}>{q}</option>
        ))}
      </select>
      {question === "Custom question" && (
        <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Your question" disabled={busy} className={input} />
      )}
      <input type="password" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Answer" disabled={busy} className={input} />
      <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm answer" disabled={busy} className={input} />
      {error && <p className="text-xs text-[#B3261E]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={onClose}>
          CANCEL
        </button>
        <button type="button" className={primary} disabled={busy} onClick={save}>
          {busy ? "Saving…" : "SAVE"}
        </button>
      </div>
    </Modal>
  );
}

// Help & Support / Feedback & Report — sent to the server, like the app.
function SendDialog({ kind, onClose, onDone }: { kind: "help" | "feedback"; onClose: () => void; onDone: (m: string) => void }) {
  const help = kind === "help";
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const send = async () => {
    if (!text.trim()) return setError(help ? "Describe your issue first." : "Enter your feedback or report first.");
    setBusy(true);
    setError("");
    try {
      await (help ? submitSupportRequest : submitFeedback)({ message: text.trim() });
      onDone(help ? "Thanks — support has been contacted." : "Thanks — your feedback was sent.");
    } catch (e: any) {
      setError(e?.message || (help ? "Could not send your request. Try again." : "Could not send feedback. Try again."));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={help ? "Help & Support" : "Feedback & Report"} onClose={() => !busy && onClose()}>
      {help && (
        <p className="text-sm leading-5 text-[#5B6B8C]">
          For account, room, coin or security problems, describe what&apos;s happening below. Include your MIG ID.
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        placeholder={help ? "Describe your issue" : "Your feedback / report"}
        className={`${input} h-36`}
      />
      {error && <p className="text-xs text-[#B3261E]">{error}</p>}
      <div className="flex gap-2">
        <button type="button" className={secondary} disabled={busy} onClick={onClose}>
          CANCEL
        </button>
        <button type="button" className={primary} disabled={busy} onClick={send}>
          {busy ? "Sending…" : "SEND"}
        </button>
      </div>
    </Modal>
  );
}
