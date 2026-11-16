"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db, functions } from "../../../lib/firebase";
import { forgetVideoQuality, type VideoQualityKey } from "../../../lib/videoQuality";
import { useFounderPerms } from "../../../lib/founder";
import { blogCall } from "../../../lib/feed";
import { FounderShell, card } from "../_Shell";

// 🎬 Feed video switch (miGlife only). OFF stops new video posts and video
// uploads in the web app and the Android app. Saved in app_settings/feed.

const setFeedVideo = httpsCallable<{ enabled: boolean }, { ok: boolean; videoEnabled: boolean }>(
  functions,
  "setFeedVideo"
);

export default function FeedVideoPage() {
  const f = useFounderPerms();
  const allowed = f.isMigwith;
  const [on, setOn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    blogCall("videoStatus")
      .then((r) => setOn(r.videoEnabled !== false))
      .catch(() => setOn(true));
  }, []);

  const toggle = async () => {
    if (on === null || busy) return;
    const next = !on;
    if (!window.confirm(next ? "Turn video posts ON?" : "Turn video posts OFF? New video posts and uploads will be blocked.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await setFeedVideo({ enabled: next });
      setOn(r.data.videoEnabled);
      setMsg({ text: r.data.videoEnabled ? "✅ Video is ON." : "✅ Video is OFF.", error: false });
    } catch (e) {
      const text = e instanceof Error ? e.message : "";
      setMsg({ text: text && !text.startsWith("internal") ? text : "Could not change the setting. Please try again.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FounderShell title="🎬 Feed Video" allowed={allowed} loaded={f.loaded}>
      <div className={`${card} space-y-4`}>
        <p className="text-xs text-[#5B6B8C]">
          When OFF, the Video button is hidden in the Feed (web and Android) and no new video posts can be made.
          Posts that already have a video are not changed.
        </p>

        <div className="flex items-center justify-between rounded-xl bg-[#EEF3FB] px-4 py-3">
          <span className="text-sm font-bold text-[#1E3A6E]">Video posts</span>
          <span className={`text-sm font-black ${on ? "text-[#2E7D32]" : "text-[#B91C1C]"}`}>
            {on === null ? "…" : on ? "ON" : "OFF"}
          </span>
        </div>

        <button
          type="button"
          onClick={toggle}
          disabled={on === null || busy}
          className={`w-full rounded-xl py-3 text-sm font-bold text-white disabled:opacity-50 ${on ? "bg-[#B91C1C]" : "bg-[#2E7D32]"}`}
        >
          {busy ? "Saving…" : on ? "Turn OFF" : "Turn ON"}
        </button>

        {msg && <p className={`text-sm ${msg.error ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg.text}</p>}
      </div>
      <QualityCard />
    </FounderShell>
  );
}

// 🎞 Video quality (app_settings/video_quality) — the Android app and the web use it
const QUALITIES: [VideoQualityKey, string, string][] = [
  ["good", "Good", "720p · ~10 MB for 30 s"],
  ["balanced", "Balanced", "720p · ~6 MB for 30 s"],
  ["light", "Light", "480p · ~3.5 MB for 30 s"],
];
function QualityCard() {
  const [q, setQ] = useState<VideoQualityKey | null>(null);
  const [msg, setMsg] = useState("");
  useEffect(() => {
    getDoc(doc(db, "app_settings", "video_quality"))
      .then((s) => setQ((["good", "balanced", "light"].includes(s.get("quality")) ? s.get("quality") : "light") as VideoQualityKey))
      .catch(() => setQ("light"));
  }, []);
  const choose = async (k: VideoQualityKey, title: string) => {
    setQ(k);
    setMsg("");
    try {
      await setDoc(doc(db, "app_settings", "video_quality"), { quality: k, updatedAt: serverTimestamp() });
      forgetVideoQuality();
      setMsg(`✅ Saved: ${title}`);
    } catch (e) {
      setMsg("❌ " + (e instanceof Error ? e.message : "Could not save."));
    }
  };
  return (
    <div className={`${card} mt-3 space-y-2`}>
      <p className="text-[15px] font-extrabold text-[#1E3A6E]">🎞 Video quality</p>
      <p className="text-xs text-[#5B6B8C]">Heavy videos are made lighter before they are uploaded. Lighter = smaller files and smoother playing on mobile data.</p>
      {QUALITIES.map(([k, title, sub]) => (
        <button
          key={k}
          type="button"
          onClick={() => choose(k, title)}
          className={`flex w-full items-center gap-3 rounded-xl border-[1.5px] px-3.5 py-2.5 text-left ${q === k ? "border-[#14B88F] bg-[#E3F7EF]" : "border-transparent bg-[#F4F7FB]"}`}
        >
          <span className={q === k ? "text-[#14B88F]" : "text-[#5B6B8C]"}>{q === k ? "◉" : "○"}</span>
          <span className="flex-1">
            <span className="block text-sm font-bold text-[#1E3A6E]">{title}</span>
            <span className="block text-xs text-[#5B6B8C]">{sub}</span>
          </span>
        </button>
      ))}
      {msg && <p className={`text-sm ${msg.startsWith("❌") ? "text-[#B91C1C]" : "text-[#2E7D32]"}`}>{msg}</p>}
    </div>
  );
}
