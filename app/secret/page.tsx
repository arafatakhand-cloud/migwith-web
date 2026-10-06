"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useFounderPerms } from "../../lib/founder";
import { ALL_COUNTRIES, countryFlag } from "../../lib/countries";
import { FounderShell, input } from "./_Shell";
import {
  AppDownloadLinkCard,
  FounderSpecialColorCard,
  LevelCurveCard,
  LuxuryBetAccessCard,
  LuxuryBetLevelCard,
  SecurityQuestionResetCard, PrivateEmailsCard } from "./_MainFounderCards";
import { FounderAchievementsCard } from "../_components/Achievements";

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
  // 🧰 Which Founder Tool is open (null = the tools list).
  const [tool, setTool] = useState<string | null>(null);

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

  // 🧰 FOUNDER TOOLS — every tool in one tidy, grouped list (like the app).
  // Tools that are separate pages open those pages; the rest open right here
  // (tool) with the back arrow returning to this list.
  type Tool = { icon: string; label: string; hint: string; tint: string; href?: string; key?: string; ok: boolean };
  const groups: [string, Tool[]][] = (
    [
      [
        "👥 Team & Users",
        [
          { icon: "👑", label: "Founders", hint: "Add / remove founders & their tools", tint: "#E0A82E", href: "/secret/founders", ok: f.isMigwith },
          { icon: "⭐", label: "Level Curve", hint: "New level curve (after Lv.40)", tint: "#F2B705", key: "level", ok: f.isMigwith },
          { icon: "🔐", label: "Security Question Reset", hint: "Remove an ID's security question", tint: "#6A4BD8", key: "security", ok: f.isMigwith },
          { icon: "✉", label: "Change Email", hint: "Change an ID's email", tint: "#2E86DE", href: "/secret/email", ok: f.can("change_email") },
          { icon: "👑", label: "Founder Create ID", hint: "Create a MIG ID yourself", tint: "#D4A017", key: "create_id", ok: f.isMigwith },
          { icon: "🆔", label: "Other Users ID Creation", hint: "Let normal users create IDs (ON/OFF)", tint: "#E53935", key: "id_creation", ok: f.isMigwith },
        ],
      ],
      [
        "🛡 Safety & Rooms",
        [
          { icon: "🔐", label: "Share Permissions", hint: "Who can share pictures / voice / video", tint: "#00897B", href: "/secret/share", ok: f.can("share_permissions") },
          { icon: "ℹ", label: "Room info", hint: "Room details & settings", tint: "#3949AB", href: "/secret/rooms", ok: f.can("room_info") },
          { icon: "🌐", label: "IP Monitor / IP Ban", hint: "See IPs, ban an IP", tint: "#546E7A", href: "/secret/ip", ok: f.can("ip_monitor") },
        ],
      ],
      [
        "💰 Coins & Shop",
        [
          { icon: "💰", label: "Coin Control", hint: "Add or remove coins", tint: "#2E7D32", href: "/secret/coins", ok: f.can("coin_control") },
          { icon: "🎁", label: "Gift Gallery", hint: "Add / edit / delete gifts", tint: "#E91E63", href: "/gifts", ok: f.can("gift_shop") },
          { icon: "👑", label: "VIP Subscription", hint: "Approve payments · ON/OFF · rate", tint: "#AB47BC", key: "vip", ok: f.isMigwith },
          { icon: "🏅", label: "Achievements & Badges", hint: "Recount badges · event badges", tint: "#FF8F00", key: "achievements", ok: f.isMigwith },
          { icon: "📲", label: "App Download Link", hint: "Android app download link", tint: "#1E88E5", key: "app_link", ok: f.isMigwith },
        ],
      ],
      [
        "🎮 Games",
        [
          { icon: "🎰", label: "Luxury Bet", hint: "Access · Level · Schedule", tint: "#8E24AA", key: "luxury_bet", ok: f.isMigwith },
          { icon: "🎲", label: "Luxury Bot Tiers", hint: "Turn result tiers on / off", tint: "#5E35B1", key: "luxury_tiers", ok: f.can("luxury_tiers") },
        ],
      ],
      [
        "⚠ Danger zone",
        [
          { icon: "🔒", label: "Private Emails", hint: "Hide everyone's email & push token (one-time move)", tint: "#37474F", key: "privacy", ok: f.isMigwith },
        ],
      ],
    ] as [string, Tool[]][]
  )
    .map(([g, list]) => [g, list.filter((t) => t.ok)] as [string, Tool[]])
    .filter(([, list]) => list.length > 0);
  const allTools = groups.flatMap(([, list]) => list);
  const openTool = allTools.find((t) => t.key && t.key === tool) || null;

  return (
    <FounderShell
      title={openTool ? `${openTool.icon} ${openTool.label}` : "miglife secret"}
      allowed={f.isAnyFounder}
      loaded={f.loaded}
      onBack={openTool ? () => setTool(null) : undefined}
    >
      {!openTool && (
        <div className="space-y-1.5 rounded-[22px] border border-[#E0A82E] bg-white p-3.5 shadow-md">
          <div className="flex items-center gap-2">
            <span className="text-[22px]">🧰</span>
            <div>
              <p className="text-lg font-extrabold">Founder Tools</p>
              <p className="text-[11px] text-[#5B6B8C]">{allTools.length} tools</p>
            </div>
          </div>
          {groups.map(([groupTitle, list]) => (
            <div key={groupTitle} className="space-y-1.5">
              <p className="pl-0.5 pt-2 text-[11px] font-bold uppercase tracking-[1px] text-[#5B6B8C]">{groupTitle}</p>
              {list.map((t) => {
                const body = (
                  <>
                    <span
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] text-[17px]"
                      style={{ background: `linear-gradient(135deg, ${t.tint}F2, ${t.tint}99)` }}
                    >
                      {t.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold">{t.label}</span>
                      <span className="block truncate text-[11px] text-[#5B6B8C]">{t.hint}</span>
                    </span>
                    <span className="text-[22px] font-bold" style={{ color: t.tint }}>
                      ›
                    </span>
                  </>
                );
                const cls = "flex w-full items-center gap-3 rounded-[14px] border border-[#E3EAF5] bg-[#F4F7FC] px-2.5 py-[9px] text-left";
                return t.href ? (
                  <Link key={t.label} href={t.href} className={cls}>
                    {body}
                  </Link>
                ) : (
                  <button key={t.label} type="button" onClick={() => setTool(t.key!)} className={cls}>
                    {body}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ID tools: the main founder (miglife) ONLY, whatever perms other founders have. */}
      {f.isMigwith && tool === "id_creation" && (
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

      {f.can("luxury_tiers") && tool === "luxury_tiers" && (
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

      {f.isMigwith && tool === "create_id" && (
        <div className="rounded-[18px] border border-[#E0A82E] bg-[#11101A] p-4">
          <p className="text-lg font-extrabold text-[#FFD35A]">👑 FOUNDER CREATE ID</p>
          <p className="mt-1 text-xs text-[#D0D5E0]">FOUNDER mode uses the same MIG ID rule: minimum 3 characters and at least 1 English letter.</p>
          <button type="button" onClick={() => setCreateOpen(true)} className="mt-3 w-full rounded-full bg-[#E0A82E] py-2.5 font-extrabold text-black">
            CREATE ID
          </button>
        </div>
      )}

      {/* miglife only, like the app: new level curve, Security Question Reset, 🎰 Luxury Bet. */}
      {f.isMigwith && tool === "achievements" && <FounderAchievementsCard />}
      {f.isMigwith && tool === "vip" && <FounderSpecialColorCard />}
      {f.isMigwith && tool === "app_link" && <AppDownloadLinkCard />}
      {f.isMigwith && tool === "level" && <LevelCurveCard />}
      {f.isMigwith && tool === "security" && <SecurityQuestionResetCard />}
      {f.isMigwith && tool === "privacy" && <PrivateEmailsCard />}
      {f.isMigwith && tool === "luxury_bet" && (
        <>
          <LuxuryBetAccessCard />
          <LuxuryBetLevelCard />
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
          {ALL_COUNTRIES.map((c) => (
            <option key={c.iso} value={c.name}>
              {countryFlag(c.iso)}  {c.name}
            </option>
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
