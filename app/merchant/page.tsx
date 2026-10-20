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

type Mentor = { username: string; level: number; country: string; merchants: number; pending: number };

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
    const grad = "linear-gradient(90deg, #4F7CFF, #9C5BFF)";
    body = (
      <div>
        {/* Hero card */}
        <div
          className="relative overflow-hidden rounded-3xl p-[18px] text-white shadow-[0_8px_22px_rgba(156,91,255,.45)]"
          style={{ background: "linear-gradient(135deg, #2B4FD8, #6A3DE8, #B04BD6)" }}
        >
          <span className="absolute -right-12 -top-16 h-36 w-36 rounded-full bg-white/[0.08]" />
          <span className="absolute -bottom-10 -left-2 h-20 w-20 rounded-full bg-white/[0.06]" />
          <div className="relative flex items-center gap-3.5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.8px] border-[#FFD86B] bg-white/20 text-[28px]">💼</span>
            <div>
              <p className="text-lg font-extrabold">Start your Merchant journey</p>
              <p className="mt-1 text-[12.5px] leading-[17px] text-white/90">Pick a mentor and send your request. They&apos;ll review and approve it.</p>
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center">
          <span className="h-[15px] w-1 rounded-sm" style={{ background: "linear-gradient(#4F7CFF, #9C5BFF)" }} />
          <span className="ml-2 flex-1 text-xs font-extrabold tracking-[1.5px] text-[#5B6B8C]">AVAILABLE MENTORS</span>
          {mentors && mentors.length > 0 && (
            <span className="rounded-full px-2.5 py-0.5 text-[11px] font-bold text-white" style={{ background: grad }}>
              {mentors.length}
            </span>
          )}
        </div>

        <div className="mt-2">
          {mentors === null ? null : mentors.length === 0 ? (
            <div className="flex flex-col items-center rounded-[20px] border border-[#E1EAF6] bg-white py-6">
              <span className="text-3xl">🔍</span>
              <p className="mt-1.5 text-[13px] text-[#5B6B8C]">No mentors available right now.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {mentors.map((m) => {
                const sel = selected === m.username;
                const info = m.country ? countryInfoFor(m.country) : undefined;
                const flag = info ? countryFlag(info.iso) : "📍";
                return (
                  <li key={m.username}>
                    <button
                      type="button"
                      onClick={() => setSelected(m.username)}
                      className="flex w-full items-center rounded-[20px] p-3.5 text-left transition"
                      style={{
                        background: sel ? "linear-gradient(135deg, #F2ECFF, #E7F0FF) padding-box, linear-gradient(90deg, #4F7CFF, #9C5BFF) border-box" : "#FFFFFF",
                        border: sel ? "2px solid transparent" : "1px solid #E1EAF6",
                        boxShadow: sel ? "0 6px 16px rgba(156,91,255,.35)" : "0 2px 6px rgba(156,194,236,.45)",
                      }}
                    >
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full p-[2.5px]" style={{ background: "linear-gradient(135deg, #FFD86B, #9C5BFF)" }}>
                        <span className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#3B8BE8] to-[#2A64A8] text-[21px] font-extrabold text-white">
                          {m.username.slice(0, 1).toUpperCase()}
                        </span>
                      </span>
                      <span className="ml-3 min-w-0 flex-1">
                        <span data-notranslate className="block truncate text-base font-extrabold text-[#22304D]">
                          @{m.username}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-[#5B6B8C]">
                          ⭐ Lv {m.level}
                          {m.country && `  ·  ${flag} ${m.country}`}
                        </span>
                        <span className="mt-[7px] flex gap-1.5">
                          <span className="rounded-full border border-[#2E9E6B]/30 bg-[#2E9E6B]/10 px-[9px] py-[3px] text-[11px] font-bold text-[#1F7A50]">👥 {m.merchants} Subs</span>
                          <span className="rounded-full border border-[#E08A00]/30 bg-[#E08A00]/10 px-[9px] py-[3px] text-[11px] font-bold text-[#A86500]">⏳ {m.pending} Pending</span>
                        </span>
                      </span>
                      <span
                        className="ml-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[15px] font-bold text-white"
                        style={sel ? { background: grad } : { border: "1.5px solid #C9D6EA" }}
                      >
                        {sel ? "✓" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <p className="mb-1.5 ml-1 mt-5 text-xs font-extrabold tracking-[1.5px] text-[#5B6B8C]">MESSAGE</p>
        <div className="flex rounded-[18px] border border-[#DCE6F4] bg-white px-3 py-2.5 shadow-[0_2px_6px_rgba(156,194,236,.45)] focus-within:border-[#9C5BFF]">
          <span className="mr-2 text-lg">✍️</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value.slice(0, 500))}
            rows={4}
            placeholder="Add a message for your mentor (optional)"
            className="min-w-0 flex-1 resize-none bg-transparent text-[15px] text-[#22304D] outline-none placeholder:text-[#8A9BBC]"
          />
        </div>
        <p className="mr-1 mt-1 text-right text-[11px] text-[#8A9BBC]">{note.length}/500</p>

        <button
          type="button"
          onClick={send}
          disabled={!selected || busy}
          className="mt-3 h-[54px] w-full truncate rounded-[18px] px-3 text-[15px] font-extrabold"
          style={
            selected || busy
              ? { background: "linear-gradient(90deg, #4F7CFF, #9C5BFF, #D45BC9)", color: "#FFFFFF", boxShadow: "0 8px 20px rgba(156,91,255,.45)" }
              : { background: "#D5DEEB", color: "#5B6B8C" }
          }
        >
          {busy ? "Sending…" : selected ? `🚀  Send Request to @${selected}` : "Select a mentor first"}
        </button>
        <button type="button" onClick={() => setStep("INTRO")} className="mt-2 w-full py-2 text-sm font-bold text-[#5B6B8C]">
          Back
        </button>
      </div>
    );
  } else {
    body = (
      <div className="rounded-[20px] border-[1.5px] border-[#F2B531]/70 bg-[#FFFBF0] p-6 text-center shadow-lg">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl text-3xl" style={{ background: "linear-gradient(135deg, #F7C948, #E9801A)" }}>
          🧳
        </div>
        <p className="mt-3 text-xl font-bold text-[#2B3552]">Join as a Merchant</p>
        <p className="mt-1 text-sm text-[#5A6B8C]">Earn tagged-user rewards when they spend coins. Mentor approval required.</p>
        <button type="button" onClick={() => setStep("PICK")} className="mt-4 w-full rounded-xl bg-[#F2A81D] py-2.5 text-sm font-black text-[#2B1A00]">
          Join as a Merchant
        </button>
      </div>
    );
  }

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title={step === "PICK" && !pending ? "Choose Your Mentor" : "miGlife Partner"} subtitle="Become or manage a Merchant" icon="🏪" />
        {error && <p className="mb-3 rounded-xl bg-white px-4 py-2 text-sm text-rose-600 shadow-sm">{error}</p>}
        {body}
      </section>
    </PageShell>
  );
}
