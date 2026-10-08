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
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useSession } from "../_components/AppSession";
import { PageShell } from "../_components/PageShell";
import {
  amount,
  Avatar,
  DAY,
  DateBar,
  dayRange,
  daysLeft,
  EarningPanel,
  lc,
  ProgramBar,
  spendBetween,
  todayStr,
  trailReport,
  uidsFor,
  checkTagFree,
} from "../_components/ProgramShared";
import { isMainFounderName } from "../../lib/founder";

// Explore › Merchant Program › Mentor Dashboard, same documents and rules as
// the app's MentorDashboardPage / MentorReportPage / MentorEarningsPage:
//  DASHBOARD  mentor_requests (approve / reject), mentor_merchants, mentor_tagged,
//             "Tag User" → mentor_tag_requests + an alert for that user.
//  REPORT     one day's trail: 3% of each tagged user's spend after they were
//             tagged, plus 0.5% of the spend of users your merchants tagged.
//  EARNING    mentor_earnings/{username} (server totals) and your coin balance.

const approveMerchantRole = httpsCallable<
  { requestId: string; mentorUsername: string; merchantUsername: string; operationId: string },
  { ok: boolean }
>(functions, "approveMerchantRole");

const MAX_MERCHANTS = 15;

export default function MentorDashboardPage() {
  const ready = useRequireLogin();
  const { user, username } = useSession();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [panel, setPanel] = useState<"DASHBOARD" | "REPORT" | "EARNING">("DASHBOARD");
  const [refresh, setRefresh] = useState(0);

  // Mentors (and migwith) only — same check as the app's Merchant Program page.
  useEffect(() => {
    if (!user || !username) return;
    getDoc(doc(db, "users", user.uid))
      .then((s) => {
        const role = lc(String(s.get("role") || ""));
        const roles = ((s.get("roles") as unknown[]) || []).map((r) => lc(String(r)));
        setAllowed(role === "mentor" || roles.includes("mentor") || isMainFounderName(username));
      })
      .catch(() => setAllowed(false));
  }, [user, username]);

  return (
    <PageShell light>
      <ProgramBar
        backHref="/merchant"
        panels={["DASHBOARD", "REPORT", "EARNING"] as const}
        panel={panel}
        setPanel={setPanel}
        onRefresh={() => setRefresh((n) => n + 1)}
        accent="#D4AF37"
      />

      <section className="mx-auto max-w-4xl pb-10">
        {!ready || allowed === null ? (
          <p className="py-16 text-center text-sm text-[#5B6B8C]">Loading…</p>
        ) : !allowed ? (
          <p className="px-4 py-16 text-center text-sm text-[#5B6B8C]">The Mentor Dashboard is for mentors only.</p>
        ) : panel === "DASHBOARD" ? (
          <Dashboard me={username} refresh={refresh} />
        ) : panel === "REPORT" ? (
          <Report me={username} refresh={refresh} />
        ) : (
          <EarningPanel kind="mentor" me={username} uid={user!.uid} refresh={refresh} />
        )}
      </section>
    </PageShell>
  );
}

/* ----------------------------------------------------------------- DASHBOARD */

function Dashboard({ me, refresh }: { me: string; refresh: number }) {
  const [tab, setTab] = useState<"REQUESTS" | "MERCHANTS" | "TAGGED">("REQUESTS");
  const [requests, setRequests] = useState<DocumentSnapshot[]>([]);
  const [merchants, setMerchants] = useState<DocumentSnapshot[]>([]);
  const [tagged, setTagged] = useState<DocumentSnapshot[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  useEffect(() => {
    const off1 = onSnapshot(
      query(collection(db, "mentor_requests"), where("toMentor", "==", me), where("status", "==", "pending")),
      (s) => setRequests(s.docs),
      () => {}
    );
    const off2 = onSnapshot(query(collection(db, "mentor_merchants"), where("mentorUsername", "==", me)), (s) => setMerchants(s.docs), () => {});
    const off3 = onSnapshot(query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me)), (s) => setTagged(s.docs), () => {});
    return () => {
      off1();
      off2();
      off3();
    };
  }, [me, refresh]);

  // Live tagged-user count per merchant (the stored taggedUsersCount is never updated).
  const merchantKey = merchants.map((m) => m.get("merchantUsername")).join("|");
  useEffect(() => {
    const names = Array.from(new Set(merchants.map((m) => String(m.get("merchantUsername") || "").trim()).filter(Boolean)));
    if (!names.length) return;
    const chunks: string[][] = [];
    for (let i = 0; i < names.length; i += 10) chunks.push(names.slice(i, i + 10));
    Promise.all(
      chunks.map((c) => getDocs(query(collection(db, "merchant_tagged"), where("merchantUsername", "in", c), where("status", "==", "active"))))
    )
      .then((snaps) => {
        const m: Record<string, number> = {};
        snaps.forEach((s) => s.docs.forEach((d) => {
          const k = String(d.get("merchantUsername") || "");
          m[k] = (m[k] || 0) + 1;
        }));
        setCounts(m);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantKey]);

  const withBusy = async (key: string, run: () => Promise<void>) => {
    setBusy((b) => new Set(b).add(key));
    setMsg("");
    try {
      await run();
    } catch (e: any) {
      setMsg(e?.message || "Something went wrong.");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(key);
        return n;
      });
    }
  };

  const approve = (req: DocumentSnapshot) =>
    withBusy(req.id, async () => {
      const from = String(req.get("fromUsername") || "");
      const already = merchants.some((m) => lc(String(m.get("merchantUsername") || "")) === lc(from));
      if (!already && merchants.length >= MAX_MERCHANTS) throw new Error(`A mentor can have at most ${MAX_MERCHANTS} merchants.`);
      // 🔒 approveMerchantRole (server) does everything: marks the request
      // approved, gives the merchant role, and writes the mentor ↔ merchant
      // link + the 30-day tag. Phones can't write those any more.
      await approveMerchantRole({ requestId: req.id, mentorUsername: me, merchantUsername: from, operationId: crypto.randomUUID() });
      setMsg(`✅ @${from} is now your merchant (30 days).`);
    });

  const reject = (req: DocumentSnapshot) => withBusy(req.id, () => updateDoc(req.ref, { status: "rejected" }));

  return (
    <>
      <div className="flex justify-around bg-[#0B1F3A] text-sm font-semibold">
        {(
          [
            ["REQUESTS", `Requests${requests.length ? ` (${requests.length})` : ""}`],
            ["MERCHANTS", "Merchants"],
            ["TAGGED", "Tagged"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`px-3 pb-2 pt-1 ${tab === id ? "border-b-2 border-[#69E1F2] text-white" : "text-[#8FA0C9]"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {msg && <p className="mx-3 mt-3 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{msg}</p>}

      <div className="space-y-2 px-3 py-3">
        {tab === "REQUESTS" &&
          (requests.length === 0 ? (
            <p className="text-sm text-[#5A6B8C]">No pending requests.</p>
          ) : (
            requests.map((r) => {
              const from = String(r.get("fromUsername") || "");
              const note = String(r.get("note") || "");
              const country = String(r.get("country") || "");
              return (
                <div key={r.id} className="rounded-2xl bg-[#0B1F3A] p-4 text-white shadow">
                  <div className="flex items-center gap-3">
                    <Avatar name={from} />
                    <div className="min-w-0">
                      <p data-notranslate className="font-bold">@{from}</p>
                      <p className="text-xs text-[#8FA0C9]">Lv {Number(r.get("level") || 0)}{country && ` · ${country}`}</p>
                    </div>
                  </div>
                  {note && <p data-notranslate className="mt-2 text-xs text-[#8FA0C9]">&ldquo;{note}&rdquo;</p>}
                  <div className="mt-3 flex gap-2.5">
                    <button type="button" disabled={busy.has(r.id)} onClick={() => reject(r)} className="flex-1 rounded-xl border border-rose-400 py-2 text-sm font-bold text-rose-300 disabled:opacity-40">
                      ✕ Reject
                    </button>
                    <button type="button" disabled={busy.has(r.id)} onClick={() => approve(r)} className="flex-1 rounded-xl bg-[#69E1F2] py-2 text-sm font-black text-[#0B1F3A] disabled:opacity-40">
                      {busy.has(r.id) ? "…" : "✓ Approve"}
                    </button>
                  </div>
                </div>
              );
            })
          ))}

        {tab === "MERCHANTS" &&
          (merchants.length === 0 ? (
            <p className="text-sm text-[#5A6B8C]">No merchants yet.</p>
          ) : (
            merchants.map((m) => {
              const name = String(m.get("merchantUsername") || "");
              const left = daysLeft(m.get("expiresAt"));
              return (
                <div key={m.id} className="flex items-center gap-3 rounded-2xl bg-[#0B1F3A] px-3 py-2.5 text-white shadow">
                  <Avatar name={name} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p data-notranslate className="truncate font-bold">@{name}</p>
                    <p className="text-xs text-[#B9C4DD]">{counts[name] ?? Number(m.get("taggedUsersCount") || 0)} tagged users</p>
                  </div>
                  {left !== null && <span className="rounded-full bg-[#69E1F2] px-2.5 py-0.5 text-[11px] font-bold text-[#0B1F3A]">{left}d left</span>}
                </div>
              );
            })
          ))}

        {tab === "TAGGED" && (
          <>
            <div className="flex justify-end">
              <button type="button" onClick={() => setTagOpen(true)} className="rounded-xl bg-[#7B1FB8] px-4 py-2 text-xs font-black text-white shadow">
                + TAG USER
              </button>
            </div>
            {tagged.length === 0 ? (
              <p className="text-sm text-[#5A6B8C]">No tagged users yet.</p>
            ) : (
              tagged.map((t) => {
                const name = String(t.get("taggedUsername") || "");
                const status = String(t.get("status") || "active");
                const left = daysLeft(t.get("expiresAt"));
                return (
                  <div key={t.id} className="flex items-center gap-3 rounded-2xl bg-[#0B1F3A] px-3 py-2.5 text-white shadow">
                    <Avatar name={name} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p data-notranslate className="truncate font-bold">@{name}</p>
                      <p className="text-xs text-[#B9C4DD]">
                        {status === "active" ? "Tagged" : status}
                        {left !== null && ` · ${left}d left`} · 3% trail
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      disabled={busy.has(t.id)}
                      onClick={() => confirm(`Remove @${name} from your tagged users?`) && withBusy(t.id, () => deleteDoc(t.ref))}
                      className="px-2 text-lg text-rose-400 disabled:opacity-40"
                    >
                      🗑
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>

      {tagOpen && <TagUserDialog me={me} onClose={() => setTagOpen(false)} onDone={(t) => setMsg(`Tag request sent to @${t}.`)} />}
    </>
  );
}

function TagUserDialog({ me, onClose, onDone }: { me: string; onClose: () => void; onDone: (target: string) => void }) {
  const [target, setTarget] = useState("");
  const [amt, setAmt] = useState("5000");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const name = target.trim().replace(/^@/, "").trim();
    const tagAmount = Number(amt);
    if (!name || lc(name) === lc(me)) return setError("Enter another user's username.");
    if (!Number.isFinite(tagAmount) || tagAmount < 5000) return setError("Tag amount must be at least 5000 Coins.");
    setBusy(true);
    setError("");
    try {
      const snap = await getDocs(query(collection(db, "users"), where("username", "==", name), limit(1)));
      const u = snap.docs[0];
      if (!u) throw new Error("User not found.");
      if (lc(String(u.get("role") || "")) === "merchant") throw new Error("A mentor cannot tag a merchant.");
      const existing = await getDocs(
        query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me), where("taggedUsername", "==", name), where("status", "==", "active"), limit(1))
      );
      if (!existing.empty) throw new Error("This user is already tagged.");
      const busyMsg = await checkTagFree(name, me);
      if (busyMsg) throw new Error(busyMsg);
      const req = doc(collection(db, "mentor_tag_requests"));
      await setDoc(req, {
        mentorUsername: me,
        taggedUsername: name,
        taggedUid: u.id,
        amount: tagAmount,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "alerts"), {
        toUsername: name,
        fromUsername: me,
        requestId: req.id,
        amount: tagAmount,
        type: "mentor_tag_request",
        message: `@${me} wants to tag you. Tag amount: ${tagAmount} coins`,
        read: false,
        createdAt: serverTimestamp(),
      });
      onDone(name);
      onClose();
    } catch (e: any) {
      setError(e?.message || "Could not send tag request.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-xl border border-[#D5E3F5] bg-[#F4F9FF] px-4 py-3 text-sm text-[#0B2A5B] outline-none focus:border-[#2F80ED]";
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-2 pb-safe sm:items-center" onClick={() => !busy && onClose()}>
      <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5 text-[#0B2A5B] shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-black">💼 Tag User</h2>
        <p className="text-xs text-[#5B6B8C]">Tag amount — minimum 5000 Coins, no maximum</p>
        <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Amount (min 5000)" className={field} />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username" className={field} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]">
            Cancel
          </button>
          <button type="button" onClick={send} disabled={busy || !target.trim()} className="flex-1 rounded-xl bg-[#7B1FB8] py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- REPORT */

type Row = { username: string; spend: number; earning: number };

// One day's trail, the same calculation as the app's fetchMentorTagTrailForDate.
async function trailForDay(me: string, day: string): Promise<{ direct: Row[]; merchant: Row[] }> {
  const { start, end } = dayRange(day);
  const later = (a: Timestamp, b: Timestamp | null) => (b && b.toMillis() > a.toMillis() ? b : a);

  const [taggedSnap, merchSnap] = await Promise.all([
    getDocs(query(collection(db, "mentor_tagged"), where("mentorUsername", "==", me), where("status", "==", "active"))),
    getDocs(query(collection(db, "mentor_merchants"), where("mentorUsername", "==", me))),
  ]);
  const myMerchants = new Set(merchSnap.docs.map((x) => lc(String(x.get("merchantUsername") || ""))));
  const tagFrom = new Map<string, Timestamp>();
  taggedSnap.docs.forEach((t) => {
    const n = String(t.get("taggedUsername") || "").trim();
    if (n) tagFrom.set(n, later(start, (t.get("createdAt") as Timestamp) || null));
  });
  const names = Array.from(tagFrom.keys());
  const merchantNames = names.filter((n) => myMerchants.has(lc(n)));

  // Users each of my merchants tagged (not merchants themselves).
  const downstream = new Map<string, { name: string; at: Timestamp | null }[]>();
  await Promise.all(
    merchantNames.map(async (mn) => {
      const s = await getDocs(query(collection(db, "merchant_tagged"), where("merchantUsername", "==", mn), where("status", "==", "active")));
      downstream.set(
        mn,
        s.docs
          .map((x) => ({ name: String(x.get("taggedUsername") || "").trim(), at: (x.get("createdAt") as Timestamp) || null }))
          .filter((x) => x.name)
      );
    })
  );
  const allDown = Array.from(new Set(Array.from(downstream.values()).flat().map((x) => x.name)));
  const becameMerchant = new Set<string>();
  for (let i = 0; i < allDown.length; i += 10) {
    const s = await getDocs(query(collection(db, "mentor_merchants"), where("merchantUsername", "in", allDown.slice(i, i + 10))));
    s.docs.forEach((x) => becameMerchant.add(String(x.get("merchantUsername"))));
  }
  const uids = await uidsFor([...names, ...allDown.filter((n) => !becameMerchant.has(n))]);
  const spendFor = (name: string, from: Timestamp) => {
    const uid = uids.get(name);
    return uid ? spendBetween(uid, name, from, end) : Promise.resolve(0);
  };

  const direct: Row[] = [];
  const merchant: Row[] = [];
  await Promise.all(
    names.map(async (n) => {
      const own = await spendFor(n, tagFrom.get(n)!);
      direct.push({ username: n, spend: own, earning: (own * 3) / 100 });
      if (myMerchants.has(lc(n))) {
        const parts = await Promise.all(
          (downstream.get(n) || [])
            .filter((x) => !becameMerchant.has(x.name))
            .map((x) => spendFor(x.name, later(tagFrom.get(n)!, x.at)))
        );
        const down = parts.reduce((a, b) => a + b, 0);
        merchant.push({ username: n, spend: down, earning: (down * 0.5) / 100 });
      }
    })
  );
  const byName = (a: Row, b: Row) => a.username.toLowerCase().localeCompare(b.username.toLowerCase());
  return { direct: direct.sort(byName), merchant: merchant.sort(byName) };
}

function Report({ me, refresh }: { me: string; refresh: number }) {
  const [day, setDay] = useState(todayStr);
  const [data, setData] = useState<{ direct: Row[]; merchant: Row[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Loading took too long. Tap ⟳ to try again.")), 40_000));
    const load = trailReport("mentor", day, async () => {
      const r = await trailForDay(me, day);
      return { direct: r.direct, merchantSourced: r.merchant, total: 0 };
    }).then((r) => ({ direct: r.direct || [], merchant: r.merchantSourced || [] }));
    Promise.race([load, timeout])
      .then((r) => !cancelled && setData(r))
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || String(e));
        setData({ direct: [], merchant: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [me, day, refresh]);

  const sum = (rows: Row[]) => rows.reduce((a, r) => a + r.earning, 0);
  const mentorTotal = data ? sum(data.direct) : 0;
  const merchantTotal = data ? sum(data.merchant) : 0;
  const label = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-3 px-3 py-3">
      <DateBar day={day} setDay={setDay} />

      {!data ? (
        <p className="pt-4 text-sm text-[#5A6B8C]">Loading…</p>
      ) : (
        <>
          {error && <p className="text-xs text-rose-600">⚠ Could not load: {error}</p>}
          <div className="rounded-3xl border-[1.6px] border-[#FFC04A] bg-[#0B1F3A] p-4 text-white shadow-lg">
            <p className="text-xs text-[#8FA0C9]">Earned on {label}</p>
            <p className="text-3xl font-black text-[#FFC04A]">🪙 {amount(mentorTotal + merchantTotal)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] text-[#B9C4DD]">My Tags · 3%</p>
                <p className="font-black text-[#FFC04A]">🪙 {amount(mentorTotal)}</p>
              </div>
              <div className="rounded-xl bg-white/5 px-3 py-2">
                <p className="text-[10px] text-[#B9C4DD]">Via My Merchants · 0.5%</p>
                <p className="font-black text-[#69A9F0]">🪙 {amount(merchantTotal)}</p>
              </div>
            </div>
          </div>
          <TagSection title="Mentor Tag" icon="★" rate="3%" rows={data.direct} total={mentorTotal} accent="#F2A516" ink="#B36B00" tint="#FFF6DF" empty="No mentor tagged users yet" />
          <TagSection title="Merchant Tag" icon="◆" rate="0.5%" rows={data.merchant} total={merchantTotal} accent="#3984D9" ink="#1F5FB3" tint="#E8F2FF" empty="No merchant tagged users yet" />
        </>
      )}
    </div>
  );
}

function TagSection(p: { title: string; icon: string; rate: string; rows: Row[]; total: number; accent: string; ink: string; tint: string; empty: string }) {
  return (
    <div className="overflow-hidden rounded-3xl bg-white shadow-md" style={{ background: `linear-gradient(${p.tint}, #fff 120px)` }}>
      <div className="h-1" style={{ background: `linear-gradient(90deg, ${p.accent}, ${p.accent}55)` }} />
      <div className="flex items-center gap-3 px-4 py-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white" style={{ backgroundColor: p.accent }}>
          {p.icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-black text-[#0E1B3D]">
            {p.title}{" "}
            <span className="rounded-full px-1.5 text-[10px] font-bold text-white" style={{ backgroundColor: p.accent }}>
              {p.rate}
            </span>
          </p>
          <p className="text-[11px] text-[#6B7A90]">
            {p.rows.length} user{p.rows.length === 1 ? "" : "s"} · {p.rate} of their spend
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[#6B7A90]">Earned</p>
          <p className="font-black" style={{ color: p.ink }}>🪙 {amount(p.total)}</p>
        </div>
      </div>
      <div className="mx-4 h-px" style={{ backgroundColor: `${p.accent}38` }} />
      {p.rows.length === 0 ? (
        <p className="py-5 text-center text-xs text-[#6B7A90]">
          <span className="block text-xl">👥</span>
          {p.empty}
        </p>
      ) : (
        <ul className="px-3 py-2">
          {p.rows.map((r, i) => (
            <li key={r.username} className="flex items-center gap-2 py-1.5">
              <span className="w-5 text-center text-xs font-bold text-[#6B7A90]">{i + 1}</span>
              <Avatar name={r.username} size="h-7 w-7" />
              <span className="min-w-0 flex-1">
                <span data-notranslate className="block truncate text-sm font-bold text-[#12335E]">@{r.username}</span>
                <span className="block text-[11px] text-[#5A6B8C]">{amount(r.spend)} spent</span>
              </span>
              <span className="text-sm font-bold" style={{ color: p.ink }}>+{amount(r.earning)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

