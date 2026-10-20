"use client";

import { useEffect, useState } from "react";
import {
  addDoc,
  collection,
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
import { db } from "../../lib/firebase";
import { PageShell } from "../_components/PageShell";
import {
  amount,
  Avatar,
  checkTagFree,
  DateBar,
  dayRange,
  daysLeft,
  EarningPanel,
  lc,
  ProgramBar,
  WavePage,
  spendBetween,
  todayStr,
  toMs,
  trailReport,
  uidsFor,
} from "../_components/ProgramShared";

// Merchant Dashboard, like the app's MerchantDashboardPage / MerchantReportPage /
// MerchantEarningsPage:
//  DASHBOARD  your merchant term, tagged normal users (+ Tag User → merchant_tag_requests
//             and an alert; Remove), trail today / last 7 days / pending, your mentor,
//             Request Renewal.
//  REPORT     one day's 2.5% trail from your tagged users' spend after they were tagged.
//  EARNING    merchant_earnings/{username} and your coin balance.

const RATE = 2.5;
type Row = { username: string; spend: number; earning: number };

// One day's 2.5% trail: from the server (getTrailReport), else worked out here.
async function merchantTrailForDay(me: string, day: string): Promise<Row[]> {
  const r = await trailReport("merchant", day, async () => ({ rows: await merchantTrailInBrowser(me, day), total: 0 }));
  return r.rows || [];
}

// Same as the app's fetchMerchantTrailForDate (needs read access to the users' spend).
async function merchantTrailInBrowser(me: string, day: string): Promise<Row[]> {
  const { start, end } = dayRange(day);
  const snap = await getDocs(query(collection(db, "merchant_tagged"), where("merchantUsername", "==", me), where("status", "==", "active")));
  const tagged = snap.docs
    .map((t) => ({ name: String(t.get("taggedUsername") || "").trim(), at: (t.get("createdAt") as Timestamp) || null }))
    .filter((t) => t.name);
  const uids = await uidsFor(tagged.map((t) => t.name));
  const rows = new Map<string, Row>();
  await Promise.all(
    tagged.map(async (t) => {
      const uid = uids.get(t.name);
      if (!uid) return;
      const from = t.at && t.at.toMillis() > start.toMillis() ? t.at : start;
      const spend = await spendBetween(uid, t.name, from, end);
      rows.set(lc(t.name), { username: t.name, spend, earning: (spend * RATE) / 100 });
    })
  );
  return Array.from(rows.values()).sort((a, b) => a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
}

// Bangladesh date, like the server's daily reports.
const dayStr = (daysAgo: number) =>
  new Date(Date.now() - daysAgo * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });

export function MerchantDashboard({ me, uid, merchantDoc }: { me: string; uid: string; merchantDoc: DocumentSnapshot | null }) {
  const [panel, setPanel] = useState<"DASHBOARD" | "REPORT" | "EARNING">("DASHBOARD");
  const [refresh, setRefresh] = useState(0);
  return (
    <PageShell light>
      <WavePage>
      <ProgramBar
        backHref="/explore"
        panels={["DASHBOARD", "REPORT", "EARNING"] as const}
        panel={panel}
        setPanel={setPanel}
        onRefresh={() => setRefresh((n) => n + 1)}
        accent="#1E63D6"
        gold
        hello={{ name: me, line: "Here's your merchant overview today" }}
      />
      {/* 🌊 on the wave background (WavePage) — the cards float on colour */}
      <section className="mx-auto max-w-4xl pb-10 text-[#0B2A5B]">
        {panel === "DASHBOARD" ? (
          <Dashboard me={me} merchantDoc={merchantDoc} refresh={refresh} />
        ) : panel === "REPORT" ? (
          <Report me={me} refresh={refresh} />
        ) : (
          <EarningPanel kind="merchant" me={me} uid={uid} refresh={refresh} onRefresh={() => setRefresh((n) => n + 1)} gold />
        )}
      </section>
      </WavePage>
    </PageShell>
  );
}

// merchantDoc = null: a merchant by role whose mentor record is missing.
function Dashboard({ me, merchantDoc, refresh }: { me: string; merchantDoc: DocumentSnapshot | null; refresh: number }) {
  const mentor = String(merchantDoc?.get("mentorUsername") || "");
  const left = daysLeft(merchantDoc?.get("expiresAt"));
  const approvedMs = toMs(merchantDoc?.get("createdAt"));
  const [tagged, setTagged] = useState<DocumentSnapshot[]>([]);
  const [stored, setStored] = useState({ today: 0, last7: 0, pending: 0, allTime: 0 });
  const [live, setLive] = useState<{ today: number; last7: number } | null>(null);
  const [renewalPending, setRenewalPending] = useState(false);
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState("");
  const [tagOpen, setTagOpen] = useState(false);

  useEffect(
    () =>
      onSnapshot(
        query(collection(db, "merchant_tagged"), where("merchantUsername", "==", me), where("status", "==", "active")),
        (s) => setTagged(s.docs),
        () => {}
      ),
    [me, refresh]
  );

  useEffect(() => {
    if (mentor)
      getDocs(query(collection(db, "mentor_requests"), where("fromUsername", "==", me), where("toMentor", "==", mentor), where("status", "==", "pending"), limit(1)))
        .then((s) => setRenewalPending(!s.empty))
        .catch(() => {});
    getDoc(doc(db, "merchant_earnings", me))
      .then((e) =>
        setStored({
          today: Number(e.get("today") || 0),
          last7: Number(e.get("last7Days") || 0),
          pending: Number(e.get("pending") || 0),
          allTime: Number(e.get("allTime") || 0),
        })
      )
      .catch(() => {});
    // Today and the last 7 days worked out from real spend (like the app);
    // if that can't be read, the stored totals above are shown instead.
    let cancelled = false;
    setLive(null);
    Promise.all(Array.from({ length: 7 }, (_, i) => merchantTrailForDay(me, dayStr(i))))
      .then((days) => {
        if (cancelled) return;
        const totals = days.map((rows) => rows.reduce((a, r) => a + r.earning, 0));
        setLive({ today: totals[0], last7: totals.reduce((a, b) => a + b, 0) });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [me, mentor, refresh]);

  const remove = async (t: DocumentSnapshot) => {
    const name = String(t.get("taggedUsername") || "");
    if (!confirm(`Remove @${name} from your tagged users?`)) return;
    setBusy((b) => new Set(b).add(t.id));
    try {
      await updateDoc(t.ref, { status: "cancelled", cancelledAt: serverTimestamp() });
    } catch (e: any) {
      setMsg(e?.message || "Could not remove.");
    } finally {
      setBusy((b) => {
        const n = new Set(b);
        n.delete(t.id);
        return n;
      });
    }
  };

  const [renewing, setRenewing] = useState(false);
  const renew = async () => {
    setRenewing(true);
    try {
      await addDoc(collection(db, "mentor_requests"), { fromUsername: me, toMentor: mentor, note: "Renewal", status: "pending", createdAt: serverTimestamp() });
      setRenewalPending(true);
    } catch (e: any) {
      setMsg(e?.message || "Could not request renewal.");
    } finally {
      setRenewing(false);
    }
  };

  const today = live?.today ?? stored.today;
  return (
    <div className="space-y-3 px-3 py-3">
      {msg && <p className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-[#174EA6] shadow-sm">{msg}</p>}

      <div className="rounded-3xl bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] p-4 text-white shadow-lg">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20 text-xl">🧳</span>
          <div>
            <p className="font-bold">Active Merchant 🎁</p>
            <p className="text-xs text-white/80">{amount(stored.allTime)} coins earned all-time</p>
          </div>
        </div>
        {left !== null && (
          <p className="mt-3 inline-block rounded-xl bg-white/20 px-3 py-2 text-xs font-bold text-white">⏱ {left} days remaining</p>
        )}
      </div>

      <div className="rounded-3xl border border-[#D5E3F5] bg-white p-4 text-[#0B2A5B] shadow-sm">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="font-bold">🏪 Tagged Normal Users</p>
            <p className="text-[11px] text-[#5B6B8C]">
              {tagged.length} active tagged user{tagged.length === 1 ? "" : "s"}
            </p>
          </div>
          <button type="button" onClick={() => setTagOpen(true)} className="rounded-xl bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] px-3 py-2 text-[11px] font-black text-white shadow">
            + TAG USER
          </button>
        </div>
        <p className="mt-1 text-[11px] text-[#1E63D6]">5000-coin tag · 2.5% bonus on tagged users' coin use</p>
        {tagged.length === 0 ? (
          <p className="mt-2 text-xs text-[#5B6B8C]">No tagged users yet.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {tagged.map((t, i) => {
              const name = String(t.get("taggedUsername") || "");
              const d = daysLeft(t.get("expiresAt"));
              return (
                <li key={t.id} className="flex items-center gap-2 rounded-xl bg-[#EAF1FC] px-2 py-2">
                  <span className="w-5 text-[10px] text-[#5B6B8C]">{i + 1}.</span>
                  <Avatar name={name} size="h-8 w-8" />
                  <div className="min-w-0 flex-1">
                    <p data-notranslate className="truncate text-xs font-bold">@{name}</p>
                    <p className="text-[10px] text-[#1E63D6]">2.5% bonus{d !== null && ` · ${d}d left`}</p>
                  </div>
                  <button type="button" disabled={busy.has(t.id)} onClick={() => remove(t)} className="px-1 text-[10px] font-bold text-rose-600 disabled:opacity-40">
                    REMOVE
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="rounded-3xl border border-[#D5E3F5] bg-white p-4 text-[#0B2A5B] shadow-sm">
        <p className="font-bold">📈 Team Bonus</p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {[
            ["Today", today, "text-[#1E63D6]"],
            ["Last 7 days", live?.last7 ?? stored.last7, "text-[#16A34A]"],
            // what's earned today and not settled yet IS the pending amount
            ["Pending", live ? Math.max(live.today, stored.pending) : stored.pending, "text-[#C98A0C]"],
          ].map(([l, v, c]) => (
            <div key={l as string}>
              <p className="text-[11px] text-[#5B6B8C]">{l}</p>
              <p className={`text-sm font-bold ${c}`}>{amount(v as number)}</p>
            </div>
          ))}
        </div>
        <p className="mt-2 rounded-xl bg-[#EAF1FC] px-3 py-2 text-[10px] text-[#5B6B8C]">🕐 Auto-credited daily at 12:00 AM Bangladesh time</p>
      </div>

      <div className="flex items-center gap-3 rounded-3xl bg-white p-4 text-[#0B2A5B] shadow-sm">
        <Avatar name={mentor || "?"} />
        <div>
          <p className="text-[11px] text-[#5B6B8C]">Your Mentor</p>
          <p data-notranslate className="font-bold text-[#1E63D6]">{mentor ? `@${mentor}` : "Not linked yet"}</p>
          {approvedMs > 0 && <p className="text-[10px] text-[#5B6B8C]">Approved {new Date(approvedMs).toISOString().slice(0, 10)}</p>}
        </div>
      </div>

      {renewalPending ? (
        <p className="rounded-2xl border border-[#F2C94C] bg-[#FFF6DD] px-4 py-3 text-xs font-bold text-[#B7791F]">⏳ Renewal request pending mentor approval</p>
      ) : (
        <button type="button" onClick={renew} disabled={renewing || !mentor} className="w-full rounded-2xl bg-gradient-to-r from-[#5A8FD6] to-[#2F6ABD] py-3 text-sm font-black text-white shadow disabled:opacity-50">
          {renewing ? "Requesting…" : "Request Renewal"}
        </button>
      )}

      <div className="rounded-3xl bg-white p-4 text-[#0B2A5B] shadow-sm">
        <p className="font-bold">💡 How the Merchant Tag Bonus Works</p>
        <ul className="mt-2 space-y-1 text-xs leading-5 text-[#5B6B8C]">
          {[
            "Give a normal user a 5000-coin tag offer; the user must approve it",
            "Once approved, the user is automatically listed in your Tagged Users list",
            "Get a 2.5% coin bonus when your tagged users use coins",
            "Pending bonus is added automatically every night at 12:00 AM (Bangladesh time)",
            "The 5000-coin tag is handled by the server",
          ].map((l) => (
            <li key={l}>• {l}</li>
          ))}
        </ul>
      </div>

      {tagOpen && <TagUserDialog me={me} onClose={() => setTagOpen(false)} onDone={(t) => setMsg(`Tag request sent to @${t}.`)} />}
    </div>
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
      if (lc(String(u.get("role") || "")) === "mentor") throw new Error("A merchant cannot tag a mentor.");
      const [existing, pending] = await Promise.all([
        getDocs(query(collection(db, "merchant_tagged"), where("merchantUsername", "==", me), where("taggedUsername", "==", name), where("status", "==", "active"), limit(1))),
        getDocs(query(collection(db, "merchant_tag_requests"), where("merchantUsername", "==", me), where("taggedUsername", "==", name), where("status", "==", "pending"), limit(1))),
      ]);
      if (!existing.empty) throw new Error("This user is already tagged.");
      if (!pending.empty) throw new Error("A tag request is already pending.");
      const busyMsg = await checkTagFree(name, me);
      if (busyMsg) throw new Error(busyMsg);
      const req = doc(collection(db, "merchant_tag_requests"));
      await setDoc(req, {
        merchantUsername: me,
        taggedUsername: name,
        taggedUid: u.id,
        amount: tagAmount,
        rate: RATE,
        status: "pending",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "alerts"), {
        toUsername: name,
        fromUsername: me,
        requestId: req.id,
        amount: tagAmount,
        rate: RATE,
        type: "merchant_tag_request",
        message: `@${me} wants to tag you. Tag amount: ${tagAmount} coins · Merchant bonus: 2.5%`,
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
        <h2 className="text-lg font-black">🏪 Tag Normal User</h2>
        <p className="text-xs text-[#5B6B8C]">Tag amount — minimum 5000 Coins, no maximum</p>
        <p className="text-xs font-bold text-[#0E8FA5]">Merchant bonus: 2.5% of tagged users&apos; coin use</p>
        <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="Amount (min 5000)" className={field} />
        <input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="Username" className={field} />
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-xl border border-[#D5E3F5] py-3 text-sm font-bold text-[#5B6B8C]">
            Cancel
          </button>
          <button type="button" onClick={send} disabled={busy || !target.trim()} className="flex-1 rounded-xl bg-[#1E63D6] py-3 text-sm font-black text-white disabled:opacity-50">
            {busy ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Kept while the app is open: the last numbers show at once (no "Loading…"),
// fresh ones replace them quietly.
const reportMemory = new Map<string, { rows: Row[]; manual: number | null }>();

function Report({ me, refresh }: { me: string; refresh: number }) {
  const [day, setDay] = useState(todayStr);
  const [rows, setRows] = useState<Row[] | null>(() => reportMemory.get(`${me}|${todayStr()}`)?.rows || null);
  const [manualTotal, setManualTotal] = useState<number | null>(() => reportMemory.get(`${me}|${todayStr()}`)?.manual ?? null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const key = `${me}|${day}`;
    const kept = reportMemory.get(key);
    setRows(kept?.rows || null);
    setError("");
    setManualTotal(kept?.manual ?? null);
    // A report migwith entered by hand for this day overrides the total (as in the app).
    getDoc(doc(db, "merchant_reports", me, "days", day))
      .then((s) => {
        const manual = typeof s.get("totalTrail") === "number" ? Number(s.get("totalTrail")) : null;
        const k = reportMemory.get(key);
        if (k) k.manual = manual;
        else reportMemory.set(key, { rows: [], manual });
        if (!cancelled) setManualTotal(manual);
      })
      .catch(() => {});
    const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("Loading took too long. Tap ⟳ to try again.")), 40_000));
    Promise.race([merchantTrailForDay(me, day), timeout])
      .then((r) => {
        reportMemory.set(key, { rows: r, manual: reportMemory.get(key)?.manual ?? null });
        if (!cancelled) setRows(r);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || String(e));
        setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [me, day, refresh]);

  const total = manualTotal ?? (rows || []).reduce((a, r) => a + r.earning, 0);
  const active = (rows || []).filter((r) => r.spend > 0).length;
  const label = new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="space-y-3 px-3 py-3">
      <DateBar day={day} setDay={setDay} gold />
      <>
          {error && <p className="text-xs text-rose-600">⚠ Could not load: {error}</p>}
          <div className="rounded-3xl bg-gradient-to-br from-[#5A8FD6] to-[#2F6ABD] p-4 text-white shadow-lg">
            <p className="text-xs font-bold text-white/80">TOTAL BONUS · {label}</p>
            <p className="text-2xl font-black text-white">🪙 {amount(total)}</p>
            <p className="text-[11px] font-bold text-white/80">2.5% Merchant Bonus</p>
            {rows !== null && total === 0 && <p className="mt-2 rounded-xl bg-white/10 px-3 py-2 text-center text-xs">No bonus on this date</p>}
          </div>
          <div className="rounded-3xl bg-white p-4 text-[#0B2A5B] shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-[#1E63D6]">♟</span>
              <p className="flex-1 font-bold">From my tagged users</p>
              <p className="text-xs font-bold text-[#5B6B8C]">
                {active} active / {(rows || []).length}
              </p>
            </div>
            {rows === null ? (
              // still filling in: a quiet blank
              <div className="h-12" />
            ) : rows.length === 0 ? (
              <p className="mt-2 text-xs text-[#5B6B8C]">No tagged users</p>
            ) : (
              <ul className="mt-2 divide-y divide-[#E3ECF7]">
                {rows.map((r) => (
                  <li key={r.username} className="flex items-center gap-3 py-2">
                    <Avatar name={r.username} size="h-8 w-8" />
                    <div className="min-w-0 flex-1">
                      <p data-notranslate className="truncate text-sm font-bold">@{r.username}</p>
                      <p className="text-xs text-[#5B6B8C]">spend 🪙{amount(r.spend)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[11px] font-bold text-[#1E63D6]">2.5%</p>
                      <p className="text-sm font-bold text-[#16A34A]">🪙{amount(r.earning)}</p>
                    </div>
                  </li>
                ))}
                <li className="flex justify-between pt-2 text-sm font-bold">
                  <span>Total bonus</span>
                  <span className="text-[#16A34A]">🪙{amount(total)}</span>
                </li>
              </ul>
            )}
          </div>
        </>
    </div>
  );
}

