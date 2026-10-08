"use client";

import { useEffect, useState } from "react";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { isMainFounderName } from "../../lib/founder";
import {
  SPECIAL_COLOR_DEFAULT_BDT_RATE,
  SPECIAL_COLOR_METHODS,
  SPECIAL_COLOR_TAKA_METHODS,
  taka,
  SPECIAL_COLOR_SLOTS,
  SPECIAL_COLOR_STYLE_NAMES,
  SPECIAL_COLOR_USD,
  VIP_PLANS,
  vipPlanLabel,
  vipPriceUsd,
  useSpecialColors,
} from "../../lib/specialColor";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { RainbowName } from "../_components/RainbowName";

// Explore › 👑 VIP Subscription, like the app's SpecialEditionColourPage:
// Apply (animation + months) → Payment (method + transaction ID) → Approve
// (miglife, in the secret page). Everything is written by the
// specialColorApply / founderSpecialColor Cloud Functions.

const applyCall = httpsCallable(functions, "specialColorApply");
const statusCall = httpsCallable<void, { applyOpen?: boolean; paymentInfo?: string; bdtRate?: number }>(functions, "specialColorStatus");

type Req = { id: string; months: number; amountUsd: number; method: string; trxId: string; status: string; createdAtMs: number; reason: string };

const fmtDate = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl border border-white/20 bg-white/[0.12] p-3.5">{children}</div>;
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-3 py-[7px] text-xs font-semibold ${
        on ? "bg-gradient-to-r from-[#FF4F8B] to-[#9C5BFF] text-white" : "border border-white/25 bg-white/[0.13] text-[#D7CCFF]"
      }`}
    >
      {label}
    </button>
  );
}

function Pill({ title, value, sub, on }: { title: string; value: string; sub?: string; on?: boolean }) {
  return (
    <div className={`min-w-0 flex-1 rounded-[14px] border p-3 ${on ? "border-[#FF4F8B] bg-[#FF4F8B]/20" : "border-white/20 bg-white/[0.13]"}`}>
      <p className="text-[11px] text-[#B9A8E8]">{title}</p>
      <p className="truncate text-[15px] font-bold text-white">{value}</p>
      {sub && <p className="truncate text-[15px] font-bold text-white">{sub}</p>}
    </div>
  );
}

const input =
  "mt-1.5 w-full rounded-lg border border-white/25 bg-transparent px-3 py-2.5 text-sm text-white outline-none placeholder:text-[#B9A8E8] focus:border-[#FF4F8B]";

export default function SpecialColourPage() {
  const ready = useRequireLogin();
  const { user, username } = useCurrentUser();
  const special = useSpecialColors();
  const uid = user?.uid;
  const [paymentInfo, setPaymentInfo] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [bdtRate, setBdtRate] = useState(SPECIAL_COLOR_DEFAULT_BDT_RATE);
  const [myUntil, setMyUntil] = useState(0);
  const [requests, setRequests] = useState<Req[]>([]);
  const [months, setMonths] = useState(1);
  const [chosen, setChosen] = useState(0);
  const [method, setMethod] = useState("");
  const [trxId, setTrxId] = useState("");
  const [sender, setSender] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!ready) return;
    const offs = [
      onSnapshot(
        doc(db, "app_settings", "special_color"),
        (d) => {
          if (!d.exists()) return;
          setPaymentInfo(String(d.get("paymentInfo") || ""));
          setApplyOpen(d.get("applyOpen") === true);
          const r = Number(d.get("bdtRate") || 0);
          if (r > 0) setBdtRate(r);
        },
        () => {}
      ),
    ];
    if (uid) {
      offs.push(onSnapshot(doc(db, "special_colors", uid), (d) => setMyUntil(Number(d.get("until") || 0)), () => {}));
      offs.push(
        onSnapshot(
          query(collection(db, "special_color_requests"), where("uid", "==", uid)),
          (snap) =>
            setRequests(
              snap.docs
                .map((d) => ({
                  id: d.id,
                  months: Number(d.get("months") || 1),
                  amountUsd: Number(d.get("amountUsd") || 0),
                  method: String(d.get("method") || ""),
                  trxId: String(d.get("trxId") || ""),
                  status: String(d.get("status") || ""),
                  createdAtMs: Number(d.get("createdAtMs") || 0),
                  reason: String(d.get("reason") || ""),
                }))
                .sort((a, b) => b.createdAtMs - a.createdAtMs)
            ),
          () => {}
        )
      );
    }
    // Also ask the server once (works even before the rules let us read it).
    statusCall()
      .then(({ data }) => {
        if (typeof data?.applyOpen === "boolean") setApplyOpen(data.applyOpen);
        if (data?.paymentInfo) setPaymentInfo(data.paymentInfo);
        if (Number(data?.bdtRate) > 0) setBdtRate(Number(data.bdtRate));
      })
      .catch(() => {});
    return () => offs.forEach((f) => f());
  }, [ready, uid]);

  const now = Date.now();
  const isMiglife = isMainFounderName(username);
  const iAmActive = myUntil > now;
  const active = iAmActive || isMiglife;
  const pending = requests.find((r) => r.status === "pending");
  const step = pending ? 3 : method ? 2 : 1;
  const placesLeft = Math.max(0, SPECIAL_COLOR_SLOTS - special.activeCount());
  const taken = special.takenStyles(username);
  const previewStyle = isMiglife ? 0 : iAmActive ? special.styleOf(username) : chosen > 0 ? chosen : 1;
  const canSend = !busy && !!method && trxId.trim().length >= 4 && !!uid && (iAmActive || (chosen > 0 && placesLeft > 0));

  const send = async () => {
    setBusy(true);
    setMsg("");
    try {
      await applyCall({
        months,
        method,
        trxId: trxId.trim(),
        sender: sender.trim(),
        note: note.trim(),
        style: iAmActive ? special.styleOf(username) : chosen,
      });
      setTrxId("");
      setNote("");
      setMsg("✅ Sent! miGlife will check your payment and approve it.");
    } catch (e: any) {
      setMsg(`❌ ${e?.message || "Could not send. Try again."}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageShell light>
      <div className="min-h-screen bg-gradient-to-b from-[#1B0B3A] via-[#2A1260] to-[#12082A] px-4 pb-10 pt-4 text-white">
        <div className="mx-auto max-w-xl">
          <div className="flex items-center gap-2">
            <BackButton variant="dark" href="/explore" />
            <div>
              <h1 className="text-[21px] font-extrabold">VIP Subscription</h1>
              <p className="text-[11px] tracking-[1.5px] text-[#FFD86B]">THE MIGLIFE RAINBOW NAME</p>
            </div>
          </div>

          {/* Preview: your own name in the moving rainbow */}
          <div className="mt-4 rounded-[20px] bg-gradient-to-br from-[#FFE08A] via-[#FF4F8B] to-[#3AA0E0] p-[3px] shadow-[0_6px_20px_rgba(156,91,255,.5)]">
            <div className="rounded-[17px] bg-[#0E0820] px-4 py-[22px] text-center">
              <p className="text-xs text-[#B9A8E8]">Your name in the room</p>
              <p className="mt-1.5">
                <RainbowName name={username || "miglife"} style={previewStyle} className="text-[30px]" />
                <span className="text-lg text-[#E8E2FF]">: hello everyone 👋</span>
              </p>
              <p className="mt-2.5 text-xs text-[#B9A8E8]">
                Only 5 people can have it — each one gets their own rainbow animation. Pictures and voice can always be shared in rooms.
              </p>
            </div>
          </div>

          <div className="mt-3.5 flex gap-2.5">
            <Pill title="💵 Price" value={`from $${SPECIAL_COLOR_USD} / mo`} sub={taka(SPECIAL_COLOR_USD, bdtRate)} />
            <Pill title="🎟 Places left" value={`${placesLeft} / ${SPECIAL_COLOR_SLOTS}`} on={placesLeft > 0} />
            <Pill
              title="📅 Your colour"
              value={isMiglife ? "Always on" : iAmActive ? `Until ${fmtDate(myUntil)}` : myUntil > 0 ? "Expired" : "Not active"}
              on={active}
            />
          </div>

          <div className="mt-2.5">
            <Card>
              <p className="text-[15px] font-bold">What you get</p>
              <p className="mt-1 whitespace-pre-line text-[13px] leading-5 text-[#E8E2FF]">
                {"🌈 Your own rainbow animation on your name (rooms + profile)\n🖼 Picture sharing in every room\n🎤 Voice sharing in every room\n👑 Only 5 people at a time — no two have the same animation"}
              </p>
            </Card>
          </div>

          {/* Steps: Apply → Payment → Approve */}
          <div className="mt-4 flex items-center">
            {["Apply", "Payment", "Approve"].map((label, i) => (
              <div key={label} className={`flex items-center ${i < 2 ? "flex-1" : ""}`}>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-bold ${step > i ? "bg-[#FF4F8B]" : "bg-[#3A2A66]"}`}
                >
                  {i + 1}
                </span>
                <span className={`ml-1.5 text-[13px] font-semibold ${step > i ? "text-white" : "text-[#8E7FC0]"}`}>{label}</span>
                {i < 2 && <span className={`mx-1.5 h-0.5 flex-1 ${step > i + 1 ? "bg-[#FF4F8B]" : "bg-[#3A2A66]"}`} />}
              </div>
            ))}
          </div>

          <div className="mt-3.5 space-y-2.5">
            {isMiglife ? (
              <Card>
                <p className="text-sm">👑 You are miGlife — the rainbow name is always yours.</p>
              </Card>
            ) : pending ? (
              <Card>
                <p className="text-base font-bold text-[#FFD86B]">⏳ Waiting for approval</p>
                <p className="mt-1.5 whitespace-pre-line text-[13px] text-[#E8E2FF]">
                  {`${pending.months} month(s) · $${pending.amountUsd} · ${pending.method} · Trx ${pending.trxId}\nmiGlife will check your payment and turn your rainbow name on. You will get an alert.`}
                </p>
              </Card>
            ) : !applyOpen ? (
              <Card>
                <p className="text-base font-bold text-[#FFD86B]">🔒 Applications are closed right now</p>
                <p className="mt-1 text-[13px] text-[#E8E2FF]">miGlife will open it again soon — check back later.</p>
              </Card>
            ) : (
              <>
                {!iAmActive && placesLeft === 0 && (
                  <Card>
                    <p className="text-[15px] font-bold text-[#FFD86B]">😔 All 5 places are taken right now.</p>
                    <p className="text-[13px] text-[#E8E2FF]">Come back when someone&apos;s month ends.</p>
                  </Card>
                )}
                <Card>
                  <p className="text-[15px] font-bold">① Choose your animation</p>
                  {iAmActive ? (
                    <p className="mt-1 text-xs text-[#B9A8E8]">
                      Yours: {SPECIAL_COLOR_STYLE_NAMES[special.styleOf(username)] || ""} (stays the same when you renew)
                    </p>
                  ) : (
                    <div className="mt-1 space-y-1.5">
                      {[1, 2, 3, 4, 5].map((st) => {
                        const isTaken = taken.has(st);
                        return (
                          <button
                            key={st}
                            type="button"
                            disabled={isTaken}
                            onClick={() => setChosen(st)}
                            className={`flex w-full items-center rounded-xl border px-3 py-2 text-left ${
                              chosen === st ? "border-[#FF4F8B] bg-[#FF4F8B]/20" : "border-white/15 bg-white/[0.08]"
                            }`}
                          >
                            <span className={`flex-1 text-[13px] ${isTaken ? "text-[#6E6290]" : "text-white"}`}>{SPECIAL_COLOR_STYLE_NAMES[st]}</span>
                            {isTaken ? (
                              <span className="text-xs text-[#8E7FC0]">Taken</span>
                            ) : (
                              <RainbowName name={username || "miglife"} style={st} className="text-[17px]" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <p className="mt-3 text-[15px] font-bold">Choose your plan</p>
                  {/* 2 × 2 so the longer labels fit on small phones */}
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {VIP_PLANS.map((m) => (
                      <Chip key={m} label={`${vipPlanLabel(m)} · $${vipPriceUsd(m)}`} on={months === m} onClick={() => setMonths(m)} />
                    ))}
                  </div>
                  {active && (
                    <p className="mt-1.5 text-[11px] text-[#B9A8E8]">
                      Your colour is still on — the new months are added after {fmtDate(myUntil)}.
                    </p>
                  )}
                </Card>
                <Card>
                  <p className="text-[15px] font-bold">② Payment — send ${vipPriceUsd(months)}</p>
                  {/* How much to send, in each currency */}
                  <div className="mt-1.5 rounded-xl border border-[#FF4F8B]/35 bg-gradient-to-r from-[#FF4F8B]/20 to-[#9C5BFF]/20 p-3">
                    <p className="text-[11px] text-[#B9A8E8]">Amount to send</p>
                    <p className="flex flex-wrap items-end gap-x-2">
                      <span className="text-[26px] font-extrabold leading-8">{taka(vipPriceUsd(months), bdtRate)}</span>
                      <span className="pb-1 text-[11px] text-[#E8E2FF]">bKash · Nagad · Rocket · Bank</span>
                    </p>
                    <p className="text-sm font-bold text-[#FFD86B]">${vipPriceUsd(months)} USD · Binance · PayPal</p>
                    <p className="text-[11px] text-[#B9A8E8]">
                      1 USD = ৳{bdtRate} · {vipPlanLabel(months)} plan. Send exactly this amount (your bKash/Nagad fee is extra).
                    </p>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap rounded-[10px] bg-[#FFD86B]/15 p-2.5 text-[13px] text-[#FFE9A8]">
                    {paymentInfo || "Payment details will be shown here. Ask miGlife how to pay."}
                  </p>
                  <p className="mt-2.5 text-xs text-[#B9A8E8]">How did you pay?</p>
                  <div className="no-scrollbar mt-1.5 flex gap-2 overflow-x-auto">
                    {SPECIAL_COLOR_METHODS.map((m) => (
                      <Chip key={m} label={m} on={method === m} onClick={() => setMethod(m)} />
                    ))}
                  </div>
                  <input className={input} value={trxId} maxLength={80} onChange={(e) => setTrxId(e.target.value)} placeholder="Transaction ID" />
                  <input className={input} value={sender} maxLength={80} onChange={(e) => setSender(e.target.value)} placeholder="Your number / account (sender)" />
                  <input className={input} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
                </Card>
                <button
                  type="button"
                  disabled={!canSend}
                  onClick={send}
                  className="h-[50px] w-full rounded-[14px] bg-[#FF4F8B] text-[15px] font-extrabold text-white disabled:bg-[#4A3A78]"
                >
                  {busy
                    ? "Sending…"
                    : `③ SEND FOR APPROVAL · ${
                        SPECIAL_COLOR_TAKA_METHODS.has(method) ? taka(vipPriceUsd(months), bdtRate) : `$${vipPriceUsd(months)}`
                      }`}
                </button>
              </>
            )}
            {msg && <p className="text-[13px]">{msg}</p>}
          </div>

          {requests.some((r) => r.status !== "pending") && (
            <div className="mt-4">
              <p className="text-[11px] font-bold tracking-[1px] text-[#FFD86B]">YOUR REQUESTS</p>
              {requests
                .filter((r) => r.status !== "pending")
                .slice(0, 10)
                .map((r) => (
                  <p key={r.id} className="py-[3px] text-xs text-[#E8E2FF]">
                    {r.status === "approved" ? "✅" : "❌"} {fmtDate(r.createdAtMs)} · {r.months} mo · ${r.amountUsd} · {r.method}
                    {r.status === "rejected" && r.reason ? ` · ${r.reason}` : ""}
                  </p>
                ))}
            </div>
          )}
        </div>
      </div>
    </PageShell>
  );
}
