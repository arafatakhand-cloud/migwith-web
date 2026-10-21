"use client";

import { countryFlag, countryInfoFor } from "../../lib/countries";
import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { MerchantDashboard } from "./MerchantDashboard";
import { MentorIdCard } from "./MentorIdCard";
import { isMainFounderName } from "../../lib/founder";
import { Face, profileImageUrl } from "../_components/RankFace";

// Explore › miGlife Partner (Merchant Program), same documents as the app's MentorProgramPage:
// a normal user picks a mentor and sends a mentor_requests entry; an active
// mentor_merchants record opens the Merchant Dashboard; mentors get a link to
// the Mentor Dashboard (/mentor).

type Mentor = { username: string; level: number; country: string; status: string; photo: string; merchants: number; pending: number };

const toMs = (v: any) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);

// 🎨 mentor card colours, one after another
const MENTOR_COLORS = ["#7B3FC7", "#12AFC7", "#E0457B", "#22A447", "#3F55C7", "#FF6F00", "#E0A800"];

const card = "rounded-3xl bg-[#0B1F3A] p-6 text-center text-white shadow-lg";

export default function MerchantPage() {
  const ready = useRequireLogin();
  const { user, username } = useSession();
  const [loaded, setLoaded] = useState(false);
  const [isMentor, setIsMentor] = useState(false);
  const [level, setLevel] = useState(1);
  const [pending, setPending] = useState<DocumentSnapshot | null>(null);
  const [merchant, setMerchant] = useState<DocumentSnapshot | null>(null);
  // The account's role says "merchant" (role / membershipRole / memberType).
  const [isMerchantRole, setIsMerchantRole] = useState(false);
  const [step, setStep] = useState<"INTRO" | "PICK">("INTRO");
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [selected, setSelected] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const uid = user?.uid;
  useEffect(() => {
    if (!uid || !username) return;
    (async () => {
      try {
        const me = await getDoc(doc(db, "users", uid));
        const role = String(me.get("role") || "").trim().toLowerCase();
        setLevel(Number(me.get("level") || 1));
        const mentor = role === "mentor" || isMainFounderName(username);
        setIsMentor(mentor);
        // A role can be saved in role, membershipRole or memberType (older tools).
        const roles = [
          ...["role", "membershipRole", "memberType"].map((f) => String(me.get(f) || "").trim().toLowerCase()),
          // a Merchant who also has another role keeps "merchant" in the roles list
          ...(Array.isArray(me.get("roles")) ? me.get("roles").map((r: unknown) => String(r).trim().toLowerCase()) : []),
        ];
        const merchantRole = !mentor && roles.includes("merchant");
        setIsMerchantRole(merchantRole);
        if (!mentor) {
          const [req, merch] = await Promise.all([
            getDocs(query(collection(db, "mentor_requests"), where("fromUsername", "==", username), where("status", "==", "pending"), limit(1))),
            getDocs(query(collection(db, "mentor_merchants"), where("merchantUsername", "==", username))),
          ]);
          setPending(req.docs[0] || null);
          // A running record = a Merchant, whatever other role they also have.
          const active = merch.docs.find((m) => toMs(m.get("expiresAt")) > Date.now()) || null;
          // A merchant by role still opens the dashboard with the newest record,
          // even if it ran out or is missing its date.
          const latest = [...merch.docs].sort((a, b) => toMs(b.get("expiresAt")) - toMs(a.get("expiresAt")))[0] || null;
          setMerchant(active || (merchantRole ? latest : null));
        }
      } catch (e: any) {
        setError(e?.message || "Could not load miGlife Partner.");
      } finally {
        setLoaded(true);
      }
    })();
  }, [uid, username]);

  // Mentors with how many merchants and pending requests each has ("in" takes 10 at a time here).
  useEffect(() => {
    if (step !== "PICK" || mentors) return;
    (async () => {
      const snap = await getDocs(query(collection(db, "users"), where("role", "==", "mentor"), limit(30)));
      const list: Mentor[] = snap.docs
        .map((d) => ({
          username: String(d.get("username") || "").trim(),
          level: Number(d.get("level") || 1),
          country: String(d.get("country") || "").trim(),
          status: String(d.get("statusMessage") || "").trim(),
          photo: profileImageUrl(d.data()),
          merchants: 0,
          pending: 0,
        }))
        .filter((m) => m.username);
      const names = list.map((m) => m.username);
      const chunks: string[][] = [];
      for (let i = 0; i < names.length; i += 10) chunks.push(names.slice(i, i + 10));
      const count = (field: string, extra: ReturnType<typeof where>[], coll: string) =>
        Promise.all(chunks.map((c) => getDocs(query(collection(db, coll), where(field, "in", c), ...extra)))).then((snaps) => {
          const m = new Map<string, number>();
          snaps.forEach((s) => s.docs.forEach((d) => m.set(String(d.get(field)), (m.get(String(d.get(field))) || 0) + 1)));
          return m;
        });
      const [merchants, pendings] = await Promise.all([
        count("mentorUsername", [], "mentor_merchants").catch(() => new Map<string, number>()),
        count("toMentor", [where("status", "==", "pending")], "mentor_requests").catch(() => new Map<string, number>()),
      ]);
      setMentors(list.map((m) => ({ ...m, merchants: merchants.get(m.username) || 0, pending: pendings.get(m.username) || 0 })));
    })().catch(() => setMentors([]));
  }, [step, mentors]);

  const send = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError("");
    try {
      const ref = await addDoc(collection(db, "mentor_requests"), {
        fromUsername: username,
        toMentor: selected,
        note: note.trim().slice(0, 500),
        level,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      setPending(await getDoc(ref));
      setStep("INTRO");
    } catch (e: any) {
      setError(e?.message || "Could not send the request.");
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!pending || busy) return;
    setBusy(true);
    try {
      await deleteDoc(pending.ref);
      setPending(null);
    } catch (e: any) {
      setError(e?.message || "Could not cancel the request.");
    } finally {
      setBusy(false);
    }
  };

  // An active merchant gets the full Merchant Dashboard.
  if (ready && loaded && (merchant || isMerchantRole) && uid) {
    return <MerchantDashboard me={username} uid={uid} merchantDoc={merchant} />;
  }

  let body: React.ReactNode;
  if (!ready || !loaded) {
    // Waiting for the role check: plain page, no "Loading…" text.
    body = null;
  } else if (isMentor) {
    body = uid ? <MentorIdCard me={username} uid={uid} /> : null;
  } else if (pending) {
    body = (
      <div className={card}>
        <p className="text-4xl">⏳</p>
        <p className="mt-2 text-xl font-bold">Request Pending ⏳</p>
        <p className="mt-1 text-sm text-white/70">
          Waiting for <span data-notranslate>@{String(pending.get("toMentor") || "")}</span> to review your request.
        </p>
        <button type="button" onClick={cancel} disabled={busy} className="mt-4 rounded-xl bg-rose-600 px-6 py-2.5 text-sm font-bold disabled:opacity-50">
          {busy ? "Cancelling…" : "Cancel Request"}
        </button>
      </div>
    );
  } else if (step === "PICK") {
    // ☀️ Community's light look: white cards with profile pictures; the
    // chosen mentor gets a blue frame and ✓.
    body = (
      <div>
        <p className="mx-1 mb-3 text-[13px] text-[#5B6B8C]">Pick a mentor and send your request — they&apos;ll review and approve it. ✨</p>

        <div className="space-y-[9px]">
          {mentors === null ? (
            <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading…</p>
          ) : mentors.length === 0 ? (
            <div className="rounded-[20px] bg-white py-7 text-center shadow-sm">
              <span className="text-3xl">🔍</span>
              <p className="mt-1.5 text-[13px] text-[#5B6B8C]">No mentors available right now.</p>
            </div>
          ) : (
            mentors.map((m, idx) => {
              const sel = selected === m.username;
              // 🎨 every mentor card its own colour (like the Community page)
              const c = MENTOR_COLORS[idx % MENTOR_COLORS.length];
              const info = m.country ? countryInfoFor(m.country) : undefined;
              const flag = info ? countryFlag(info.iso) : "📍";
              return (
                <div
                  key={m.username}
                  className="rounded-[20px] p-3 transition"
                  style={{
                    border: `${sel ? 2 : 1}px solid ${c}${sel ? "" : "40"}`,
                    background: `linear-gradient(90deg, #FFFFFF, #FFFFFF, ${c}${sel ? "33" : "1F"})`,
                    boxShadow: `0 ${sel ? 8 : 3}px ${sel ? 20 : 10}px ${c}${sel ? "40" : "1F"}`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <Face name={m.username} url={m.photo} size={52} ring={`linear-gradient(${c}${sel ? "" : "66"}, ${c})`} />
                    <span className="min-w-0 flex-1">
                      <span data-notranslate className="block truncate text-base font-black text-[#0B2A5B]">
                        @{m.username}
                      </span>
                      {m.country && (
                        <span className="block truncate text-xs text-[#5B6B8C]">
                          {flag} {m.country}
                        </span>
                      )}
                      {m.status && (
                        <span data-notranslate className="mt-0.5 block truncate text-[12px] italic text-[#38517F]">
                          💬 {m.status}
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 rounded-full bg-[#FFF6DD] px-2.5 py-1 text-[11px] font-black text-[#B7791F]">⭐ Lv {m.level}</span>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full px-2.5 py-1 text-[11px] font-extrabold" style={{ background: `${c}1F`, color: c }}>
                      🏪 {m.merchants} merchants
                    </span>
                    <span className="rounded-full bg-[#FFF3D6] px-2.5 py-1 text-[11px] font-extrabold text-[#B7791F]">⏳ {m.pending} pending</span>
                    <button
                      type="button"
                      onClick={() => setSelected(sel ? "" : m.username)}
                      className={`ml-auto rounded-full px-[18px] py-2 text-[13px] font-black text-white transition active:scale-95 ${sel ? "bg-[#16A34A]" : ""}`}
                      style={sel ? undefined : { background: `linear-gradient(90deg, ${c}B3, ${c})` }}
                    >
                      {sel ? "✓ Chosen" : "Choose"}
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* message + send in one bar */}
        <div className="mt-3 flex items-end gap-2 rounded-[20px] border border-[#E3EAF5] bg-white p-1.5 pl-3.5 shadow-sm focus-within:border-[#2F6ABD]">
          <span className="pb-2 text-lg">✍️</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={1}
            placeholder={selected ? `Message to @${selected} (optional)` : "Message (optional)"}
            className="max-h-28 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC]"
          />
          <button
            type="button"
            onClick={send}
            disabled={!selected || busy}
            className="h-10 shrink-0 rounded-[14px] px-4 text-sm font-black text-white disabled:opacity-40"
            style={{ background: "linear-gradient(90deg,#5A8FD6,#2F6ABD)" }}
          >
            {busy ? "…" : "Send 🚀"}
          </button>
        </div>
        <p className="mr-2 mt-1 text-right text-[11px] text-[#8A9BBC]">{selected ? `To @${selected}` : "Choose a mentor first"} · {note.length}/500</p>

        <button type="button" onClick={() => setStep("INTRO")} className="mt-1 w-full py-2 text-sm font-bold text-[#5B6B8C]">
          Back
        </button>
      </div>
    );
  } else {
    // 🧭 the Merchant journey: 4 coloured steps on a path, an example and the start button
    // 🎨 each step is a Community-page card in its own colour
    const steps: [string, string, string, string, string][] = [
      ["1", "🧑‍🏫", "Pick a mentor", "Choose who will approve you", "#1E63D6"],
      ["2", "✉️", "Send your request", "Add a short message (optional)", "#6A5BEA"],
      ["3", "✅", "Get approved", "You're a Merchant for 30 days", "#B04BD6"],
      ["4", "🏷️", "Tag users & earn", "5,000-coin tag · 2.5% on their spending · paid every night", "#16A34A"],
    ];
    body = (
      <div>
        <div
          className="flex items-center gap-3 rounded-[20px] border p-3.5"
          style={{ borderColor: "#E9801A38", background: "linear-gradient(90deg,#FFFFFF,#FFFFFF,#E9801A1A)", boxShadow: "0 3px 10px #E9801A1F" }}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: "linear-gradient(135deg, #F7C948, #E9801A)" }}>
            🧳
          </span>
          <div>
            <p className="text-lg font-black text-[#0B2A5B]">Your Merchant journey</p>
            <p className="text-xs text-[#5B6B8C]">4 steps · mentor approval required</p>
          </div>
        </div>

        <ol className="mt-3 space-y-2.5">
          {steps.map(([n, icon, title, sub, color]) => (
            <li
              key={n}
              className="flex items-center gap-3 rounded-[18px] border px-3 py-2.5"
              style={{ borderColor: `${color}38`, background: `linear-gradient(90deg, #FFFFFF, #FFFFFF, ${color}1A)`, boxShadow: `0 3px 10px ${color}1F` }}
            >
              <span
                className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border text-[21px]"
                style={{ background: `linear-gradient(135deg, ${color}3D, ${color}12)`, borderColor: `${color}4D` }}
              >
                {icon}
                <span
                  className="absolute -left-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-black text-white shadow"
                  style={{ background: color }}
                >
                  {n}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-[#0B2A5B]">{title}</span>
                <span className="block text-xs text-[#5B6B8C]">{sub}</span>
              </span>
            </li>
          ))}
        </ol>

        <div
          className="mt-3 flex items-center gap-3 rounded-[18px] border px-3.5 py-3"
          style={{ borderColor: "#16A34A38", background: "linear-gradient(90deg,#FFFFFF,#FFFFFF,#16A34A1A)", boxShadow: "0 3px 10px #16A34A1F" }}
        >
          <span className="text-2xl">💚</span>
          <p className="text-[13px] text-[#0B2A5B]">
            <b>Example:</b> your users spend 🪙100,000 → you get <b className="text-[#16A34A]">🪙2,500</b>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStep("PICK")}
          className="mt-4 w-full rounded-2xl bg-gradient-to-r from-[#1E63D6] via-[#6A5BEA] to-[#B04BD6] py-3.5 text-[15px] font-black text-white shadow-[0_8px_18px_rgba(106,91,234,.35)] transition active:scale-[.98]"
        >
          Start step 1 →
        </button>
      </div>
    );
  }

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title={step === "PICK" && !pending ? "Choose Your Mentor" : "miGlife Partner"} subtitle="Become or manage a Merchant" icon="🏪" backHref="/explore" />
        {error && <p className="mb-3 rounded-xl bg-white px-4 py-2 text-sm text-rose-600 shadow-sm">{error}</p>}
        {body}
      </section>
    </PageShell>
  );
}
