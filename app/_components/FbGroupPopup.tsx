"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../lib/firebase";

// 📘 Facebook group popup (miglife, Nov 2026): after logging in (once the
// welcome animation has gone) a card asks to join the miGlife Facebook group.
// "Join the group" opens it in a new tab, "Maybe later" closes it until the next
// login, "Don't show again" stops it in this browser. miGlife switches it on/off
// and sets the link in miGlife secret → Facebook Group (app_settings/fb_group).
// Same as the app (FbGroupPopup.kt).

export const FB_GROUP_DEFAULT_URL = "https://www.facebook.com/share/g/1TMfTBE4PE/";
const ASK = "migwith.fbAsk";       // sessionStorage: set at login
const NEVER = "migwith.fbNever";   // localStorage: "Don't show again"
const EVENT = "migwith:welcome";

/** Called at login (with the welcome animation). */
export function requestFbGroupPopup() {
  try {
    sessionStorage.setItem(ASK, "1");
  } catch {
    // storage blocked
  }
}

export function FbGroupPopup() {
  const [url, setUrl] = useState("");
  const [never, setNever] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let uid = "";
    const check = () => {
      let ask = false;
      try {
        ask = sessionStorage.getItem(ASK) === "1" && localStorage.getItem(NEVER) !== "1";
      } catch {
        ask = false;
      }
      if (!ask || !uid) return;
      clearTimeout(timer);
      // after the ~2.6 s welcome animation
      timer = setTimeout(async () => {
        try {
          sessionStorage.removeItem(ASK);
        } catch {
          // ignore
        }
        try {
          const d = (await getDoc(doc(db, "app_settings", "fb_group"))).data() || {};
          if (d.enabled === false) return;
          setUrl(String(d.url || "").trim() || FB_GROUP_DEFAULT_URL);
        } catch {
          setUrl(FB_GROUP_DEFAULT_URL);
        }
      }, 3600);
    };
    const off = onAuthStateChanged(auth, (u) => {
      uid = u?.uid || "";
      check();
    });
    window.addEventListener(EVENT, check);
    return () => {
      off();
      window.removeEventListener(EVENT, check);
      clearTimeout(timer);
    };
  }, []);

  if (!url) return null;
  const close = () => {
    if (never) {
      try {
        localStorage.setItem(NEVER, "1");
      } catch {
        // ignore
      }
    }
    setUrl("");
  };
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-[rgba(10,25,50,.45)] px-[22px]" onClick={close}>
      <div className="relative w-full max-w-[380px] pt-[38px]" onClick={(e) => e.stopPropagation()}>
        {/* the blue "f" badge, half above the card (6D: lip + white rim) */}
        <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-[22px] bg-white p-1 shadow-[0_8px_18px_rgba(16,96,224,.35)]">
          <div className="flex h-[70px] w-[70px] items-center justify-center rounded-[19px] bg-gradient-to-b from-[#3B8BFF] to-[#1060E0] pt-1 font-[Arial] text-[46px] font-black leading-none text-white shadow-[0_4px_0_#0A47B0]">
            f
          </div>
        </div>
        <div className="rounded-[26px] bg-white px-5 pb-4 pt-[52px] text-center shadow-[0_20px_40px_rgba(0,0,0,.3)]">
          <p className="text-[20px] font-black text-[#0B2A5B]">Join our Facebook group!</p>
          <p className="mt-1.5 text-[13.5px] leading-5 text-[#4A5F86]">News, events and new friends — all in the miGlife community group.</p>
          <div className="mt-3 flex justify-center gap-2">
            {["📢 News", "🎉 Events", "👥 Friends"].map((t) => (
              <span key={t} className="rounded-full bg-[#EAF2FF] px-2.5 py-1 text-[11.5px] font-bold text-[#1060E0]">{t}</span>
            ))}
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setUrl("")}
            className="mt-4 flex h-12 items-center justify-center rounded-[15px] bg-gradient-to-b from-[#3B8BFF] to-[#1060E0] text-[16px] font-black text-white shadow-[0_4px_0_#0A47B0] transition active:translate-y-[2px] active:shadow-[0_2px_0_#0A47B0]"
          >
            Join the group
          </a>
          <button type="button" onClick={close} className="mt-2.5 rounded-lg px-3 py-1.5 text-[13.5px] font-bold text-[#6B7FA6]">
            Maybe later
          </button>
          <label className="flex cursor-pointer items-center justify-center gap-1.5 text-[12px] text-[#8494B2]">
            <input type="checkbox" checked={never} onChange={(e) => setNever(e.target.checked)} className="h-4 w-4 accent-[#1060E0]" />
            Don&apos;t show again
          </label>
        </div>
      </div>
    </div>
  );
}
