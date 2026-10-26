"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useFounderPerms } from "../../lib/founder";
import { countryWithFlag } from "../../lib/countries";
import { CountryPickerDialog } from "../_components/CountryPicker";
import { OFFICIAL_COUNTRY_ROOMS } from "../../lib/rooms";
import { winFxKey } from "../../lib/cricketWinFx";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { FounderShell, input } from "./_Shell";
import {
  AppDownloadLinkCard,
  FounderSpecialColorCard,
  LevelCurveCard,
  SecurityQuestionResetCard,
  PrivateEmailsCard,
  TransferLimitsCard,
} from "./_MainFounderCards";
import { LuxuryBetAuditCard, LuxuryBetControlCard } from "./_LuxuryBetTools";
import { AccountDeleteCard } from "./_AccountDeleteCard";
import { DailyGameRewardsCard } from "./_DailyGameRewardsCard";
import { FounderAchievementsCard } from "../_components/Achievements";

// "miglife secret", the app's BlogPage: the founder tools, the "other users
// ID creation" switch and FOUNDER CREATE ID.

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
const ceoCreateUserId = httpsCallable<Record<string, string>, { username?: string }>(functions, "ceoCreateUserId");
const ceoQuickCreateId = httpsCallable<{ migId: string }, { username?: string }>(functions, "ceoQuickCreateId");

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

// 🎆 Cricket Win Effect (the app's FounderCricketWinFxCard): the Cricket win
// fireworks play ONLY in the rooms switched ON here. The list lives in
// app_settings/win_fx.cricketRooms; the server writes "CONGRATULATIONS"
// (fireworks) in those rooms and "Congratulations" (no fireworks) elsewhere.
function CricketWinFxCard() {
  const { username } = useCurrentUser();
  const [rooms, setRooms] = useState<string[] | null>(null);
  const [allRooms, setAllRooms] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "win_fx"),
        (s) => {
          const list = s.get("cricketRooms");
          setRooms(Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && !!x.trim()) : []);
        },
        () => setRooms([])
      ),
    []
  );
  useEffect(() => {
    getDocs(collection(db, "rooms"))
      .then((snap) => setAllRooms(snap.docs.map((d) => String(d.get("name") || d.id).trim()).filter(Boolean)))
      .catch(() => {});
  }, []);
  const on = new Set((rooms || []).map(winFxKey));
  const isOn = (r: string) => on.has(winFxKey(r));
  const change = async (room: string, turnOn: boolean) => {
    const name = room.trim();
    if (!name) return;
    setBusy(true);
    setNote(null);
    // Stored like the app: lowercase names, sorted.
    const next = new Set((rooms || []).map(winFxKey));
    if (turnOn) next.add(winFxKey(name));
    else next.delete(winFxKey(name));
    try {
      await setDoc(doc(db, "app_settings", "win_fx"), {
        cricketRooms: [...next].sort(),
        updatedAt: serverTimestamp(),
        updatedBy: username || "miglife",
      });
      setNote({ text: turnOn ? `✅ ON in "${name}"` : `⛔ OFF in "${name}"`, bad: false });
      if (turnOn) setQ("");
    } catch (e: any) {
      setNote({ text: `Failed: ${e?.message || e}`, bad: true });
    } finally {
      setBusy(false);
    }
  };
  const query = q.trim().toLowerCase();
  const seen = new Set<string>();
  const pool = [...OFFICIAL_COUNTRY_ROOMS, ...allRooms, ...(rooms || [])].filter((r) => {
    const k = winFxKey(r);
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const known = (
    query
      ? pool.filter((r) => r.toLowerCase().includes(query)).sort((a, b) => Number(!a.toLowerCase().startsWith(query)) - Number(!b.toLowerCase().startsWith(query)) || a.localeCompare(b))
      : pool.sort((a, b) => Number(!isOn(a)) - Number(!isOn(b)) || a.toLowerCase().localeCompare(b.toLowerCase()))
  ).slice(0, 60);
  return (
    <div className="space-y-2.5 rounded-[18px] border-[1.5px] border-[#FF6F00] bg-white p-4">
      <p className="text-[17px] font-extrabold">🎆 Cricket Win Effect</p>
      <p className="text-xs text-gray-500">
        When someone wins Cricket, the whole room gets fireworks — but ONLY in the rooms switched ON here. Every other room shows no effect.
      </p>
      <div className="flex items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value.slice(0, 60))} placeholder="🔎 Search room" className={`${input} flex-1`} />
        <button
          type="button"
          disabled={busy || !q.trim()}
          onClick={() => change(q, true)}
          className="rounded-full bg-[#FF6F00] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
        >
          ON
        </button>
      </div>
      {note && <p className={`text-xs font-bold ${note.bad ? "text-[#E5484D]" : "text-[#2E7D32]"}`}>{note.text}</p>}
      <p className="text-xs text-gray-500">{rooms === null ? "Loading…" : `ON in ${on.size} room${on.size === 1 ? "" : "s"}`}</p>
      {query && known.length === 0 && (
        <p className="text-xs text-gray-500">No room found with &quot;{q.trim()}&quot; — tap ON to switch it on by this exact name.</p>
      )}
      <div className="space-y-1">
        {known.map((room) => {
          const lit = isOn(room);
          return (
            <div key={room} className={`flex items-center gap-2 rounded-xl px-2.5 py-1 ${lit ? "bg-[#FF6F00]/15" : ""}`}>
              <span className="text-base">{lit ? "🎆" : "▫"}</span>
              <span className={`min-w-0 flex-1 truncate text-sm ${lit ? "font-bold" : ""}`}>{room}</span>
              <Switch on={lit} onChange={(v) => !busy && change(room, v)} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SecretPage() {
  const f = useFounderPerms();
  const [idOn, setIdOn] = useState(false);
  const [status, setStatus] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  // 🧰 Which Founder Tool is open (null = the tools list).
  const [tool, setTool] = useState<string | null>(null);

  useEffect(() => {
    if (!f.isAnyFounder) return;
    return onSnapshot(doc(db, "app_settings", "id_creation"), (s) => setIdOn(s.get("otherUserCreationEnabled") === true), () => {});
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
          { icon: "⭐", label: "Level Curve", hint: "New level curve (after Lv.50)", tint: "#F2B705", key: "level", ok: f.isMigwith },
          { icon: "🔐", label: "Security Question Reset", hint: "Remove an ID's security question", tint: "#6A4BD8", key: "security", ok: f.isMigwith },
          { icon: "✉", label: "Change Email", hint: "Change an ID's email", tint: "#2E86DE", href: "/secret/email", ok: f.can("change_email") },
          { icon: "⚡", label: "Quick Create ID", hint: "Type only the ID name → Create", tint: "#F59E0B", key: "quick_id", ok: f.isMigwith },
          { icon: "👑", label: "Founder Create ID", hint: "Create a MIG ID yourself", tint: "#D4A017", key: "create_id", ok: f.isMigwith },
          { icon: "🆔", label: "Other Users ID Creation", hint: "Let normal users create IDs (ON/OFF)", tint: "#E53935", key: "id_creation", ok: f.isMigwith },
        ],
      ],
      [
        "🛡 Safety & Rooms",
        [
          { icon: "🔐", label: "Share Permissions", hint: "Who can share pictures / voice / video", tint: "#00897B", href: "/secret/share", ok: f.can("share_permissions") },
          { icon: "ℹ", label: "Room Info", hint: "Room details & settings", tint: "#3949AB", href: "/secret/rooms", ok: f.can("room_info") },
          { icon: "🌐", label: "IP Monitor / IP Ban", hint: "See IPs, ban an IP", tint: "#546E7A", href: "/secret/ip", ok: f.can("ip_monitor") },
          { icon: "🚩", label: "Reports", hint: "What users reported · handle within 24h", tint: "#D93025", href: "/secret/reports", ok: f.can("reports") },
          { icon: "📣", label: "Push Notifications", hint: "Notify everyone · now, once or every day", tint: "#F57C00", href: "/secret/push", ok: f.isMigwith },
          { icon: "🎤", label: "Profile Songs", hint: "Upload any song (up to 5 min) for the shop", tint: "#8B4DFF", href: "/secret/songs", ok: f.isMigwith },
        ],
      ],
      [
        "💰 Coins & Shop",
        [
          { icon: "💰", label: "Coin Control", hint: "Add or remove coins", tint: "#2E7D32", href: "/secret/coins", ok: f.can("coin_control") },
          { icon: "🎚", label: "Transfer Limits", hint: "Daily limit per role · Merchant accept", tint: "#00897B", key: "transfer_limits", ok: f.isMigwith },
          { icon: "🎁", label: "Gift Gallery", hint: "Add / edit / delete gifts", tint: "#E91E63", href: "/gifts", ok: f.can("gift_shop") },
          { icon: "👑", label: "VIP Subscription", hint: "Approve payments · ON/OFF · rate", tint: "#AB47BC", key: "vip", ok: f.isMigwith },
          { icon: "🏅", label: "Achievements & Badges", hint: "Recount badges · event badges", tint: "#FF8F00", key: "achievements", ok: f.isMigwith },
          { icon: "📲", label: "App Download Link", hint: "Android app download link", tint: "#1E88E5", key: "app_link", ok: f.isMigwith },
        ],
      ],
      [
        "🎮 Games",
        [
          { icon: "🎰", label: "Luxury Bet", hint: "Level · Schedule", tint: "#8E24AA", key: "luxury_bet", ok: f.isMigwith },
          { icon: "🔍", label: "Payout Check", hint: "Luxury Bet wins re-checked · big wins · top winners", tint: "#D4AF37", key: "lb_audit", ok: f.isMigwith },
          // (🎲 Luxury Bot Tiers removed — Luxury Bot Official is gone; Luxury Bet replaced it)
          { icon: "🎆", label: "Cricket Win Effect", hint: "Fireworks ON / OFF for each room", tint: "#FF6F00", key: "cricket_winfx", ok: f.isMigwith },
          { icon: "🏆", label: "Daily Game Rewards", hint: "Luxury Top 10 · LowCard & Cricket Top 3 · paid at 12 am", tint: "#D4AF37", key: "daily_rewards", ok: f.isMigwith },
        ],
      ],
      [
        "⚠ Danger zone",
        [
          { icon: "🔒", label: "Private Emails", hint: "Hide everyone's email & push token (one-time move)", tint: "#37474F", key: "privacy", ok: f.isMigwith },
          { icon: "🗑", label: "Delete Account", hint: "For a “Delete my account” email · deleted after 7 days", tint: "#E53935", key: "delete_account", ok: f.isMigwith },
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
      title={openTool ? `${openTool.icon} ${openTool.label}` : "miGlife secret"}
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
            <div key={groupTitle} className="space-y-2">
              <p className="pl-0.5 pt-2 text-[11px] font-bold uppercase tracking-[1px] text-[#5B6B8C]">{groupTitle}</p>
              {list.map((t) => {
                const body = (
                  <>
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[13px] border text-[18px]"
                      style={{ background: `linear-gradient(135deg, ${t.tint}3D, ${t.tint}12)`, borderColor: `${t.tint}4D` }}
                    >
                      {t.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-bold text-[#0B2A5B]">{t.label}</span>
                      <span className="block truncate text-[11px] text-[#5B6B8C]">{t.hint}</span>
                    </span>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-lg font-bold" style={{ background: `${t.tint}24`, color: t.tint }}>
                      ›
                    </span>
                  </>
                );
                // 🎨 the Community page's card: white → the tool's colour
                const cls = "flex w-full items-center gap-3 rounded-[18px] border px-2.5 py-2.5 text-left transition hover:brightness-[.98]";
                const style = { borderColor: `${t.tint}38`, background: `linear-gradient(90deg, #FFFFFF, #FFFFFF, ${t.tint}1A)`, boxShadow: `0 3px 10px ${t.tint}1F` };
                return t.href ? (
                  <Link key={t.label} href={t.href} className={cls} style={style}>
                    {body}
                  </Link>
                ) : (
                  <button key={t.label} type="button" onClick={() => setTool(t.key!)} className={cls} style={style}>
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
      {f.isMigwith && tool === "quick_id" && <QuickCreateIdCard />}
      {f.isMigwith && tool === "achievements" && <FounderAchievementsCard />}
      {f.isMigwith && tool === "vip" && <FounderSpecialColorCard />}
      {f.isMigwith && tool === "app_link" && <AppDownloadLinkCard />}
      {f.isMigwith && tool === "level" && <LevelCurveCard />}
      {f.isMigwith && tool === "cricket_winfx" && <CricketWinFxCard />}
      {f.isMigwith && tool === "security" && <SecurityQuestionResetCard />}
      {f.isMigwith && tool === "privacy" && <PrivateEmailsCard />}
      {f.isMigwith && tool === "luxury_bet" && <LuxuryBetControlCard />}
      {f.isMigwith && tool === "lb_audit" && <LuxuryBetAuditCard />}
      {f.isMigwith && tool === "daily_rewards" && <DailyGameRewardsCard />}
      {f.isMigwith && tool === "transfer_limits" && <TransferLimitsCard />}
      {f.isMigwith && tool === "delete_account" && <AccountDeleteCard />}

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

// ⚡ Quick Create: miglife types only the MIG ID. The email and password are set
// on the server (functions/.env QUICK_ID_EMAIL / QUICK_ID_PASSWORD) — never here.
function QuickCreateIdCard() {
  const [migId, setMigId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [made, setMade] = useState<string[]>([]);
  const create = async () => {
    const id = migId.trim();
    setError("");
    if (!/^(?=.*[A-Za-z])[A-Za-z0-9._-]{1,27}$/.test(id))
      return setError("1-27 characters, at least 1 English letter. Allowed: A-Z a-z 0-9 . _ -");
    setBusy(true);
    try {
      const { data } = await ceoQuickCreateId({ migId: id });
      setMade((m) => [data?.username || id, ...m]);
      setMigId("");
    } catch (e: any) {
      setError(e?.message || "Could not create the ID.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3 rounded-[22px] border border-[#F59E0B] bg-white p-4 shadow-md">
      <div>
        <p className="text-lg font-extrabold">⚡ Quick Create ID</p>
        <p className="text-xs text-[#5B6B8C]">Type the ID name and tap Create — the email &amp; password are filled in by the server.</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="flex gap-2"
      >
        <input
          value={migId}
          onChange={(e) => setMigId(e.target.value.replace(/\s/g, ""))}
          placeholder="ID name"
          autoCapitalize="none"
          autoCorrect="off"
          disabled={busy}
          className="min-w-0 flex-1 rounded-xl border border-[#E3EAF5] bg-[#F7FAFE] px-3.5 py-2.5 text-[15px] font-semibold outline-none focus:border-[#F59E0B]"
        />
        <button type="submit" disabled={busy || !migId.trim()} className="shrink-0 rounded-xl bg-gradient-to-r from-[#F59E0B] to-[#D97706] px-5 font-extrabold text-white disabled:opacity-50">
          {busy ? "…" : "Create"}
        </button>
      </form>
      {error && <p className="text-xs font-bold text-[#B3261E]">{error}</p>}
      {made.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-bold uppercase tracking-[1px] text-[#5B6B8C]">Created now</p>
          {made.map((n) => (
            <p key={n} className="flex items-center gap-2 rounded-xl bg-[#E8F7EE] px-3 py-2 text-sm font-bold text-[#0A7A3A]">
              ✅ <span data-notranslate>{n}</span>
            </p>
          ))}
        </div>
      )}
    </div>
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
  const [countryOpen, setCountryOpen] = useState(false);
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
        {/* 🌍 the searchable country picker (type "phi", "uae", "usa" …) */}
        <button type="button" disabled={busy} onClick={() => setCountryOpen(true)} className={`${input} flex items-center justify-between text-left`}>
          <span className={country ? "" : "text-gray-400"}>{country ? countryWithFlag(country) : "Select country"}</span>
          <span className="text-gray-400">▾</span>
        </button>
        {countryOpen && (
          <CountryPickerDialog
            selected={country}
            onPick={(name) => {
              setCountry(name);
              setCountryOpen(false);
            }}
            onClose={() => setCountryOpen(false)}
          />
        )}
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
