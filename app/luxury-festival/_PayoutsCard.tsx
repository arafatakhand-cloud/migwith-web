"use client";

import { useEffect, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";

// 💎🏆 miglife only (Luxury Festival page): the festival's payouts, all paid
// from miglife's balance by the functions (luxuryFestivalPayouts /
// luxuryFestivalDailyCommission) — when the balance is not enough, the missing
// coins are added to miglife first. For each place #1 … #25 miglife sets:
//   • Prize      — coins, 10 minutes after the festival ends
//   • Total %    — commission on that player's festival Total Spent (same time)
//   • Daily %    — extra commission every night 12:00 on the days miglife
//                  picks (From … To), on what they spent in Luxury Bet that day
// Only the places in use are shown; "＋ Add" brings the next one with the
// row above copied in. One ON / OFF switch for all, and Reset (danger zone).
//
// ⚙️ Festival controls: everything miglife sets sits in ONE small box (like
// the Ludo box) in the Community look — one line when closed (＋), and when
// open (－) three tabs: 🕒 Time · 🏆 Prizes · 📅 Daily %.

const ceoResetLuxuryFestival = httpsCallable<
  Record<string, never>,
  { ok: boolean }
>(functions, "ceoResetLuxuryFestival");
const MEDAL = ["🥇", "🥈", "🥉"];
const PLACES = 25;
const OPEN_KEY = "migwith.lfControlsOpen";
const ACCENT = "#7B5CF0";
type Tab = "time" | "prizes" | "daily";
type Row = { prize: string; endPct: string; dailyPct: string };
const EMPTY: Row = { prize: "", endPct: "", dailyPct: "" };
const toText = (v: unknown) => (Number(v) > 0 ? String(Number(v)) : "");
const filled = (r: Row) => !!(r.prize || r.endPct || r.dailyPct);
const coins = (n: number) => n.toLocaleString();
const shortDay = (d: string) =>
  d
    ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, {
        day: "numeric",
        month: "short",
      })
    : "";

export function FestivalControls({
  onReset,
  status,
  timePanel,
}: {
  onReset: () => void;
  /** live / soon / ended / none / loading */
  status: string;
  /** the festival time editor (start, end, save) — kept on the page */
  timePanel: React.ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("prizes");
  const [on, setOn] = useState(false);
  const [rows, setRows] = useState<Row[]>(() =>
    Array.from({ length: PLACES }, () => ({ ...EMPTY })),
  );
  // how many places are shown (the used ones, at least 3)
  const [shown, setShown] = useState(3);
  const [dailyFrom, setDailyFrom] = useState("");
  const [dailyTo, setDailyTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [dirty, setDirty] = useState(false);
  const [dangerOpen, setDangerOpen] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  // ＋ / － : small (one line) or open; this browser remembers it (small first)
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem(OPEN_KEY) === "1");
    } catch {
      // storage blocked → small
    }
  }, []);
  const toggleOpen = () =>
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? "0" : "1");
      } catch {
        // storage blocked
      }
      return !o;
    });

  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "luxury_festival_admin"),
        (s) => {
          if (dirty) return; // don't overwrite what miglife is typing
          const list = (k: string) => (s.get(k) as unknown[]) || [];
          const p = list("prizes"),
            e = list("endPcts"),
            dd = list("dailyPcts");
          const next = Array.from({ length: PLACES }, (_, i) => ({
            prize: toText(p[i]),
            endPct: toText(e[i]),
            dailyPct: toText(dd[i]),
          }));
          setRows(next);
          const last = next.map(filled).lastIndexOf(true);
          setShown(Math.max(3, last + 1));
          setDailyFrom(String(s.get("dailyFrom") || ""));
          setDailyTo(String(s.get("dailyTo") || ""));
          setOn(s.get("payoutsOn") === true);
        },
        () => {},
      ),
    [dirty],
  );

  const pct = (v: string) => Math.min(100, Math.max(0, Number(v) || 0));
  const save = async (nextOn = on) => {
    setMsg("");
    if (dailyFrom && dailyTo && dailyTo < dailyFrom)
      return setMsg("The daily commission's To date must be after From.");
    setSaving(true);
    try {
      await setDoc(
        doc(db, "app_settings", "luxury_festival_admin"),
        {
          payoutsOn: nextOn,
          prizes: rows.map((r) =>
            Math.max(0, Math.floor(Number(r.prize) || 0)),
          ),
          endPcts: rows.map((r) => pct(r.endPct)),
          dailyPcts: rows.map((r) => pct(r.dailyPct)),
          dailyFrom,
          dailyTo,
          payoutsUpdatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      setDirty(false);
      setMsg(
        nextOn ? "✅ Saved — payouts are ON." : "✅ Saved — payouts are OFF.",
      );
    } catch (e: any) {
      setMsg(e?.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setResetting(true);
    setMsg("");
    try {
      await ceoResetLuxuryFestival({});
      setMsg("🗑 Reset — the ranking starts again from zero.");
      setConfirmReset(false);
      setDangerOpen(false);
      onReset();
    } catch (e: any) {
      setMsg(e?.message || "Could not reset.");
    } finally {
      setResetting(false);
    }
  };

  const edit = (i: number, k: keyof Row, raw: string) => {
    const val =
      k === "prize"
        ? raw.replace(/[^\d]/g, "").slice(0, 10)
        : raw.replace(/[^\d.]/g, "").slice(0, 5);
    setRows((p) => p.map((r, j) => (j === i ? { ...r, [k]: val } : r)));
    setDirty(true);
  };
  const clearRow = (i: number) => {
    setRows((p) => p.map((r, j) => (j === i ? { ...EMPTY } : r)));
    // the last shown row emptied → hide it (keep at least 3)
    if (i === shown - 1 && shown > 3) setShown(shown - 1);
    setDirty(true);
  };
  // ＋ Add: the next place, with the row above copied in (usually the same)
  const addRow = () => {
    if (shown >= PLACES) return;
    setRows((p) => p.map((r, j) => (j === shown ? { ...p[shown - 1] } : r)));
    setShown(shown + 1);
    setDirty(true);
  };

  const used = rows.slice(0, shown).filter(filled).length;
  const prizeTotal = rows.reduce((sum, r) => sum + (Number(r.prize) || 0), 0);
  const dailyDays =
    dailyFrom && dailyTo
      ? `${shortDay(dailyFrom)} – ${shortDay(dailyTo)}`
      : "Off";
  const short = (n: number) =>
    n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${+(n / 1e3).toFixed(1)}K` : String(n);
  const cell =
    "w-full min-w-0 rounded-lg border border-[#D5E3F5] bg-[#F7F9FC] px-2 py-1.5 text-center text-[13px] font-bold text-[#0B2A5B] outline-none placeholder:text-[#A8B3C7] focus:border-[#7B5CF0]";
  const [chipText, chipCls] =
    status === "live"
      ? ["● LIVE", "bg-[#DDF6E8] text-[#15824B]"]
      : status === "soon"
        ? ["◷ SOON", "bg-[#E6EEFF] text-[#2F63D6]"]
        : status === "ended"
          ? ["■ ENDED", "bg-[#F0F3F8] text-[#6B7A99]"]
          : ["— NOT SET", "bg-[#F0F3F8] text-[#6B7A99]"];

  // the save button + its message (prizes and daily tabs)
  const saveRow = (
    <>
      <div className={`flex items-center gap-2 ${dirty ? "sticky bottom-2 z-10" : ""}`}>
        {tab === "prizes" && shown < PLACES && (
          <button
            type="button"
            onClick={addRow}
            className="shrink-0 rounded-full bg-[#F0F3F8] px-3 py-2 text-[12px] font-extrabold text-[#35507E]"
            title={`Add #${shown + 1} (copies #${shown})`}
          >
            ＋ #{shown + 1}
          </button>
        )}
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="flex-1 rounded-xl py-2 text-sm font-extrabold text-white shadow-md disabled:opacity-60"
          style={{ background: `linear-gradient(90deg, ${ACCENT}, #5B8CFF)` }}
        >
          {saving ? "Saving…" : dirty ? "💾 Save changes" : "💾 Save"}
        </button>
      </div>
      {msg && <p className="text-xs font-semibold text-[#35507E]">{msg}</p>}
    </>
  );

  return (
    <div
      className="mt-4 overflow-hidden rounded-[18px] bg-white text-[#0B2A5B]"
      style={{ border: `1px solid ${ACCENT}40`, boxShadow: `0 4px 12px ${ACCENT}33` }}
    >
      {/* the one line: ⚙️ title · status · (closed: prizes) · (open: ON/OFF) · ＋/－ */}
      <div className="flex items-center gap-1.5 px-2.5 py-2" style={{ background: `linear-gradient(90deg, #ffffff 40%, ${ACCENT}1f)` }}>
        <button type="button" onClick={toggleOpen} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={open}>
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] text-sm" style={{ background: `${ACCENT}26` }}>
            ⚙️
          </span>
          <span className="truncate text-[13.5px] font-extrabold">Festival controls</span>
        </button>
        <span className={`shrink-0 rounded-[10px] px-[7px] py-0.5 text-[10.5px] font-extrabold ${chipText ? chipCls : ""}`}>{chipText}</span>
        {!open ? (
          <span className="shrink-0 rounded-[10px] bg-[#FFF6DD] px-[7px] py-0.5 text-[10.5px] font-extrabold text-[#8A5A00]">
            🪙 {short(prizeTotal)} · {used}
          </span>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setOn(!on);
              void save(!on);
            }}
            className={`relative h-[18px] w-[32px] shrink-0 rounded-full transition ${on ? "bg-[#34C77B]" : "bg-[#C9D2E0]"}`}
            aria-label="Payouts on / off"
            title={on ? "Payouts ON" : "Payouts OFF"}
          >
            <span className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow transition-all ${on ? "left-[16px]" : "left-[2px]"}`} />
          </button>
        )}
        <button
          type="button"
          onClick={toggleOpen}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-base font-black"
          style={{ background: `${ACCENT}22`, color: ACCENT }}
          aria-label={open ? "Make small" : "Open"}
        >
          {open ? "－" : "＋"}
        </button>
      </div>

      {open && (
        <div className="space-y-2.5 border-t border-[#EEF2F7] px-2.5 pb-3 pt-2">
          {/* tabs */}
          <div className="grid grid-cols-3 gap-[3px] rounded-[10px] bg-[#F0F3F8] p-[3px]">
            {(
              [
                ["time", "🕒 Time"],
                ["prizes", "🏆 Prizes"],
                ["daily", "📅 Daily %"],
              ] as [Tab, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={`rounded-lg py-1.5 text-[11.5px] font-extrabold ${tab === k ? "text-white shadow" : "text-[#6B7A99]"}`}
                style={tab === k ? { background: ACCENT } : undefined}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "time" && timePanel}

          {tab === "prizes" && (
            <>
              <p className="text-[11px] text-[#6B7A99]">
                {on ? "ON — paid automatically from your balance" : "OFF — nothing is paid"} · 🪙 {coins(prizeTotal)} · {used} / {PLACES} places
              </p>
              <div className="grid grid-cols-[30px_1.5fr_1fr_24px] gap-1.5 px-0.5 text-[10.5px] font-black text-[#8A97B0]">
                <span className="text-center">#</span>
                <span className="text-center">🎁 Prize</span>
                <span className="text-center">💰 Total %</span>
                <span />
              </div>
              <div className="space-y-1">
                {rows.slice(0, shown).map((r, i) => (
                  <div key={i} className="grid grid-cols-[30px_1.5fr_1fr_24px] items-center gap-1.5">
                    <span className="text-center text-[12.5px] font-black text-[#6B7A99]">{MEDAL[i] || i + 1}</span>
                    <input inputMode="numeric" value={r.prize} placeholder="—" onChange={(e) => edit(i, "prize", e.target.value)} className={cell} />
                    <input inputMode="decimal" value={r.endPct} placeholder="—" onChange={(e) => edit(i, "endPct", e.target.value)} className={cell} />
                    <button
                      type="button"
                      onClick={() => clearRow(i)}
                      className={`h-6 w-6 rounded-full text-[11px] font-bold ${filled(r) ? "bg-[#F0F3F8] text-[#6B7A99]" : "text-[#C9D2E0]"}`}
                      aria-label={`Clear #${i + 1}`}
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              {saveRow}
              <p className="text-[10.5px] leading-4 text-[#8A97B0]">
                🎁 Prize + 💰 Total % are paid 10 minutes after the festival ends. Empty = nothing for that place. If your balance is not enough,
                the missing coins are added first — nobody is left unpaid.
              </p>

              {/* danger zone */}
              <div className="border-t border-[#EEF2F7] pt-2">
                {!dangerOpen ? (
                  <button type="button" onClick={() => setDangerOpen(true)} className="w-full text-center text-[11.5px] font-bold text-[#A8B3C7]">
                    ⚠️ Danger zone ›
                  </button>
                ) : confirmReset ? (
                  <div className="space-y-2">
                    <p className="text-[12.5px] font-bold text-[#D9534F]">Delete all names from the 1–25 ranking and start from zero?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={resetting}
                        onClick={() => void reset()}
                        className="flex-1 rounded-xl bg-[#E53935] py-2 text-sm font-extrabold text-white disabled:opacity-60"
                      >
                        {resetting ? "Resetting…" : "Yes, reset"}
                      </button>
                      <button type="button" onClick={() => setConfirmReset(false)} className="flex-1 rounded-xl bg-[#F0F3F8] py-2 text-sm font-bold text-[#35507E]">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmReset(true)}
                    className="w-full rounded-xl border border-[#F5B5B5] bg-[#FFF1F1] py-2 text-sm font-extrabold text-[#D9534F]"
                  >
                    🗑 Reset ranking (1–25)
                  </button>
                )}
              </div>
            </>
          )}

          {tab === "daily" && (
            <>
              <p className="text-[11px] text-[#6B7A99]">
                Paid every night 12:00 on the days below, on that day&apos;s Luxury Bet play · Days: <b>{dailyDays}</b>
              </p>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ["From", dailyFrom, setDailyFrom],
                    ["To", dailyTo, setDailyTo],
                  ] as [string, string, (v: string) => void][]
                ).map(([label, v, set]) => (
                  <label key={label} className="block text-[11px] font-bold text-[#6B7A99]">
                    {label}
                    <input
                      type="date"
                      value={v}
                      onChange={(e) => {
                        set(e.target.value);
                        setDirty(true);
                      }}
                      className="mt-0.5 block w-full rounded-xl border border-[#D5E3F5] bg-[#F7F9FC] px-2.5 py-1.5 text-sm font-semibold text-[#0B2A5B] outline-none"
                    />
                  </label>
                ))}
              </div>
              {(dailyFrom || dailyTo) && (
                <button
                  type="button"
                  onClick={() => {
                    setDailyFrom("");
                    setDailyTo("");
                    setDirty(true);
                  }}
                  className="text-[11px] font-bold text-[#6B7A99] underline"
                >
                  No daily commission
                </button>
              )}
              <div className="grid grid-cols-4 gap-1.5">
                {rows.slice(0, shown).map((r, i) => (
                  <label key={i} className="block text-center text-[11px] font-black text-[#6B7A99]">
                    {MEDAL[i] || `#${i + 1}`}
                    <input inputMode="decimal" value={r.dailyPct} placeholder="—" onChange={(e) => edit(i, "dailyPct", e.target.value)} className={`${cell} mt-0.5`} />
                  </label>
                ))}
              </div>
              {saveRow}
            </>
          )}
        </div>
      )}
    </div>
  );
}
