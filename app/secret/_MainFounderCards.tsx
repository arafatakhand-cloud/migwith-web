"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useLuxuryBetAccess } from "../_components/LuxuryBet";
import { input } from "./_Shell";
import { RainbowName } from "../_components/RainbowName";
import { SPECIAL_COLOR_DEFAULT_BDT_RATE, SPECIAL_COLOR_SLOTS, SPECIAL_COLOR_STYLE_NAMES, SPECIAL_COLOR_USD, taka, vipPriceUsd } from "../../lib/specialColor";

// miglife-only cards of the app's "miglife secret" page: the one-time new
// level curve step, Security Question Reset and the 🎰 Luxury Bet section
// (Access · Level · Schedule). Everything runs through the Cloud Functions.

const migrateLevelCurveV2 = httpsCallable<void, { changed?: number; scanned?: number; alreadyDone?: boolean }>(
  functions,
  "migrateLevelCurveV2"
);
const founderResetSecurityQuestion = httpsCallable<{ username: string }, { username?: string; hadQuestion?: boolean }>(
  functions,
  "founderResetSecurityQuestion"
);
const founderLuxuryBetAccess = httpsCallable<Record<string, unknown>, { username?: string }>(functions, "founderLuxuryBetAccess");
type LevelInfo = {
  level?: number;
  activeLevel?: number;
  activeName?: string;
  activeSource?: string;
  activeScheduleId?: string;
  schedules?: { id: string; level: number; daily: boolean; date: string; from: string; to: string }[];
};
const founderLuxuryBetLevel = httpsCallable<Record<string, unknown>, LevelInfo>(functions, "founderLuxuryBetLevel");

const OK = "#1E7A3C";
const BAD = "#E5484D";

function Message({ text, failed }: { text: string | null; failed: boolean }) {
  if (!text) return null;
  return (
    <p className="text-[13px] font-semibold" style={{ color: failed ? BAD : OK }}>
      {text}
    </p>
  );
}

const errText = (e: any) => `Failed: ${e?.message || "unknown error"}`;

/** 🔁 New level curve (after Lv.40) — run ONCE; IDs above Lv.40 keep their level. */
export function LevelCurveCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-2 rounded-[18px] border border-[#E0A82E] bg-white p-4">
      <p className="text-[14px] font-bold">🔁 New level curve (after Lv.40)</p>
      <p className="text-xs text-gray-500">Run ONCE right after publishing the new rules and functions. IDs above Lv.40 keep their level.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg(null);
          setFailed(false);
          migrateLevelCurveV2()
            .then(({ data }) =>
              setMsg(
                data?.alreadyDone
                  ? "✅ Already done earlier — nothing changed."
                  : `✅ Done: ${Number(data?.changed || 0)} of ${Number(data?.scanned || 0)} IDs updated.`
              )
            )
            .catch((e) => {
              setFailed(true);
              setMsg(errText(e));
            })
            .finally(() => setBusy(false));
        }}
        className="w-full rounded-xl bg-[#1E63D6] py-2.5 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Working…" : "APPLY NEW CURVE"}
      </button>
      <Message text={msg} failed={failed} />
    </div>
  );
}

/** 🔐 Security Question Reset — removes an ID's question + answer. */
export function SecurityQuestionResetCard() {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const who = target.trim().replace(/^@/, "").trim();
  return (
    <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#7C4DFF] bg-white p-4">
      <p className="text-[17px] font-extrabold">🔐 Security Question Reset</p>
      <p className="text-xs text-gray-500">Removes an ID&apos;s Security Question and Answer so they can set a new one.</p>
      <input
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          setMsg(null);
        }}
        placeholder="MIG ID"
        disabled={busy}
        className={input}
      />
      <button
        type="button"
        disabled={busy || !who}
        onClick={() => setConfirm(true)}
        className="w-full rounded-xl bg-[#7C4DFF] py-2.5 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Resetting…" : "RESET"}
      </button>
      <Message text={msg} failed={failed} />
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-3" onClick={() => setConfirm(false)}>
          <div className="w-full max-w-sm space-y-3 rounded-3xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-bold">Reset Security Question?</p>
            <p className="text-sm">@{who}&apos;s Security Question and Answer will be removed. They will need to set a new one.</p>
            <div className="flex justify-end gap-4">
              <button type="button" onClick={() => setConfirm(false)} className="font-bold text-[#2F80ED]">
                Cancel
              </button>
              <button
                type="button"
                className="font-bold"
                style={{ color: BAD }}
                onClick={() => {
                  setConfirm(false);
                  setBusy(true);
                  setMsg(null);
                  setFailed(false);
                  founderResetSecurityQuestion({ username: who })
                    .then(({ data }) => {
                      const name = data?.username || who;
                      setMsg(data?.hadQuestion ? `✅ @${name}: Security Question reset.` : `✅ @${name} had no Security Question — cleared anyway.`);
                      setTarget("");
                    })
                    .catch((e) => {
                      setFailed(true);
                      setMsg(errText(e));
                    })
                    .finally(() => setBusy(false));
                }}
              >
                RESET
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const LEVELS: [number, string, string][] = [
  [1, "Easy", "RTP ~135% · win ~38%"],
  [2, "Medium Easy", "RTP ~119% · win ~35%"],
  [3, "Normal Medium", "RTP ~110% · win ~31%"],
  [4, "Medium", "RTP ~99% · win ~27%"],
  [5, "Medium Hard", "RTP ~90% · win ~22%"],
  [6, "Hard", "RTP ~74% · win ~22%"],
  [7, "Very Hard", "RTP ~60% · win ~17%"],
];
const levelName = (n: number) => LEVELS.find(([k]) => k === n)?.[1] ?? "?";

function hm12(hm: string): string {
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h)) return hm;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m || 0).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}

/** 🎰 Luxury Bet Access — who sees the room while it is being tested. */
export function LuxuryBetAccessCard() {
  const { user } = useCurrentUser();
  const access = useLuxuryBetAccess(user?.uid);
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const who = target.trim().replace(/^@/, "").trim();

  const call = (args: Record<string, unknown>, done: (d: { username?: string } | undefined) => string) => {
    setBusy(true);
    setMsg(null);
    setFailed(false);
    founderLuxuryBetAccess(args)
      .then(({ data }) => setMsg(done(data)))
      .catch((e) => {
        setFailed(true);
        setMsg(errText(e));
      })
      .finally(() => setBusy(false));
  };

  const listed = access.uids.map((u) => access.names[u] || u).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  return (
    <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#B8860B] bg-white p-4">
      <p className="text-[17px] font-extrabold">🎰 Luxury Bet Access</p>
      <p className="text-xs" style={{ color: access.open ? OK : "#6B7280" }}>
        {access.open ? "OPEN — everyone sees the room now." : "Testing — only the IDs below can see and play the room."}
      </p>
      <input
        value={target}
        onChange={(e) => {
          setTarget(e.target.value);
          setMsg(null);
        }}
        placeholder="MIG ID"
        disabled={busy}
        className={input}
      />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !who}
          onClick={() =>
            call({ action: "add", username: who }, (d) => {
              setTarget("");
              return `✅ @${d?.username || who} can now see Luxury Bet.`;
            })
          }
          className="flex-1 rounded-xl bg-[#2EC27E] py-2.5 font-extrabold text-white disabled:opacity-50"
        >
          ADD
        </button>
        <button
          type="button"
          disabled={busy || !who}
          onClick={() =>
            call({ action: "remove", username: who }, (d) => {
              setTarget("");
              return `✅ @${d?.username || who} removed.`;
            })
          }
          className="flex-1 rounded-xl bg-[#E5484D] py-2.5 font-extrabold text-white disabled:opacity-50"
        >
          REMOVE
        </button>
      </div>
      <p className="text-[13px]">{listed.length === 0 ? "No one added yet." : `Can see (${listed.length}): ${listed.join(", ")}`}</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const openNow = !access.open;
          call({ action: "open", open: openNow }, () =>
            openNow ? "✅ Luxury Bet is now open for everyone." : "✅ Back to testing — only listed IDs see it."
          );
        }}
        className="w-full rounded-xl border border-[#C9D3E3] py-2.5 font-bold disabled:opacity-50"
      >
        {access.open ? "CLOSE (only listed IDs)" : "OPEN FOR EVERYONE"}
      </button>
      <Message text={msg} failed={failed} />
    </div>
  );
}

export function LuxuryBetLevelCard() {
  const [info, setInfo] = useState<LevelInfo>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [scLevel, setScLevel] = useState(6);
  const [scDaily, setScDaily] = useState(false);
  const [scDate, setScDate] = useState("");
  const [scFrom, setScFrom] = useState("");
  const [scTo, setScTo] = useState("");

  const call = useCallback((args: Record<string, unknown>, okText: string | null) => {
    setBusy(true);
    setFailed(false);
    founderLuxuryBetLevel(args)
      .then(({ data }) => {
        setInfo(data || {});
        setMsg(okText);
      })
      .catch((e) => {
        setFailed(true);
        setMsg(errText(e));
      })
      .finally(() => setBusy(false));
  }, []);

  useEffect(() => call({ action: "get" }, null), [call]);

  const current = Number(info.level || 0);
  const schedules = info.schedules || [];
  const running =
    info.activeSource === "schedule"
      ? `▶ Running now: ${info.activeLevel}. ${info.activeName} (by schedule)`
      : info.activeSource === "manual"
        ? `▶ Running now: ${info.activeLevel}. ${info.activeName}`
        : "▶ Running now: Luxury Bot settings (no level selected)";

  return (
    <div className="space-y-1.5 rounded-[18px] border-[1.5px] border-[#B8860B] bg-white p-4">
      <p className="text-[17px] font-extrabold">🎚️ Luxury Bet Level</p>
      <p className="text-[13px] font-bold" style={{ color: OK }}>
        {running}
      </p>
      <p className="text-[11px] text-gray-500">Payout is fixed for every level: 100 coins on 2x → 270 coins.</p>
      <p className="text-[13px] font-semibold">Normal level (when no schedule is on):</p>
      {LEVELS.map(([num, name, sub]) => {
        const selected = num === current;
        return (
          <button
            key={num}
            type="button"
            disabled={busy || selected}
            onClick={() => call({ action: "set", level: num }, `✅ Normal level: ${num}. ${name}`)}
            className="flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left"
            style={{ background: selected ? "rgba(184,134,11,.18)" : "transparent", borderColor: selected ? "#B8860B" : "rgba(128,128,128,.35)" }}
          >
            <span style={{ color: selected ? "#B8860B" : "#9CA3AF" }}>{selected ? "●" : "○"}</span>
            <span className="flex-1">
              <span className={`block text-sm ${selected ? "font-extrabold" : "font-semibold"}`}>
                {num}. {name}
              </span>
              <span className="block text-[11px] text-gray-500">{sub}</span>
            </span>
          </button>
        );
      })}

      <p className="pt-1.5 text-[15px] font-extrabold">⏰ Schedule (Bangladesh time)</p>
      {schedules.length === 0 && <p className="text-xs text-gray-500">No schedule yet.</p>}
      {schedules.map((sc) => {
        const on = !!sc.id && sc.id === info.activeScheduleId;
        return (
          <div
            key={sc.id}
            className="flex items-center rounded-xl border py-1.5 pl-3 pr-1"
            style={{ background: on ? "rgba(46,194,126,.14)" : "transparent", borderColor: on ? "#2EC27E" : "rgba(128,128,128,.35)" }}
          >
            <span className="flex-1">
              <span className="block text-[13px] font-bold">
                {sc.level}. {levelName(sc.level)}
                {on ? "  ● ON NOW" : ""}
              </span>
              <span className="block text-xs text-gray-500">
                {sc.daily ? "Every day" : sc.date} · {hm12(sc.from)} – {hm12(sc.to)}
              </span>
            </span>
            <button
              type="button"
              disabled={busy}
              onClick={() => call({ action: "removeSchedule", id: sc.id }, "✅ Schedule deleted.")}
              className="px-3 text-base font-bold"
              style={{ color: BAD }}
              aria-label="Delete schedule"
            >
              ✕
            </button>
          </div>
        );
      })}

      <p className="text-[13px] font-semibold">Add a schedule:</p>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {LEVELS.map(([num, name]) => (
          <button
            key={num}
            type="button"
            onClick={() => setScLevel(num)}
            className="shrink-0 rounded-full px-2.5 py-1.5 text-xs font-semibold"
            style={{ background: num === scLevel ? "#B8860B" : "rgba(128,128,128,.15)", color: num === scLevel ? "#fff" : undefined }}
          >
            {num}. {name}
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 text-[13px]">
        <input type="checkbox" checked={scDaily} onChange={(e) => setScDaily(e.target.checked)} />
        Every day
      </label>
      <div className="flex gap-1.5">
        {!scDaily && (
          <label className="flex-1 text-[11px] text-gray-500">
            📅 Date
            <input type="date" value={scDate} onChange={(e) => setScDate(e.target.value)} className={input} />
          </label>
        )}
        <label className="flex-1 text-[11px] text-gray-500">
          From
          <input type="time" value={scFrom} onChange={(e) => setScFrom(e.target.value)} className={input} />
        </label>
        <label className="flex-1 text-[11px] text-gray-500">
          To
          <input type="time" value={scTo} onChange={(e) => setScTo(e.target.value)} className={input} />
        </label>
      </div>
      <button
        type="button"
        disabled={busy || !scFrom || !scTo || (!scDaily && !scDate)}
        onClick={() =>
          call(
            { action: "addSchedule", level: scLevel, daily: scDaily, date: scDate, from: scFrom, to: scTo },
            `✅ Schedule added: ${scLevel}. ${levelName(scLevel)}, ${scDaily ? "every day" : scDate} ${hm12(scFrom)} – ${hm12(scTo)}`
          )
        }
        className="w-full rounded-xl bg-[#2EC27E] py-2.5 font-extrabold text-white disabled:opacity-50"
      >
        ADD SCHEDULE
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => call({ action: "get" }, null)}
        className="w-full rounded-xl border border-[#C9D3E3] py-2.5 font-bold disabled:opacity-50"
      >
        ↻ Refresh
      </button>
      <Message text={msg} failed={failed} />
    </div>
  );
}

/** 📲 Android app download link — app_settings/invite.downloadUrl, the same link
 *  the app's Share Invite uses; the web's "Download Android App" button reads it. */
export function AppDownloadLinkCard() {
  const [saved, setSaved] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "invite"),
        (s) => {
          const v = String(s.get("downloadUrl") || "");
          setSaved(v);
          setLink((cur) => cur || v);
        },
        () => {}
      ),
    []
  );
  const clean = link.trim();
  const ok = /^https?:\/\/\S+$/i.test(clean);
  return (
    <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#34A853] bg-white p-4">
      <p className="text-[17px] font-extrabold">📲 Android App Download Link</p>
      <p className="text-xs text-gray-500">
        Shared by the app&apos;s Invite Friends. The web&apos;s &quot;Download Android App&quot; button uses the direct APK (app_config/latest
        apkUrl, same as the app&apos;s Update page) and falls back to this link only when there is no APK link.
      </p>
      <input
        value={link}
        onChange={(e) => {
          setLink(e.target.value);
          setMsg(null);
        }}
        placeholder="https://..."
        inputMode="url"
        disabled={busy}
        className={input}
      />
      <button
        type="button"
        disabled={busy || !ok || clean === saved}
        onClick={() => {
          setBusy(true);
          setMsg(null);
          setFailed(false);
          setDoc(doc(db, "app_settings", "invite"), { downloadUrl: clean }, { merge: true })
            .then(() => setMsg("✅ Saved — the download button now uses this link."))
            .catch((e) => {
              setFailed(true);
              setMsg(errText(e));
            })
            .finally(() => setBusy(false));
        }}
        className="w-full rounded-xl bg-[#34A853] py-2.5 font-extrabold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "SAVE LINK"}
      </button>
      {saved && (
        <a href={saved} target="_blank" rel="noopener noreferrer" className="block truncate text-xs font-semibold text-[#1E63D6] underline">
          Current: {saved}
        </a>
      )}
      <Message text={msg} failed={failed} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 🌈 VIP Subscription (approve / reject / turn off), like the app's
// FounderSpecialColorCard. Everything goes through founderSpecialColor.
// ---------------------------------------------------------------------------
const founderSpecialColor = httpsCallable<Record<string, unknown>, Record<string, any>>(functions, "founderSpecialColor");
type SpecialRow = Record<string, any>;
const spDate = (ms: number) =>
  new Date(ms).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

export function FounderSpecialColorCard() {
  const [pending, setPending] = useState<SpecialRow[]>([]);
  const [active, setActive] = useState<SpecialRow[]>([]);
  const [paymentInfo, setPaymentInfo] = useState("");
  const [applyOpen, setApplyOpen] = useState(false);
  const [rate, setRate] = useState(String(SPECIAL_COLOR_DEFAULT_BDT_RATE));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Live updates when the rules let us read app_settings; otherwise the
  // values from the server (reload) are kept.
  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "special_color"),
        (d) => {
          if (d.exists()) setApplyOpen(d.get("applyOpen") === true);
        },
        () => {}
      ),
    []
  );

  const call = useCallback(async (args: Record<string, unknown>) => {
    try {
      return (await founderSpecialColor(args)).data;
    } catch (e) {
      setFailed(true);
      setMsg(`❌ ${(e as any)?.message || "failed"}`);
      return null;
    }
  }, []);
  const reload = useCallback(async () => {
    const d = await call({ action: "list" });
    if (!d) return;
    // The saved ON/OFF, rate and payment text come from the server — what users really see.
    if (typeof d.applyOpen === "boolean") setApplyOpen(d.applyOpen);
    if (Number(d.bdtRate) > 0) setRate(String(Number(d.bdtRate)));
    if (typeof d.paymentInfo === "string") setPaymentInfo((cur) => (d.paymentInfo || !cur ? d.paymentInfo : cur));
    setPending(Array.isArray(d.pending) ? d.pending : []);
    setActive(Array.isArray(d.active) ? d.active : []);
  }, [call]);
  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (args: Record<string, unknown>, ok: string, again = true) => {
    setBusy(true);
    setFailed(false);
    setMsg(null);
    const r = await call(args);
    if (r) setMsg(ok);
    if (again) await reload();
    setBusy(false);
    return r;
  };

  return (
    <div className="space-y-2 rounded-[18px] border-[1.5px] border-[#FF4F8B] bg-white p-4">
      <p className="text-[17px]">
        🌈 <RainbowName name="VIP Subscription" />
      </p>
      <p className="text-xs text-gray-500">
        $49 / 1 mo · $139 / 3 mo · $249 / 6 mo · $399 / 1 year · only {SPECIAL_COLOR_SLOTS} people, each with their own animation · picture + voice sharing. Check the
        payment, then Approve.
      </p>

      <div className={`flex items-center rounded-xl px-3 py-2 ${applyOpen ? "bg-[#1E9E55]/10" : "bg-[#C0123C]/10"}`}>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold">{applyOpen ? "🟢 Applications ON" : "🔴 Applications OFF"}</p>
          <p className="text-[11px] text-gray-500">{applyOpen ? "People can apply now." : "Nobody can apply. Existing colours keep working."}</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={applyOpen}
          disabled={busy}
          onClick={async () => {
            const r = await run({ action: "setOpen", open: !applyOpen }, applyOpen ? "Applications OFF — saved" : "✅ Applications ON — saved", false);
            if (r) setApplyOpen(typeof r.open === "boolean" ? r.open : !applyOpen);
          }}
          className={`relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-50 ${applyOpen ? "bg-[#1E9E55]" : "bg-gray-300"}`}
        >
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${applyOpen ? "left-6" : "left-1"}`} />
        </button>
      </div>

      {/* Taka rate for bKash / Nagad / Rocket / Bank */}
      <p className="text-[13px] font-bold">Dollar rate (taka per 1 USD)</p>
      <div className="flex items-center gap-2">
        <input
          className={`${input} w-[120px]`}
          inputMode="decimal"
          value={rate}
          onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, "").slice(0, 6))}
          placeholder="৳ per 1 USD"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const r = Number(rate);
            if (!rate || !Number.isFinite(r)) {
              setFailed(true);
              setMsg("Write a number, e.g. 123");
              return;
            }
            run({ action: "setRate", rate: r }, `✅ Rate saved: 1 USD = ৳${rate} · $49 = ${taka(SPECIAL_COLOR_USD, r)}`, false);
          }}
          className="rounded-xl bg-[#1E9E55] px-4 py-2.5 font-bold text-white disabled:opacity-50"
        >
          SAVE RATE
        </button>
      </div>
      {Number(rate) > 0 && (
        <p className="text-[11px] text-gray-500">
          Users will see: 1 month = {taka(vipPriceUsd(1), Number(rate))} · 3 months = {taka(vipPriceUsd(3), Number(rate))} · 1 year ={" "}
          {taka(vipPriceUsd(12), Number(rate))}
        </p>
      )}

      <p className="text-[13px] font-bold">Where to pay (shown to users)</p>
      <textarea
        className={`${input} min-h-[64px]`}
        value={paymentInfo}
        maxLength={1000}
        onChange={(e) => setPaymentInfo(e.target.value)}
        placeholder="e.g. bKash 01XXXXXXXXX (Personal) · Binance UID 12345678"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => run({ action: "setPaymentInfo", paymentInfo }, "✅ Saved", false)}
        className="rounded-xl bg-[#9C5BFF] px-4 py-2 font-bold text-white disabled:opacity-50"
      >
        SAVE PAYMENT DETAILS
      </button>

      <p className="text-sm font-bold">Waiting ({pending.length})</p>
      {pending.length === 0 && <p className="text-xs text-gray-500">No requests waiting.</p>}
      {pending.map((r) => (
        <div key={r.id} className="rounded-xl bg-[#FF4F8B]/10 p-2.5">
          <p className="text-sm font-bold">
            {r.username} · {r.months} month(s) · ${r.amountUsd}
            {Number(r.amountBdt) > 0 ? ` (৳${Number(r.amountBdt)})` : ""} · {SPECIAL_COLOR_STYLE_NAMES[Number(r.style) || 0] || ""}
          </p>
          <p className="whitespace-pre-line text-xs text-gray-500">
            {`${r.method} · Trx ${r.trxId}${r.sender ? ` · from ${r.sender}` : ""}${r.note ? `\n“${r.note}”` : ""}\n${spDate(Number(r.createdAtMs) || 0)}`}
          </p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ action: "approve", id: r.id }, `✅ ${r.username} approved`)}
              className="rounded-[10px] bg-[#1E9E55] px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ action: "reject", id: r.id, reason: "Payment not found" }, `Rejected ${r.username}`)}
              className="rounded-[10px] bg-[#C0123C] px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Reject
            </button>
          </div>
        </div>
      ))}

      <p className="text-sm font-bold">
        Active ({active.length} / {SPECIAL_COLOR_SLOTS} places)
      </p>
      {active.map((a) => (
        <div key={a.uid} className="flex items-center">
          <div className="min-w-0 flex-1">
            <RainbowName name={String(a.username || "")} style={Number(a.style) || 1} className="text-[15px]" />
            <p className="text-[11px] text-gray-500">
              {SPECIAL_COLOR_STYLE_NAMES[Number(a.style) || 0] || ""} · until {spDate(Number(a.until) || 0)}
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => run({ action: "revoke", uid: a.uid }, `Turned off ${a.username}`)}
            className="rounded-lg p-2 text-xs font-bold text-[#C0123C] disabled:opacity-50"
          >
            Turn off
          </button>
        </div>
      ))}
      <Message text={msg} failed={failed} />
    </div>
  );
}

// 🔒 One-time privacy move — miglife only. Runs migrateUserPrivacy again and
// again until every account's real email + push token is off the public
// profile (in a private store only the server reads). Safe to run twice.
const migrateUserPrivacy = httpsCallable<{ cursor: string }, { done?: boolean; cursor?: string; moved?: number; scanned?: number }>(
  functions,
  "migrateUserPrivacy",
  { timeout: 540_000 }
);

export function PrivateEmailsCard() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const run = async () => {
    setRunning(true);
    setStatus("Working…");
    let moved = 0;
    let scanned = 0;
    let cursor = "";
    try {
      for (;;) {
        const r = (await migrateUserPrivacy({ cursor })).data || {};
        moved += Number(r.moved || 0);
        scanned += Number(r.scanned || 0);
        if (r.done) {
          setStatus(`✅ Done — ${scanned} accounts checked, ${moved} moved.`);
          break;
        }
        cursor = String(r.cursor || "");
        setStatus(`… ${scanned} accounts checked so far`);
      }
    } catch (e: any) {
      setStatus(`⚠ ${e?.message || "Failed"} — tap again to continue.`);
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="space-y-2.5 rounded-[18px] bg-white p-4 shadow-md">
      <p className="text-[13px] text-[#0B2A5B]">
        Moves every user&apos;s real email and push token off the public profile into a private store only the server can read. Safe to run more than once.
      </p>
      {status && <p className="text-xs text-[#5B6B8C]">{status}</p>}
      <button type="button" disabled={running} onClick={run} className="w-full rounded-xl bg-[#37474F] py-3 text-sm font-bold text-white disabled:opacity-50">
        {running ? "Moving…" : "🔒 Move emails & tokens to private"}
      </button>
    </div>
  );
}
