"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { collection, doc, getDocs, limit, onSnapshot, query, serverTimestamp, setDoc, where, type DocumentData } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useSession } from "../_components/AppSession";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle, PastelCard, SectionLabel } from "../_components/LightCards";
import { isMainFounderName } from "../../lib/founder";
import { CountryPickerDialog } from "../_components/CountryPicker";
import { countryFlag, countryInfoFor, countryWithFlag } from "../../lib/countries";

// Explore › Members, same categories and role checks as the app (MainActivity.kt).
// The founder (migwith) adds / removes Management members and Mentors here,
// through the changeManagementRole function like the app.

type Coins = { amount?: number; ok?: boolean; already?: boolean; error?: string } | null;
const changeManagementRole = httpsCallable<{ targetUid: string; role: string; operationId: string }, { coins?: Coins }>(
  functions,
  "changeManagementRole"
);
const setRepCountry = httpsCallable<{ targetUid: string; country: string }, { ok?: boolean }>(functions, "setRepCountry");
// Founder: renew a mentor's 30-day term (+30 days from the current end).
const renewMentorship = httpsCallable<{ targetUid: string }, { ok?: boolean; mentorUntil?: number; coins?: Coins }>(functions, "renewMentorship");
// " · 💰 5,000 coins sent" after an Add / Renew (or why not).
const coinsNote = (c?: Coins) =>
  !c || !c.amount ? "" : c.ok ? ` · 💰 ${c.amount.toLocaleString()} coins sent` : c.error === "low-balance" ? " · ⚠️ coins NOT sent (your balance is too low)" : c.already ? "" : " · ⚠️ coins NOT sent";

// 💰 miglife: how many coins a Mentor gets when added / renewed (paid from
// miglife's balance by the server). app_settings/mentor_coin_grant.
function MentorCoinsSetting() {
  const [add, setAdd] = useState("");
  const [renew, setRenew] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "mentor_coin_grant"),
        (s) => {
          setAdd(Number(s.get("addAmount")) > 0 ? String(s.get("addAmount")) : "");
          setRenew(Number(s.get("renewAmount")) > 0 ? String(s.get("renewAmount")) : "");
        },
        () => {}
      ),
    []
  );
  const save = async () => {
    setSaving(true);
    setMsg("");
    try {
      await setDoc(doc(db, "app_settings", "mentor_coin_grant"), {
        addAmount: Math.floor(Number(add) || 0),
        renewAmount: Math.floor(Number(renew) || 0),
        updatedAt: serverTimestamp(),
      });
      setMsg("✅ Saved");
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };
  const box = (label: string, v: string, set: (x: string) => void) => (
    <label className="flex min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-[#FFD54F66] bg-black/15 px-2.5 py-2">
      <span className="shrink-0 text-[11px] font-bold text-[#FFD54F]">{label}</span>
      <input
        inputMode="numeric"
        value={v}
        placeholder="0"
        onChange={(e) => set(e.target.value.replace(/[^\d]/g, "").slice(0, 9))}
        className="min-w-0 flex-1 bg-transparent text-[15px] font-bold text-white outline-none placeholder:text-white/40"
      />
    </label>
  );
  return (
    <div className="mt-2.5 border-t border-white/15 pt-2.5">
      <p className="text-[12px] font-bold text-[#FFD54F]">💰 COINS TO THE MENTOR (from your balance)</p>
      <div className="mt-1.5 flex gap-1.5">
        {box("Add", add, setAdd)}
        {box("Renew", renew, setRenew)}
        <button type="button" disabled={saving} onClick={save} className="shrink-0 rounded-full bg-[#FFD54F] px-4 text-sm font-extrabold text-black disabled:opacity-50">
          {saving ? "…" : "SAVE"}
        </button>
      </div>
      <p className="mt-1 text-[11px] text-white/60">{msg || "Sent automatically on ADD / RENEW. 0 = no coins."}</p>
    </div>
  );
}

// 💬 A member's status message, one line.
function StatusLine({ text, light = false }: { text: string; light?: boolean }) {
  return (
    <span className={`mt-0.5 block truncate text-[12px] italic ${light ? "text-[#38517F]" : "text-[#CBD5E8]"}`} data-notranslate>
      💬 {text}
    </span>
  );
}

// 🧑‍🏫 Mentorship term line: end date + days left (like the app).
function MentorTermLine({ untilMs, light = false }: { untilMs: number; light?: boolean }) {
  if (untilMs <= 0)
    return <span className={`block text-[11px] ${light ? "text-[#38517F]" : "text-[#CBD5E8]"}`}>⏳ 30-day term starts at the next daily check</span>;
  const daysLeft = Math.ceil((untilMs - Date.now()) / 86_400_000);
  const date = new Date(untilMs).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
  const color = daysLeft <= 0 ? (light ? "#D32F2F" : "#FF6F7D") : daysLeft <= 5 ? (light ? "#B86D00" : "#FFB74D") : light ? "#00984A" : "#7CFFB2";
  return (
    <span className="block text-[11px] font-bold" style={{ color }}>
      {daysLeft <= 0 ? `⛔ Expired ${date} · renew now` : `⏳ Renew by ${date} · ${daysLeft} day${daysLeft > 1 ? "s" : ""} left`}
    </span>
  );
}
// 🎨 Readable cards (like the app): a DARK role colour (Merchant purple, Mentor
// red, Executive blue) on the navy card was hard to read → those lists get a
// light card; bright colours (Admin gold, Staff green, Elite cyan …) keep navy.
function isDarkAccent(hex: string): boolean {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.45;
}

const MANAGED = new Set(["executive_board", "admin", "country_representative", "staff", "elite_user", "mentor"]);
const PROTECTED = new Set(["ceo", "owner", "superadmin"]);

type Category = { id: string; icon: string; title: string; subtitle: string; color: string; roles: string[] };

const MANAGEMENT: Category[] = [
  { id: "executive_board", icon: "🏅", title: "Executive Board", subtitle: "FOUNDER • Owner • Executive", color: "#3F55C7", roles: ["executive_board", "executive", "owner", "ceo"] },
  { id: "admin", icon: "🛡", title: "Admin", subtitle: "Admin IDs", color: "#E0A800", roles: ["admin", "administrator", "superadmin"] },
  { id: "country_representative", icon: "🌍", title: "Country Representative", subtitle: "Country representatives", color: "#B58A70", roles: ["country_representative", "countryrep", "country_rep"] },
  { id: "staff", icon: "🪪", title: "Staff", subtitle: "Staff IDs", color: "#22A447", roles: ["staff"] },
  { id: "elite_user", icon: "🛡", title: "Elite User", subtitle: "Elite members", color: "#12AFC7", roles: ["elite_user", "elite"] },
];
const COMMUNITY: Category[] = [
  { id: "mentor", icon: "💼", title: "Mentor", subtitle: "Mentors", color: "#E12A2A", roles: ["mentor"] },
  { id: "merchant", icon: "🏪", title: "Merchant", subtitle: "Verified merchants", color: "#7B1FB8", roles: ["merchant"] },
  { id: "top", icon: "🏆", title: "Top Level Users", subtitle: "Highest level users", color: "#E0B000", roles: [] },
];

// Name colours on the dark rows (the app's accents).
const NAME_COLORS: Record<string, string> = {
  executive_board: "#8FA2FF",
  admin: "#FFD54F",
  country_representative: "#E0B89A",
  staff: "#39FF14",
  elite_user: "#00FFFF",
  mentor: "#FF4D4D",
  merchant: "#C77DFF",
  top: "#FFD54F",
};

type Member = { uid: string; name: string; photo: string; level: number; country: string; roles: string[]; mentorUntilMs: number; repCountry: string; status: string };

const norm = (v: string) => v.trim().toLowerCase().replace(/[-\s]/g, "_");

function toMember(uid: string, d: DocumentData): Member {
  const roles = [
    ...(Array.isArray(d.roles) ? d.roles.map((r: unknown) => norm(String(r))) : []),
    ...[d.role, d.memberType].filter((r) => typeof r === "string" && r.trim()).map((r) => norm(r)),
  ];
  return {
    uid,
    name: String(d.username || ""),
    photo: String(d.photoUrl || d.profilePic || d.avatarUrl || d.imageUrl || "").trim(),
    level: Number(d.level || 1),
    country: String(d.country || ""),
    roles,
    repCountry: String(d.repCountry || "").trim(),
    status: String(d.statusMessage || "").trim(),
    mentorUntilMs:
      d.mentorUntil && typeof d.mentorUntil.toMillis === "function" ? d.mentorUntil.toMillis() : Number(d.mentorUntil || 0) || 0,
  };
}

export default function MembersPage() {
  const ready = useRequireLogin();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [selected, setSelected] = useState<Category | null>(null);
  const { user, username } = useSession();
  const isFounder = isMainFounderName(username);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reload, setReload] = useState(0);
  // 🌍 miGlife picks which country a Country Representative represents
  const [countryPickFor, setCountryPickFor] = useState<Member | null>(null);

  useEffect(() => {
    if (!ready) return;
    Promise.all([
      getDocs(query(collection(db, "users"), limit(500))),
      // 🏪 a Merchant with another role too (Country Representative …) is still
      // listed under Merchant while their Merchant Program record runs
      getDocs(collection(db, "mentor_merchants")).catch(() => null),
    ])
      .then(([snap, links]) => {
        const now = Date.now();
        const activeMerchants = new Set(
          (links?.docs || [])
            .filter((l) => (l.get("expiresAt")?.toMillis?.() || 0) > now)
            .map((l) => String(l.get("merchantUsername") || "").trim().toLowerCase())
        );
        setMembers(
          snap.docs
            .map((d) => toMember(d.id, d.data()))
            .filter((m) => m.name)
            .map((m) => (activeMerchants.has(m.name.toLowerCase()) && !m.roles.includes("merchant") ? { ...m, roles: [...m.roles, "merchant"] } : m))
        );
      })
      .catch(() => setMembers([]));
  }, [ready, reload]);

  // Username, MIG ID or UID → the user.
  const findTarget = async (input: string): Promise<Member | null> => {
    const v = input.trim();
    if (!v) return null;
    for (const field of ["username", "migId"]) {
      const snap = await getDocs(query(collection(db, "users"), where(field, "==", v), limit(1))).catch(() => null);
      const d = snap?.docs[0];
      if (d) return toMember(d.id, d.data());
    }
    const lower = v.toLowerCase();
    return (members || []).find((m) => m.name.toLowerCase() === lower || m.uid.toLowerCase() === lower) || null;
  };

  const change = async (input: string, add: boolean) => {
    if (!selected || !isFounder || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const m = await findTarget(input);
      if (!m) throw new Error("User not found. Enter Username, MIG ID or UID.");
      if (m.uid === user?.uid) throw new Error("You cannot change your own management role.");
      if (m.roles.some((r) => PROTECTED.has(r))) throw new Error("FOUNDER account cannot be changed here.");
      const res = await changeManagementRole({ targetUid: m.uid, role: add ? selected.id : "user", operationId: crypto.randomUUID() });
      setMessage(`${selected.title} ${add ? "added" : "removed"}: ${m.name}${coinsNote(res.data?.coins)}`);
      setTarget("");
      setReload((n) => n + 1);
    } catch (e: any) {
      const text = String(e?.message || "");
      setMessage(text.startsWith("User not found") || text.startsWith("You cannot") || text.startsWith("FOUNDER") ? text : `Could not update member: ${text}`);
    } finally {
      setBusy(false);
    }
  };
  const canManage = isFounder && !!selected && MANAGED.has(selected.id);

  const list = useMemo(() => {
    if (!selected || !members) return [];
    if (selected.id === "top") return [...members].sort((a, b) => b.level - a.level).slice(0, 100);
    return members
      .filter((m) => m.roles.some((r) => selected.roles.includes(r)))
      .sort((a, b) => b.level - a.level);
  }, [selected, members]);
  const lightCard = !!selected && isDarkAccent(selected.color);

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-8 sm:px-6">
        {selected ? (
          <>
            <PageTitle title={selected.title} subtitle={selected.subtitle} icon={selected.icon} />
            {canManage && (
              <div className="mb-2.5 rounded-2xl border bg-[#304477] p-2.5 text-white" style={{ borderColor: NAME_COLORS[selected.id] }}>
                <p className="flex items-center gap-1.5 text-sm font-bold text-[#FFD54F]">
                  👑 FOUNDER MANAGEMENT
                  <span className="ml-auto text-[13px]" style={{ color: NAME_COLORS[selected.id] }}>
                    ADD
                  </span>
                </p>
                <div className="mt-2 flex gap-1.5">
                  <input
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder="Username / MIG ID / UID"
                    className="min-w-0 flex-1 rounded-xl border bg-transparent px-3 py-2.5 text-base text-white outline-none placeholder:text-white/60"
                    style={{ borderColor: NAME_COLORS[selected.id] }}
                  />
                  <button
                    type="button"
                    disabled={busy || !target.trim()}
                    onClick={() => change(target, true)}
                    className="rounded-full bg-[#39FF14] px-5 text-sm font-extrabold text-black disabled:opacity-50"
                  >
                    ADD
                  </button>
                </div>
                {message && (
                  <p className={`mt-1.5 text-xs ${/^(Could not|User not found|You cannot|FOUNDER)/.test(message) ? "text-[#FF7B8A]" : "text-[#7CFFB2]"}`}>
                    {message}
                  </p>
                )}
                {selected.id === "mentor" && <MentorCoinsSetting />}
              </div>
            )}
            {members === null ? (
              <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading…</p>
            ) : list.length === 0 ? (
              <p className="py-10 text-center text-sm text-[#5B6B8C]">No members yet.</p>
            ) : (
              <ul className="grid gap-2 md:grid-cols-2">
                {list.map((m, i) => (
                  <li key={m.uid}>
                    <Link
                      href={`/profile/${encodeURIComponent(m.name)}`}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 shadow-md hover:brightness-110 ${
                        lightCard ? "" : "border-[#3A3570] bg-gradient-to-r from-[#17163A] to-[#2B2656]"
                      }`}
                      style={
                        lightCard
                          ? { borderColor: `${selected.color}55`, background: `linear-gradient(90deg, #FFFFFF, #F6F2FB, ${selected.color}1A)` }
                          : undefined
                      }
                    >
                      {selected.id === "top" && <span className="w-6 text-center text-sm font-black text-[#D9A400]">{i + 1}</span>}
                      <span
                        className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full font-black ${lightCard ? "" : "bg-white/10 text-white"}`}
                        style={lightCard ? { background: `${selected.color}1F`, color: selected.color } : undefined}
                      >
                        {m.photo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={m.photo} alt="" className="h-full w-full object-cover" />
                        ) : (
                          m.name.slice(0, 1).toUpperCase()
                        )}
                      </span>
                      <span data-notranslate className="min-w-0 flex-1">
                        <span className="block truncate font-bold" style={{ color: lightCard ? selected.color : NAME_COLORS[selected.id] || selected.color }}>
                          {m.name}
                        </span>
                        <span className={`block truncate text-xs ${lightCard ? "text-[#38517F]" : "text-white/70"}`}>
                          {[`Level ${m.level}`, m.country].filter(Boolean).join(" · ")}
                        </span>
                        {/* the term is for miGlife; everyone else sees the mentor's status (if any) */}
                        {selected.id === "mentor" &&
                          (isFounder ? (
                            <MentorTermLine untilMs={m.mentorUntilMs} light={lightCard} />
                          ) : (
                            m.status && <StatusLine text={m.status} light={lightCard} />
                          ))}
                      </span>
                      {selected.id === "country_representative" &&
                        (m.repCountry || canManage) &&
                        (() => {
                          const info = countryInfoFor(m.repCountry);
                          const accent = NAME_COLORS[selected.id] || selected.color;
                          return (
                            <button
                              type="button"
                              disabled={!canManage || busy}
                              onClick={(e) => {
                                e.preventDefault();
                                setCountryPickFor(m);
                              }}
                              className="flex max-w-[150px] shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-[7px] text-[13px] font-bold disabled:cursor-default"
                              style={{ background: `${accent}24`, borderColor: `${accent}8C`, color: m.repCountry ? "#fff" : "#CBD5E8" }}
                            >
                              <span className="text-lg leading-none">{info ? countryFlag(info.iso) : "🌍"}</span>
                              <span className="truncate">{info?.name || m.repCountry || "Set country"}</span>
                              {canManage && <span style={{ color: accent }}>▾</span>}
                            </button>
                          );
                        })()}
                      {canManage && selected.id === "mentor" && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            if (busy) return;
                            setBusy(true);
                            renewMentorship({ targetUid: m.uid })
                              .then((res) => {
                                setMessage(`Mentorship renewed: ${m.name} (+30 days)${coinsNote(res.data?.coins)}`);
                                setReload((n) => n + 1);
                              })
                              .catch((err) => setMessage(`Could not renew: ${err?.message || ""}`))
                              .finally(() => setBusy(false));
                          }}
                          className={`px-1 text-xs font-bold ${lightCard ? "text-[#00984A]" : "text-[#7CFFB2]"}`}
                        >
                          RENEW
                        </button>
                      )}
                      {canManage ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={(e) => {
                            e.preventDefault();
                            change(m.uid, false);
                          }}
                          className={`px-2 text-xs font-bold ${lightCard ? "text-[#D32F2F]" : "text-[#FF6F7D]"}`}
                        >
                          REMOVE
                        </button>
                      ) : (
                        <span className={lightCard ? "text-[#8A97A8]" : "text-white/50"}>›</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {canManage && (
              <p className="mt-2 px-1 text-xs text-[#35507E]">Only the FOUNDER can add or remove {selected.title} members.</p>
            )}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="mt-4 w-full rounded-2xl bg-white py-3 text-sm font-bold text-[#2F80ED] shadow-sm"
            >
              ← All categories
            </button>
          </>
        ) : (
          <>
            <PageTitle title="Community" subtitle="Discover · Community" />
            <SectionLabel>Management</SectionLabel>
            <div className="grid gap-2.5 md:grid-cols-2">
              {MANAGEMENT.map((c) => (
                <PastelCard key={c.id} icon={c.icon} title={c.title} subtitle={c.subtitle} color={c.color} onClick={() => setSelected(c)} />
              ))}
            </div>
            <SectionLabel>Community</SectionLabel>
            <div className="grid gap-2.5 md:grid-cols-2">
              {COMMUNITY.map((c) => (
                <PastelCard key={c.id} icon={c.icon} title={c.title} subtitle={c.subtitle} color={c.color} onClick={() => setSelected(c)} />
              ))}
            </div>
          </>
        )}
      </section>
      {countryPickFor && (
        <CountryPickerDialog
          selected={countryPickFor.repCountry}
          onClose={() => setCountryPickFor(null)}
          onPick={(picked) => {
            const rep = countryPickFor;
            setCountryPickFor(null);
            setBusy(true);
            setRepCountry({ targetUid: rep.uid, country: picked })
              .then(() => {
                setMessage(`Country set: ${rep.name} → ${countryWithFlag(picked)}`);
                setReload((n) => n + 1);
              })
              .catch((e) => setMessage(`Could not set country: ${e?.message || ""}`))
              .finally(() => setBusy(false));
          }}
        />
      )}
    </PageShell>
  );
}
