"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";
import { todayKey } from "../../lib/xp";

// 🎂 Birthdays (same as the app): once a day, when the Lobby opens —
//   • my birthday → miGlife's personal wish,
//   • others' birthdays → ONE popup with all of them and a "Wish" button each.
// The list comes from the server (getTodayBirthdays): a locked profile is only
// listed for its friends, and the year / age is never shown.

const AVATAR_COLORS = ["#43B65A", "#3984D9", "#E9A625", "#7B1FB8", "#12AFC7", "#E12A2A", "#D4AF37", "#3F55C7"];
const colorFor = (name: string) => {
  let sum = 0;
  for (const ch of name.trim().toLowerCase()) sum += ch.codePointAt(0) || 0;
  return AVATAR_COLORS[sum % AVATAR_COLORS.length];
};

const BRAND = "linear-gradient(180deg, rgba(255,255,255,.35), transparent 45%), linear-gradient(180deg, #5aa2ff, #1565d8)";
const CONFETTI = ["🎉", "🎊", "✨", "🎈", "💖", "🎂", "⭐"];

function Confetti() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[96] overflow-hidden">
      <style>{`@keyframes bdFall{from{transform:translateY(-40px) rotate(0)}to{transform:translateY(110vh) rotate(540deg)}}`}</style>
      {Array.from({ length: 22 }, (_, i) => (
        <span
          key={i}
          className="absolute text-[22px]"
          style={{ left: `${(i * 37) % 96}%`, top: -30, animation: `bdFall ${2.4 + (i % 5) * 0.35}s linear ${(i % 8) * 0.3}s 2 both` }}
        >
          {CONFETTI[i % CONFETTI.length]}
        </span>
      ))}
    </div>
  );
}

export function BirthdayPopup({ username }: { username: string }) {
  const [step, setStep] = useState<"none" | "mine" | "others">("none");
  const [people, setPeople] = useState<string[]>([]);
  const [sent, setSent] = useState<Record<string, "busy" | "done">>({});
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (!username) return;
    const key = `migwith.bday.${username.toLowerCase()}.${todayKey()}`;
    try {
      if (localStorage.getItem(key)) return;
    } catch {
      // storage blocked — still show it
    }
    let alive = true;
    httpsCallable<unknown, { me?: boolean; people?: string[] }>(functions, "getTodayBirthdays")()
      .then(({ data }) => {
        if (!alive) return;
        const list = (data?.people || []).filter(Boolean);
        if (!data?.me && list.length === 0) {
          try {
            localStorage.setItem(key, "1");
          } catch {}
          return;
        }
        setPeople(list);
        setStep(data?.me ? "mine" : "others");
        try {
          localStorage.setItem(key, "1");
        } catch {}
      })
      .catch(() => {}); // not deployed yet / offline: try again next time
    return () => {
      alive = false;
    };
  }, [username]);

  const wish = async (name: string) => {
    if (sent[name]) return;
    setSent((s) => ({ ...s, [name]: "busy" }));
    try {
      await httpsCallable(functions, "sendBirthdayWish")({ to: name });
      setSent((s) => ({ ...s, [name]: "done" }));
      setToast(`🎂 Wish sent to ${name}`);
    } catch (e: any) {
      setSent((s) => {
        const n = { ...s };
        delete n[name];
        return n;
      });
      setToast(e?.message || "Could not send the wish.");
    }
    setTimeout(() => setToast(""), 2200);
  };

  if (step === "none" || typeof document === "undefined") return null;
  const close = () => setStep(step === "mine" && people.length ? "others" : "none");

  return createPortal(
    <>
      <Confetti />
      <div className="fixed inset-0 z-[95] flex items-center justify-center bg-[#0B1F3A]/35 p-5">
        <div className="w-full max-w-sm rounded-[28px] bg-white p-[22px] text-center text-[#0B2A5B] shadow-[0_24px_60px_rgba(11,31,58,.4)]">
          {step === "mine" ? (
            <>
              <div className="relative mx-auto mt-3 h-24 w-24">
                <span
                  className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white text-[40px] font-black text-white shadow-[0_0_0_4px_#ffd36b]"
                  style={{ background: colorFor(username) }}
                >
                  {username.slice(0, 1).toUpperCase()}
                </span>
                <span className="absolute -top-7 left-1/2 -translate-x-1/2 text-[34px]">👑</span>
              </div>
              <p className="mt-3 text-xs font-black tracking-[2px] text-[#E8590C]">🎂 HAPPY BIRTHDAY</p>
              <p data-notranslate className="mt-1 text-[26px] font-black">{username}!</p>
              <p className="mt-2 text-sm leading-[1.45] text-[#35507E]">
                From all of us at <b>miGlife</b> — have an amazing year full of fun, friends and good chats! 💖
              </p>
              <p className="mt-2.5 text-xs text-[#8A9BBC]">— Team miGlife</p>
              <button type="button" onClick={close} className="mt-4 w-full rounded-full border-[1.5px] border-white/85 py-3 text-base font-black text-white shadow-[0_8px_18px_rgba(21,101,216,.4)]" style={{ background: BRAND }}>
                Thank you 💖
              </button>
            </>
          ) : (
            <>
              <p className="text-[40px] leading-none">🎉🎂🎈</p>
              <p className="mt-2 text-[22px] font-black">Today&apos;s Birthdays</p>
              <p className="mt-0.5 text-[13px] text-[#5B6B8C]">miGlife wishes them a happy birthday!</p>
              <div className="mt-3 max-h-[46vh] overflow-y-auto text-left">
                {people.map((n, i) => (
                  <div key={n} className={`flex items-center gap-2.5 py-2 ${i < people.length - 1 ? "border-b border-[#EEF3FA]" : ""}`}>
                    <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full text-[19px] font-black text-white" style={{ background: colorFor(n) }}>
                      {n.slice(0, 1).toUpperCase()}
                    </span>
                    <b data-notranslate className="min-w-0 flex-1 truncate">{n}</b>
                    <button
                      type="button"
                      disabled={!!sent[n]}
                      onClick={() => wish(n)}
                      className="shrink-0 rounded-full border-[1.5px] border-white/85 px-3.5 py-[7px] text-[13px] font-black text-white shadow-[0_6px_14px_rgba(21,101,216,.35)] disabled:opacity-60"
                      style={{ background: sent[n] === "done" ? "linear-gradient(180deg,#4cd38a,#1f9d5b)" : BRAND }}
                    >
                      {sent[n] === "done" ? "Sent ✓" : sent[n] === "busy" ? "…" : "Wish 🎂"}
                    </button>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setStep("none")} className="mt-3.5 w-full rounded-full border-[1.5px] border-[#D5E3F5] py-3 font-extrabold text-[#5B6B8C]">
                OK
              </button>
            </>
          )}
        </div>
      </div>
      {toast && (
        <div className="fixed bottom-10 left-1/2 z-[97] -translate-x-1/2 whitespace-nowrap rounded-full bg-[#0B2A5B] px-[18px] py-2.5 text-sm font-extrabold text-white">
          {toast}
        </div>
      )}
    </>,
    document.body
  );
}
