"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useLuxuryBetAccess } from "../_components/LuxuryBet";
import { input } from "./_Shell";

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

/** 🎰 Luxury Bet — tap to open: Access, Level (7 sequences) and Schedule. */
export function LuxuryBetSection() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center rounded-[18px] border-[1.5px] border-[#D4AF37] bg-[#1E1A2E] px-4 py-3.5 text-left"
      >
        <span className="flex-1">
          <span className="block text-lg font-extrabold text-[#F2D675]">🎰 Luxury Bet</span>
          <span className="block text-xs text-[#F2E6C2]">Access · Level · Schedule</span>
        </span>
        <span className="text-[#D4AF37]">{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <>
          <LuxuryBetAccessCard />
          <LuxuryBetLevelCard />
        </>
      )}
    </>
  );
}

function LuxuryBetAccessCard() {
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

function LuxuryBetLevelCard() {
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
        Shown on web.miglife.app as the &quot;Download Android App&quot; button, and shared by the app&apos;s Invite Friends. Paste the APK /
        Play Store / Google Drive link.
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
