"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useFounderPerms } from "../../lib/founder";
import { OFFICIAL_COUNTRY_ROOMS } from "../../lib/rooms";
import { FounderShell, input } from "./_Shell";
import { LevelCurveCard, LuxuryBetSection, SecurityQuestionResetCard } from "./_MainFounderCards";

// "miglife secret", the app's BlogPage: the founder tools, the "other users
// ID creation" switch, Luxury Bot sequence tiers and FOUNDER CREATE ID.

const setIdCreationStatusFn = httpsCallable<{ enabled: boolean }, unknown>(functions, "setIdCreationStatus");
const manageFounder = httpsCallable<{ action: string; enabled: boolean }, unknown>(functions, "manageFounder");
// The switch is written straight to app_settings/id_creation, which the
// Firestore rules allow for the founder only (the app does the same when the
// function isn't there). If that write is refused, setIdCreationStatus and
// then manageFounder are tried; the first error is the one shown.
async function setIdCreationStatus(args: { enabled: boolean }) {
  try {
    await setDoc(
      doc(db, "app_settings", "id_creation"),
      { otherUserCreationEnabled: args.enabled, updatedAt: serverTimestamp() },
      { merge: true }
    );
    return;
  } catch (first: any) {
    try {
      return await setIdCreationStatusFn(args);
    } catch {
      try {
        return await manageFounder({ action: "setIdCreation", enabled: args.enabled });
      } catch {
        throw first;
      }
    }
  }
}
const setLuxuryConfig = httpsCallable<{ tiersEnabled: Record<string, boolean> }, unknown>(functions, "setLuxuryBotSequenceConfig");
const ceoCreateUserId = httpsCallable<Record<string, string>, { username?: string }>(functions, "ceoCreateUserId");

const TIERS: [string, string][] = [
  ["single", "Single"],
  ["easy", "Easy pairs"],
  ["medium", "Medium pairs"],
  ["hard", "Hard pairs"],
  ["trio", "Trio"],
];

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition ${on ? "bg-[#2F80ED]" : "bg-[#C9D3E3]"}`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${on ? "left-6" : "left-1"}`} />
    </button>
  );
}

export default function SecretPage() {
  const f = useFounderPerms();
  const [idOn, setIdOn] = useState(false);
  const [tiers, setTiers] = useState<Record<string, boolean>>({ single: true, easy: true, medium: true, hard: true, trio: true });
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (!f.isAnyFounder) return;
    const a = onSnapshot(doc(db, "app_settings", "id_creation"), (s) => setIdOn(s.get("otherUserCreationEnabled") === true), () => {});
    const b = onSnapshot(
      doc(db, "app_settings", "luxury_bot_sequences"),
      (s) => {
        const t = (s.get("tiersEnabled") || {}) as Record<string, unknown>;
        setTiers(Object.fromEntries(TIERS.map(([k]) => [k, t[k] !== false])));
      },
      () => {}
    );
    return () => {
      a();
      b();
    };
  }, [f.isAnyFounder]);

  const tools: [string, string, string, boolean][] = [
    ["👑", "Founders (add / remove)", "/secret/founders", f.isMigwith],
    ["🔐", "Share Permissions", "/secret/share", f.can("share_permissions")],
    ["ℹ", "Room info", "/secret/rooms", f.can("room_info")],
    ["✉", "Change Email", "/secret/email", f.can("change_email")],
    ["🌐", "IP Monitor / IP Ban", "/secret/ip", f.can("ip_monitor")],
    ["💰", "Coin Control", "/secret/coins", f.can("coin_control")],
  ];

  return (
    <FounderShell title="miglife secret" allowed={f.isAnyFounder} loaded={f.loaded}>
      <div className="space-y-2 rounded-[18px] border border-[#E0A82E] bg-white p-4">
        <p className="text-[17px] font-bold">🧰 Founder Tools</p>
        {tools
          .filter(([, , , ok]) => ok)
          .map(([icon, label, href]) => (
            <Link key={href} href={href} className="flex items-center gap-2.5 rounded-xl bg-[#F1F5FB] px-3.5 py-3 font-semibold">
              <span className="text-lg">{icon}</span>
              <span className="flex-1">{label}</span>
              <span className="text-xl text-gray-400">›</span>
            </Link>
          ))}
      </div>

      {/* ID tools: the main founder (miglife) ONLY, whatever perms other founders have. */}
      {f.isMigwith && (
        <div className="rounded-[18px] border border-[#E0A82E] bg-white p-4">
          <p className="text-[17px] font-bold">🔴 Other Users ID Creation</p>
          <p className="mt-1 text-xs text-gray-500">{idOn ? "ENABLE — normal users can create IDs." : "OFF — normal users cannot create IDs."}</p>
          <div className="mt-2 flex items-center">
            <span className={`flex-1 font-bold ${idOn ? "text-[#0A9F4A]" : "text-[#B3261E]"}`}>{idOn ? "ENABLE" : "OFF"}</span>
            <Switch
              on={idOn}
              onChange={(v) => {
                const prev = idOn;
                setIdOn(v);
                setStatus("Saving ID creation setting...");
                setIdCreationStatus({ enabled: v })
                  .then(() => setStatus(v ? "Normal user ID creation is now ON." : "Normal user ID creation is now OFF."))
                  .catch((e) => {
                    setIdOn(prev);
                    setStatus(e?.message || "Setting save failed.");
                  });
              }}
            />
          </div>
        </div>
      )}

      {f.can("luxury_tiers") && (
        <div className="space-y-2 rounded-[18px] border border-[#E0A82E] bg-white p-4">
          <p className="text-[17px] font-bold">🎛️ Luxury Bot Sequence Tiers</p>
          <p className="text-xs text-gray-500">
            Turn any result tier off to remove it from the round pool. Takes effect on the next round — no redeploy needed. Which pairs count as
            easy/medium is set via /luxconfig in chat.
          </p>
          {TIERS.map(([k, label]) => (
            <div key={k} className="flex items-center">
              <span className="flex-1">{label}</span>
              <Switch
                on={tiers[k]}
                onChange={(v) => {
                  const prev = tiers[k];
                  setTiers((t) => ({ ...t, [k]: v }));
                  setLuxuryConfig({ tiersEnabled: { [k]: v } })
                    .then(() => setStatus(`Luxury Bot's "${k}" tier is now ${v ? "ON" : "OFF"}.`))
                    .catch((e) => {
                      setTiers((t) => ({ ...t, [k]: prev }));
                      setStatus(e?.message || "Setting save failed.");
                    });
                }}
              />
            </div>
          ))}
        </div>
      )}

      {f.isMigwith && (
        <div className="rounded-[18px] border border-[#E0A82E] bg-[#11101A] p-4">
          <p className="text-lg font-extrabold text-[#FFD35A]">👑 FOUNDER CREATE ID</p>
          <p className="mt-1 text-xs text-[#D0D5E0]">FOUNDER mode uses the same MIG ID rule: minimum 3 characters and at least 1 English letter.</p>
          <button type="button" onClick={() => setCreateOpen(true)} className="mt-3 w-full rounded-full bg-[#E0A82E] py-2.5 font-extrabold text-black">
            CREATE ID
          </button>
        </div>
      )}

      {/* miglife only, like the app: new level curve, Security Question Reset, 🎰 Luxury Bet. */}
      {f.isMigwith && (
        <>
          <LevelCurveCard />
          <SecurityQuestionResetCard />
          <LuxuryBetSection />
        </>
      )}

      {status && <p className="text-xs font-bold text-[#B3261E]">{status}</p>}

      {createOpen && (
        <CreateIdDialog
          onClose={() => setCreateOpen(false)}
          onDone={(m) => {
            setStatus(m);
            setCreateOpen(false);
          }}
        />
      )}
    </FounderShell>
  );
}

function CreateIdDialog({ onClose, onDone }: { onClose: () => void; onDone: (m: string) => void }) {
  const [migId, setMigId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [gender, setGender] = useState("");
  const [country, setCountry] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const create = async () => {
    const id = migId.trim();
    const mail = email.trim();
    if (!id) return setError("MIG ID is required.");
    if (!/^(?=.*[A-Za-z])[A-Za-z0-9._-]{1,27}$/.test(id))
      return setError("MIG ID must be 1-27 characters and contain at least 1 English letter. Allowed: A-Z, a-z, 0-9, . _ -");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) return setError("Enter a valid email.");
    if (password.length < 6) return setError("Password must be at least 6 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    if (!gender || !country) return setError("Gender and country are required.");
    setBusy(true);
    setError("");
    try {
      const { data } = await ceoCreateUserId({ migId: id, email: mail, password, gender, country });
      onDone(`ID created successfully: ${data?.username || id}`);
    } catch (e: any) {
      setError(e?.message || "FOUNDER ID creation failed.");
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => !busy && onClose()}>
      <div className="max-h-[90vh] w-full max-w-md space-y-2.5 overflow-y-auto rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-extrabold">👑 FOUNDER CREATE ID</p>
        <input value={migId} onChange={(e) => setMigId(e.target.value)} placeholder="MIG ID" disabled={busy} className={input} />
        <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" type="email" disabled={busy} className={input} />
        <div className="relative">
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            type={show ? "text" : "password"}
            disabled={busy}
            className={input}
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="Show password">
            {show ? "🙈" : "👁"}
          </button>
        </div>
        <input
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm Password"
          type={show ? "text" : "password"}
          disabled={busy}
          className={input}
        />
        <select value={gender} onChange={(e) => setGender(e.target.value)} disabled={busy} className={input}>
          <option value="">Select gender</option>
          {["Male", "Female", "Other"].map((g) => (
            <option key={g}>{g}</option>
          ))}
        </select>
        <select value={country} onChange={(e) => setCountry(e.target.value)} disabled={busy} className={input}>
          <option value="">Select country</option>
          {OFFICIAL_COUNTRY_ROOMS.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        {error && <p className="text-xs font-bold text-[#B3261E]">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button type="button" disabled={busy} onClick={onClose} className="font-bold text-[#2F80ED]">
            CANCEL
          </button>
          <button type="button" disabled={busy} onClick={create} className="rounded-full bg-[#E0A82E] px-5 py-2 font-bold text-black">
            {busy ? "CREATING..." : "CREATE ID"}
          </button>
        </div>
      </div>
    </div>
  );
}
