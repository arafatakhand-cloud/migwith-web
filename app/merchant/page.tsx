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

// Explore › miGlife Partner (Merchant Program), same documents as the app's MentorProgramPage:
// a normal user picks a mentor and sends a mentor_requests entry; an active
// mentor_merchants record opens the Merchant Dashboard; mentors get a link to
// the Mentor Dashboard (/mentor).

type Mentor = { username: string; level: number; country: string; status: string; merchants: number; pending: number };

const toMs = (v: any) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);

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
    body = (
      <div>
        {/* 🧳 a short line instead of the big banner */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: "linear-gradient(135deg, #F7C948, #E9801A)" }}>
            🧳
          </span>
          <p className="text-[13px] leading-[18px] text-[#5B6B8C]">Pick a mentor and send your request. They&apos;ll review and approve it.</p>
        </div>

        <div className="mt-3 space-y-2.5">
          {mentors === null ? null : mentors.length === 0 ? (
            <div className="flex flex-col items-center rounded-[20px] bg-white py-6 shadow-sm">
              <span className="text-3xl">🔍</span>
              <p className="mt-1.5 text-[13px] text-[#5B6B8C]">No mentors available right now.</p>
            </div>
          ) : (
            mentors.map((m) => {
              const sel = selected === m.username;
              const info = m.country ? countryInfoFor(m.country) : undefined;
              const flag = info ? countryFlag(info.iso) : "📍";
              return (
                <div
                  key={m.username}
                  className={`rounded-[20px] bg-white p-3 transition ${
                    sel ? "shadow-[0_0_0_2px_#16A34A,0_6px_14px_rgba(22,163,74,.2)]" : "shadow-[0_2px_8px_rgba(30,99,214,.08)]"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] text-xl font-black text-white">
                      {m.username.slice(0, 1).toUpperCase()}
                    </span>
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
                    <span className="shrink-0 rounded-full bg-[#FFF6DD] px-2.5 py-0.5 text-[11px] font-black text-[#B7791F]">Lv {m.level}</span>
                  </div>
                  <div className="mt-2.5 flex gap-2">
                    <div className="flex-1 rounded-xl bg-[#EAF1FC] py-1.5 text-center">
                      <p className="text-base font-black leading-tight text-[#1E63D6]">{m.merchants}</p>
                      <p className="text-[10px] text-[#5B6B8C]">Merchants</p>
                    </div>
                    <div className="flex-1 rounded-xl bg-[#EAF1FC] py-1.5 text-center">
                      <p className="text-base font-black leading-tight text-[#C98A0C]">{m.pending}</p>
                      <p className="text-[10px] text-[#5B6B8C]">Pending</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelected(sel ? "" : m.username)}
                      className={`flex-[1.3] rounded-xl text-sm font-black text-white transition active:scale-95 ${sel ? "bg-[#16A34A]" : "bg-[#1E63D6]"}`}
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
        <div className="mt-3 flex items-end gap-2 rounded-[24px] bg-white p-1.5 pl-3.5 shadow-[0_2px_8px_rgba(30,99,214,.1)] focus-within:shadow-[0_0_0_2px_#1E63D6]">
          <span className="pb-2 text-lg">✍️</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={1}
            placeholder={selected ? `Message for @${selected} (optional)` : "Message (optional)"}
            className="max-h-28 min-h-[40px] min-w-0 flex-1 resize-none bg-transparent py-2.5 text-[15px] text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC]"
          />
          <button
            type="button"
            onClick={send}
            disabled={!selected || busy}
            className="h-10 shrink-0 rounded-full bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] px-4 text-sm font-black text-white shadow disabled:from-[#C7D0DD] disabled:to-[#C7D0DD] disabled:shadow-none"
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
    const steps: [string, string, string, string][] = [
      ["1", "Pick a mentor", "Choose who will approve you", "from-[#5A8FD6] to-[#1E63D6]"],
      ["2", "Send your request", "Add a short message (optional)", "from-[#8B7CF0] to-[#6A5BEA]"],
      ["3", "Get approved", "You're a Merchant for 30 days", "from-[#C77BE6] to-[#B04BD6]"],
      ["4", "Tag users & earn", "5,000-coin tag · 2.5% on their spending · paid every night", "from-[#3CC774] to-[#16A34A]"],
    ];
    body = (
      <div>
        <div className="flex items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-[0_2px_10px_rgba(30,99,214,.08)]">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ background: "linear-gradient(135deg, #F7C948, #E9801A)" }}>
            🧳
          </span>
          <div>
            <p className="text-lg font-black text-[#0B2A5B]">Your Merchant journey</p>
            <p className="text-xs text-[#5B6B8C]">4 steps · mentor approval required</p>
          </div>
        </div>

        <ol className="mt-4 pl-1">
          {steps.map(([n, title, sub, grad], i) => (
            <li key={n} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${grad} text-sm font-black text-white shadow-md`}>{n}</span>
                {i < steps.length - 1 && <span className={`my-1 w-[3px] flex-1 rounded-full bg-gradient-to-b ${grad} opacity-60`} style={{ minHeight: 34 }} />}
              </div>
              <div className="pb-4 pt-1.5">
                <p className="text-[15px] font-black text-[#0B2A5B]">{title}</p>
                <p className="text-xs text-[#5B6B8C]">{sub}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center gap-3 rounded-[18px] border border-[#CDEFD8] bg-gradient-to-br from-[#E3F7EA] to-white px-3.5 py-3">
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
