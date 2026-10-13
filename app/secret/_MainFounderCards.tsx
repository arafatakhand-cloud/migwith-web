"use client";

import { useCallback, useEffect, useState } from "react";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { input } from "./_Shell";
import { cleanLimits, formatLimit, rememberTransferLimits, transferLimitsCall, type TransferLimits } from "../../lib/transferLimits";
import { RainbowName } from "../_components/RainbowName";
import { SPECIAL_COLOR_SLOTS, SPECIAL_COLOR_STYLE_NAMES, VIP_DEFAULT_COIN_PLANS, VIP_PLANS, coins, coinsShort, vipCoinPlans, vipPlanLabel } from "../../lib/specialColor";

// miglife-only cards of the app's "miglife secret" page: the one-time new
// level curve step, Security Question Reset, Transfer Limits … Everything
// runs through the Cloud Functions.

const migrateLevelCurveV3 = httpsCallable<void, { changed?: number; scanned?: number; alreadyDone?: boolean }>(
  functions,
  "migrateLevelCurveV3"
);
const founderResetSecurityQuestion = httpsCallable<{ username: string }, { username?: string; hadQuestion?: boolean }>(
  functions,
  "founderResetSecurityQuestion"
);

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

/** 🔁 New level curve (after Lv.50) — run ONCE; IDs above Lv.50 keep their level. */
export function LevelCurveCard() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  return (
    <div className="space-y-2 rounded-[18px] border border-[#E0A82E] bg-white p-4">
      <p className="text-[14px] font-bold">🔁 New level curve (after Lv.50)</p>
      <p className="text-xs text-gray-500">Run ONCE right after deploying the new functions, then deploy the rules. IDs above Lv.50 keep their level.</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setMsg(null);
          setFailed(false);
          migrateLevelCurveV3()
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
  const [applyOpen, setApplyOpen] = useState(false);
  const [planText, setPlanText] = useState<Record<number, string>>(
    Object.fromEntries(VIP_PLANS.map((m) => [m, String(VIP_DEFAULT_COIN_PLANS[m])]))
  );
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
    // The saved ON/OFF and coin prices come from the server — what users really see.
    if (typeof d.applyOpen === "boolean") setApplyOpen(d.applyOpen);
    if (d.coinPlans) {
      const p = vipCoinPlans(d.coinPlans);
      setPlanText(Object.fromEntries(VIP_PLANS.map((m) => [m, String(p[m])])));
    }
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
        Paid in 🪙 coins · only {SPECIAL_COLOR_SLOTS} people, each with their own animation · picture + voice sharing. Approve = the plan&apos;s coins are cut
        from the user. Reject = nothing is cut.
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

      {/* 🪙 coin price per plan */}
      <p className="text-[13px] font-bold">🪙 Coin price per plan</p>
      <div className="grid grid-cols-2 gap-2">
        {VIP_PLANS.map((m) => {
          const v = planText[m] || "";
          const n = Number(v);
          return (
            <label key={m} className="block">
              <span className="text-[11px] text-gray-500">{vipPlanLabel(m)}</span>
              <input
                className={input}
                inputMode="numeric"
                value={v}
                onChange={(e) => setPlanText((p) => ({ ...p, [m]: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
              />
              <span className="text-[10px] text-gray-500">{v ? `${coinsShort(n)} · ${coins(n / (m === 12 ? 12 : m))}/mo` : "number"}</span>
            </label>
          );
        })}
      </div>
      <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
        {[100_000, 250_000, 500_000, 1_000_000, 2_000_000].map((one) => (
          <button
            key={one}
            type="button"
            onClick={() => setPlanText({ 1: String(one), 3: String((one * 28) / 10), 6: String(one * 5), 12: String(one * 9) })}
            className="shrink-0 rounded-full bg-[#0B1F3A12] px-2.5 py-1.5 text-[11px] font-semibold"
          >
            1 mo = {coinsShort(one)}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-gray-500">Quick fill: 3 mo ≈ 7% off · 6 mo ≈ 17% off · 1 year = 25% off</p>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          const p = Object.fromEntries(VIP_PLANS.map((m) => [m, Number(planText[m] || 0)]));
          if (Object.values(p).some((v) => !(v >= 1000))) {
            setFailed(true);
            setMsg("Every plan needs a price of at least 1,000 coins");
            return;
          }
          run(
            { action: "setCoinPlans", plans: Object.fromEntries(Object.entries(p).map(([k, v]) => [String(k), v])) },
            `✅ Prices saved: ${VIP_PLANS.map((m) => `${vipPlanLabel(m)} ${coinsShort(p[m])}`).join(" · ")}`,
            false
          );
        }}
        className="rounded-xl bg-[#1E9E55] px-4 py-2.5 font-bold text-white disabled:opacity-50"
      >
        SAVE COIN PRICES
      </button>

      <p className="text-sm font-bold">Waiting ({pending.length})</p>
      {pending.length === 0 && <p className="text-xs text-gray-500">No requests waiting.</p>}
      {pending.map((r) => (
        <div key={r.id} className="rounded-xl bg-[#FF4F8B]/10 p-2.5">
          <p className="text-sm font-bold">
            {r.username} · {vipPlanLabel(Number(r.months) || 1)} · {SPECIAL_COLOR_STYLE_NAMES[Number(r.style) || 0] || ""}
          </p>
          {Number(r.amountCoins) > 0 ? (
            (() => {
              const cost = Number(r.amountCoins);
              const bal = typeof r.balance === "number" ? r.balance : null;
              const ok = bal !== null && bal >= cost;
              return (
                <p className={`text-xs font-semibold ${ok ? "text-[#1E9E55]" : "text-[#C0123C]"}`}>
                  🪙 {coins(cost)} coins · has {bal === null ? "?" : coins(bal)} {ok ? "✅ enough" : "❌ not enough"}
                </p>
              );
            })()
          ) : Number(r.legacyUsd) > 0 ? (
            <p className="text-xs text-gray-500">
              Old request: ${Number(r.legacyUsd)} paid outside (Trx {String(r.trxId || "")}) — approving cuts no coins
            </p>
          ) : null}
          <p className="text-[11px] text-gray-500">{spDate(Number(r.createdAtMs) || 0)}</p>
          <div className="mt-1.5 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const res = await run({ action: "approve", id: r.id }, `✅ ${r.username} approved`);
                const paid = Number(res?.paidCoins || 0);
                if (paid > 0) setMsg(`✅ ${r.username} approved · 🪙 ${coins(paid)} cut`);
              }}
              className="rounded-[10px] bg-[#1E9E55] px-4 py-2 font-bold text-white disabled:opacity-50"
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run({ action: "reject", id: r.id, reason: "Not approved by miglife" }, `Rejected ${r.username}`)}
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

/** 🎚 Transfer Limits — daily transfer limit per role, merchant accept (miGlife only). */
export function TransferLimitsCard() {
  const rows: { key: keyof TransferLimits; icon: string; label: string; hint: string; unlimitedOk: boolean }[] = [
    { key: "founder", icon: "👑", label: "Founder", hint: "daily transfer limit", unlimitedOk: true },
    { key: "staff", icon: "🪪", label: "Staff", hint: "daily transfer limit", unlimitedOk: true },
    { key: "admin", icon: "🛡️", label: "Admin", hint: "daily transfer limit", unlimitedOk: true },
    { key: "merchant", icon: "🏪", label: "Merchant", hint: "daily transfer limit", unlimitedOk: true },
    { key: "user", icon: "👤", label: "Normal user", hint: "daily transfer limit", unlimitedOk: true },
    { key: "merchantNewMax", icon: "🔵", label: "Merchant request accept", hint: "a NEW merchant may have at most this many coins", unlimitedOk: true },
    { key: "merchantAcceptCoins", icon: "💸", label: "Coins mentor sends on accept", hint: "0 = nothing is sent", unlimitedOk: false },
  ];
  const [text, setText] = useState<Record<string, string>>({});
  const [unlimited, setUnlimited] = useState<Record<string, boolean>>({});
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const fill = (l: TransferLimits) => {
    const t: Record<string, string> = {};
    const u: Record<string, boolean> = {};
    for (const r of rows) {
      const v = l[r.key];
      u[r.key] = v === null;
      t[r.key] = v === null ? "" : String(v);
    }
    setText(t);
    setUnlimited(u);
    setLoaded(true);
  };
  useEffect(() => {
    transferLimitsCall({ action: "get" })
      .then(({ data }) => fill(cleanLimits(data)))
      .catch((e) => {
        setFailed(true);
        setMsg(e?.message || "Couldn't load limits");
        fill(cleanLimits(null));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = () => {
    // every limited row needs a number
    const missing = rows.find((r) => !unlimited[r.key] && !text[r.key]);
    if (missing) {
      setFailed(true);
      setMsg(`Enter an amount for ${missing.label} (or turn on Unlimited).`);
      return;
    }
    setBusy(true);
    setMsg(null);
    setFailed(false);
    const limits: Record<string, number | null> = {};
    for (const r of rows) limits[r.key] = r.unlimitedOk && unlimited[r.key] ? null : Number(text[r.key] || 0);
    transferLimitsCall({ action: "set", limits })
      .then(({ data }) => {
        const l = cleanLimits(data);
        rememberTransferLimits(l);
        fill(l);
        setMsg("✅ Saved — new limits apply right away");
      })
      .catch((e) => {
        setFailed(true);
        setMsg(e?.message || "Couldn't save");
      })
      .finally(() => setBusy(false));
  };

  return (
    <div className="space-y-2.5 rounded-[20px] border border-[#2E7D3280] bg-white p-3.5">
      <p className="text-[17px] font-extrabold">🎚 Transfer Limits</p>
      <p className="text-xs text-[#5B6B8C]">Set an amount per day, or turn on Unlimited. Mentors are always unlimited.</p>
      {!loaded ? (
        <p className="text-[13px] text-[#5B6B8C]">Loading…</p>
      ) : (
        rows.map((r) => {
          const isUnl = !!unlimited[r.key];
          const n = Number(text[r.key] || "");
          return (
            <div key={r.key} className="space-y-1.5 rounded-[14px] bg-[#0B1F3A0A] p-2.5">
              <div className="flex items-center gap-2">
                <span className="text-lg">{r.icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold">{r.label}</span>
                  <span className="block text-[11px] text-[#5B6B8C]">{r.hint}</span>
                </span>
                {r.unlimitedOk && (
                  <label className="flex items-center gap-1.5 text-[11px] text-[#5B6B8C]">
                    Unlimited
                    <input type="checkbox" checked={isUnl} onChange={(e) => setUnlimited((u) => ({ ...u, [r.key]: e.target.checked }))} className="h-4 w-4" />
                  </label>
                )}
              </div>
              {!isUnl && (
                <>
                  <input
                    value={text[r.key] || ""}
                    onChange={(e) => setText((t) => ({ ...t, [r.key]: e.target.value.replace(/\D/g, "").slice(0, 10) }))}
                    inputMode="numeric"
                    placeholder="Amount (coins)"
                    className={input}
                  />
                  {text[r.key] && <p className="text-[11px] text-[#5B6B8C]">{formatLimit(n)} coins</p>}
                </>
              )}
            </div>
          );
        })
      )}
      <button type="button" disabled={!loaded || busy} onClick={save} className="w-full rounded-xl bg-[#2E7D32] py-2.5 font-bold text-white disabled:opacity-50">
        {busy ? "Saving…" : "Save limits"}
      </button>
      <Message text={msg} failed={failed} />
    </div>
  );
}
