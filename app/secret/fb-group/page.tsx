"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../../lib/firebase";
import { useFounderPerms } from "../../../lib/founder";
import { FounderShell, card } from "../_Shell";

// 📘 Facebook Group (miGlife only): the "Join our Facebook group" popup after
// login — on / off and the group link (setFbGroup). Same as the app (FbGroupTool).

type Cfg = { enabled: boolean; url: string };
const setFbGroup = httpsCallable<Partial<Cfg>, Cfg & { ok: boolean }>(functions, "setFbGroup");

export default function FbGroupPage() {
  const f = useFounderPerms();
  const canTool = f.can("fb_group");
  const [cfg, setCfg] = useState<Cfg | null>(null);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  const save = async (data: Partial<Cfg>) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await setFbGroup(data);
      setCfg(r.data);
      setUrl(r.data.url);
      if (Object.keys(data).length) setMsg({ text: "✅ Saved", error: false });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setMsg({ text: text && !text.startsWith("internal") ? text : "Could not save. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (f.loaded && canTool) save({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.loaded, canTool]);

  return (
    <FounderShell title="📘 Facebook Group" allowed={canTool} loaded={f.loaded}>
      <div className={`${card} space-y-3`}>
        <p className="text-xs text-[#5B6B8C]">
          After logging in, everyone sees a card asking them to join the miGlife Facebook group (until they tick &quot;Don&apos;t show again&quot;).
        </p>
        {!cfg ? (
          <p className="text-sm text-[#5B6B8C]">Loading…</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl bg-[#EEF3FB] px-4 py-3">
              <b className="text-sm text-[#1E3A6E]">Show after login</b>
              <button
                type="button"
                role="switch"
                aria-checked={cfg.enabled}
                disabled={busy}
                onClick={() => save({ enabled: !cfg.enabled })}
                className={`relative h-[26px] w-[46px] rounded-full transition disabled:opacity-50 ${cfg.enabled ? "bg-[#22C55E]" : "bg-[#CBD5E1]"}`}
              >
                <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow transition-all ${cfg.enabled ? "left-[23px]" : "left-[3px]"}`} />
              </button>
            </div>
            <label className="block">
              <span className="text-[11px] font-extrabold tracking-wide text-[#5B6B8C]">GROUP LINK</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value.slice(0, 320))}
                className="mt-1.5 w-full rounded-xl border border-[#D5DEEA] px-3 py-2.5 text-sm text-[#1E3A6E] outline-none focus:border-[#2563EB]"
              />
            </label>
            <button
              type="button"
              disabled={busy || !url.trim()}
              onClick={() => save({ url: url.trim() })}
              className="w-full rounded-xl bg-[#0B2A5B] py-3 text-sm font-black text-white disabled:opacity-50"
            >
              {busy ? "Saving…" : "Save link"}
            </button>
          </>
        )}
        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
    </FounderShell>
  );
}
