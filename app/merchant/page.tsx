"use client";

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

// Explore › Merchant Program, same documents as the app's MentorProgramPage:
// a normal user picks a mentor and sends a mentor_requests entry; an active
// mentor_merchants record shows the merchant's summary (merchant_earnings).
// Mentor tools and tagging users stay in the app.

type Mentor = { username: string; level: number; country: string; merchants: number; pending: number };

const toMs = (v: any) => (v && typeof v.toMillis === "function" ? v.toMillis() : 0);
const coins = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });

const card = "rounded-3xl bg-[#0B1F3A] p-6 text-center text-white shadow-lg";

export default function MerchantPage() {
  const ready = useRequireLogin();
  const { user, username } = useSession();
  const [loaded, setLoaded] = useState(false);
  const [isMentor, setIsMentor] = useState(false);
  const [level, setLevel] = useState(1);
  const [pending, setPending] = useState<DocumentSnapshot | null>(null);
  const [merchant, setMerchant] = useState<DocumentSnapshot | null>(null);
  const [earnings, setEarnings] = useState({ today: 0, last7: 0, pending: 0, allTime: 0 });
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
        const mentor = role === "mentor" || username.trim().toLowerCase() === "migwith";
        setIsMentor(mentor);
        if (!mentor) {
          const [req, merch] = await Promise.all([
            getDocs(query(collection(db, "mentor_requests"), where("fromUsername", "==", username), where("status", "==", "pending"), limit(1))),
            getDocs(query(collection(db, "mentor_merchants"), where("merchantUsername", "==", username))),
          ]);
          setPending(req.docs[0] || null);
          const active = merch.docs.find((m) => toMs(m.get("expiresAt")) > Date.now()) || null;
          setMerchant(active);
          if (active) {
            const e = await getDoc(doc(db, "merchant_earnings", username));
            setEarnings({
              today: Number(e.get("today") || 0),
              last7: Number(e.get("last7Days") || 0),
              pending: Number(e.get("pending") || 0),
              allTime: Number(e.get("allTime") || 0),
            });
          }
        }
      } catch (e: any) {
        setError(e?.message || "Could not load the Merchant Program.");
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

  let body: React.ReactNode;
  if (!ready || !loaded) {
    body = <p className="py-16 text-center text-sm text-[#5B6B8C]">Loading…</p>;
  } else if (isMentor) {
    body = (
      <div className={`${card} border border-[#D4AF37]/60`}>
        <p className="text-4xl">🎓</p>
        <p className="mt-2 text-xl font-bold">You are a Mentor 🎓</p>
        <p className="mt-1 text-sm text-white/70">Approve requests and manage your merchants in the MIGwith app (Explore › Merchant Program).</p>
      </div>
    );
  } else if (merchant) {
    const days = Math.max(0, Math.floor((toMs(merchant.get("expiresAt")) - Date.now()) / 86_400_000));
    body = (
      <div className="space-y-3">
        <div className="rounded-3xl bg-gradient-to-br from-[#7B1FB8] to-[#4A1480] p-5 text-white shadow-lg">
          <p className="text-lg font-black">🏪 Active Merchant 🎁</p>
          <p className="text-sm text-white/80">🪙 {coins(earnings.allTime)} coins earned all-time</p>
          <p className="mt-3 inline-block rounded-xl bg-white/15 px-3 py-1 text-sm font-bold">⏱ {days} days remaining</p>
        </div>
        <div className="rounded-3xl bg-[#0B1F3A] p-4 text-white shadow">
          <p className="font-bold">📈 Trail Earnings</p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            {[
              ["Today", earnings.today],
              ["Last 7 days", earnings.last7],
              ["Pending", earnings.pending],
            ].map(([l, v]) => (
              <div key={l as string}>
                <p className="text-[11px] text-white/60">{l}</p>
                <p className="font-black text-[#6FE0A0]">{coins(v as number)}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-white/50">Auto-credited daily at 12:00 AM Bangladesh time</p>
        </div>
        <div className="rounded-3xl bg-white p-4 text-[#0B2A5B] shadow-sm">
          <p className="text-xs text-[#5B6B8C]">Your Mentor</p>
          <p data-notranslate className="font-bold text-[#2F80ED]">
            @{String(merchant.get("mentorUsername") || "")}
          </p>
        </div>
        <p className="text-center text-xs text-[#5B6B8C]">Tag users, reports and renewal are in the MIGwith app.</p>
      </div>
    );
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
      <div className="space-y-3">
        <p className="rounded-2xl bg-white px-4 py-3 text-sm text-[#35507E] shadow-sm">ℹ️ Pick a mentor and submit a request. They&apos;ll review and approve.</p>
        {mentors === null ? (
          <p className="py-8 text-center text-sm text-[#5B6B8C]">Loading…</p>
        ) : mentors.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#5B6B8C]">No mentors available right now.</p>
        ) : (
          <ul className="space-y-2">
            {mentors.map((m) => (
              <li key={m.username}>
                <button
                  type="button"
                  onClick={() => setSelected(m.username)}
                  className={`flex w-full items-center gap-3 rounded-2xl border-2 bg-white px-3 py-2.5 text-left shadow-sm ${
                    selected === m.username ? "border-[#2F80ED]" : "border-transparent"
                  }`}
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#DCEBFB] font-black text-[#174EA6]">
                    {m.username.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span data-notranslate className="block truncate font-bold text-[#0B2A5B]">
                      @{m.username}
                    </span>
                    <span className="block truncate text-xs text-[#5B6B8C]">
                      Lv {m.level}
                      {m.country && ` · ${m.country}`} · {m.merchants} merchants · {m.pending} pending
                    </span>
                  </span>
                  {selected === m.username && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#2F80ED] text-xs text-white">✓</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value.slice(0, 500))}
          rows={3}
          placeholder="Why do you want to be a merchant? (optional)"
          className="w-full resize-none rounded-2xl border border-[#D5E3F5] bg-white px-4 py-3 text-sm text-[#0B2A5B] outline-none placeholder:text-[#8A9BBC] focus:border-[#2F80ED]"
        />
        <p className="-mt-2 text-right text-[11px] text-[#8A9BBC]">{note.length}/500</p>
        <div className="flex gap-2">
          <button type="button" onClick={() => setStep("INTRO")} className="flex-1 rounded-xl border border-[#D5E3F5] bg-white py-3 text-sm font-bold text-[#5B6B8C]">
            Back
          </button>
          <button
            type="button"
            onClick={send}
            disabled={!selected || busy}
            className="flex-[2] rounded-xl bg-[#0B2A5B] py-3 text-sm font-black text-white disabled:opacity-40"
          >
            {busy ? "Sending…" : selected ? `Send Request to @${selected}` : "Pick a mentor"}
          </button>
        </div>
      </div>
    );
  } else {
    body = (
      <div className={card}>
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#7B1FB8] text-3xl">🧳</div>
        <p className="mt-3 text-xl font-bold">Become a Merchant</p>
        <p className="mt-1 text-sm text-white/70">Get tagged-trail earnings when your tagged users spend coins. Requires approval from a mentor.</p>
        <button type="button" onClick={() => setStep("PICK")} className="mt-4 rounded-xl bg-[#69E1F2] px-8 py-2.5 text-sm font-black text-[#0B1F3A]">
          Get Started
        </button>
      </div>
    );
  }

  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title={step === "PICK" && !pending ? "Pick a Mentor" : "Merchant Program"} subtitle="Become or manage a Merchant" icon="🏪" />
        {error && <p className="mb-3 rounded-xl bg-white px-4 py-2 text-sm text-rose-600 shadow-sm">{error}</p>}
        {body}
      </section>
    </PageShell>
  );
}
