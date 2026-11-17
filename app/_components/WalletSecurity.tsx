"use client";

import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../lib/firebase";

// 🛡️ Wallet Security (miglife "A", Nov 2026 — same as the app): tapping Transfer with no
// own PIN (or the sign-up 123456) opens ONE sheet over the Wallet — no trip to /security:
//   intro → 1 · Security Question (set one, or answer the one already set) → 2 · PIN
//   (keypad, 4–6 digits, typed twice) → "Wallet secured!" → Send coins now.
// Same server calls and checks as /security.
const call = <T,>(name: string) => httpsCallable<Record<string, unknown>, T>(functions, name);
const QUESTIONS = [
  "What was your childhood nickname?",
  "What is the name of your first school?",
  "What is your favorite teacher's name?",
  "What was the name of your first pet?",
  "What city were you born in?",
];
const errText = (e: unknown) => String((e as { message?: string })?.message || "Please try again.").replace(/^FirebaseError:\s*/, "");

function Key({ children, onClick, disabled, green }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; green?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`h-[50px] w-full rounded-2xl text-[15.5px] font-black text-white transition active:translate-y-[2px] disabled:opacity-50 ${
        green ? "bg-gradient-to-b from-[#14B88F] to-[#0E9673] shadow-[0_4px_0_#0A6656]" : "bg-gradient-to-b from-[#2C9BEA] to-[#1A78C8] shadow-[0_4px_0_#13589A]"
      }`}
    >
      {children}
    </button>
  );
}

function Steps({ step }: { step: number }) {
  const dot = (n: number, label: string) => {
    const done = step > n;
    const on = step === n;
    return (
      <span className={`flex items-center gap-1.5 text-[11.5px] font-extrabold ${done || on ? "text-[#0B2A5B]" : "text-[#8A97AE]"}`}>
        <i className={`flex h-6 w-6 items-center justify-center rounded-full text-[12px] not-italic ${done ? "bg-[#14B88F] text-white" : on ? "bg-[#2C9BEA] text-white" : "bg-[#E3EAF3] text-[#6B7FA0]"}`}>{done ? "✓" : n}</i>
        {label}
      </span>
    );
  };
  return (
    <div className="mb-3.5 mt-0.5 flex items-center gap-2">
      {dot(1, "Question")}
      <span className={`h-[2px] flex-1 rounded ${step > 1 ? "bg-[#14B88F]" : "bg-[#E3EAF3]"}`} />
      {dot(2, "PIN")}
    </div>
  );
}

export function WalletSecuritySheet({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [hasQuestion, setHasQuestion] = useState(false);
  const [savedQuestion, setSavedQuestion] = useState("");
  const [pinIsDefault, setPinIsDefault] = useState(false);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [question, setQuestion] = useState(QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [answer2, setAnswer2] = useState("");
  const [show, setShow] = useState(false);
  const [pin, setPin] = useState("");
  const [firstPin, setFirstPin] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const q = await call<{ hasQuestion?: boolean; question?: string }>("getSecurityQuestion")({});
        setHasQuestion(q.data?.hasQuestion === true);
        setSavedQuestion(String(q.data?.question || ""));
        const p = await call<{ isDefault?: boolean }>("getPinStatus")({});
        setPinIsDefault(p.data?.isDefault === true);
      } catch {
        // the steps still work; the server checks everything
      } finally {
        setLoaded(true);
      }
    })();
  }, []);
  // 🔢 the keyboard's numbers work on the keypad too
  useEffect(() => {
    if (step !== 2) return;
    const on = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 6 ? p + e.key : p));
      else if (e.key === "Backspace") setPin((p) => p.slice(0, -1));
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [step]);

  const nextFromQuestion = async () => {
    const a = answer.trim();
    if (a.length < 2) return setErr("Enter an answer (at least 2 letters).");
    if (!hasQuestion && a !== answer2.trim()) return setErr("The answers don't match.");
    setBusy(true);
    setErr("");
    try {
      if (hasQuestion) await call("verifySecurityAnswer")({ answer: a });
      else await call("setSecurityQuestion")({ question, answer: a });
      setStep(2);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  };
  const pinKey = async () => {
    if (!firstPin) {
      if (pin === "123456") return setErr("Please choose a PIN other than 123456.");
      setFirstPin(pin);
      setPin("");
      return;
    }
    if (pin !== firstPin) {
      setErr("The PINs don't match — try again.");
      setPin("");
      setFirstPin("");
      return;
    }
    setBusy(true);
    try {
      await call("setSecurityPin")({ pin, ...(pinIsDefault ? { currentPin: "123456" } : {}) });
      setStep(3);
    } catch (e) {
      setErr(errText(e));
      setPin("");
      setFirstPin("");
    } finally {
      setBusy(false);
    }
  };
  const close = () => !busy && step !== 3 && onClose();
  const field = "w-full rounded-[14px] border-2 border-[#E3EAF3] bg-[#F7FAFD] px-3.5 py-3 text-[14.5px] text-[#0B2A5B] outline-none focus:border-[#2C9BEA] focus:bg-white";
  const check = (icon: string, label: string, done: boolean) => (
    <div className="flex items-center border-b border-[#E8EEF6] py-2.5 last:border-0">
      <span className="flex-1 text-[13.5px] font-bold text-[#0B2A5B]">{icon} {label}</span>
      <span className={`text-[12px] font-bold ${done ? "text-[#0E9F6E]" : "text-[#B45309]"}`}>{done ? "✓ Done" : "To do"}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(10,30,60,.5)] sm:items-center" onClick={close}>
      <div className="w-full max-w-md rounded-t-[26px] bg-white px-[18px] pb-6 pt-2.5 pb-safe text-[#0B2A5B] shadow-2xl sm:rounded-[26px]" onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-[5px] w-11 rounded bg-[#D5DEEA]" />
        {step === 0 && (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[15px] bg-gradient-to-br from-[#FDE68A] to-[#F59E0B] text-[23px]">🛡️</span>
              <div>
                <p className="text-[17px] font-black">Secure your Wallet first</p>
                <p className="text-[12px] font-semibold text-[#6B7FA0]">Just 2 quick steps before sending coins — takes 1 minute</p>
              </div>
            </div>
            <div className="mt-3.5 rounded-2xl bg-[#F6F9FD] px-3">
              {check("❓", hasQuestion ? "Answer your Security Question" : "Security Question", false)}
              {check("🔢", "Your own PIN (4–6 digits)", false)}
            </div>
            <div className="mt-3.5">
              <Key onClick={() => (setErr(""), setStep(1))} disabled={!loaded}>{loaded ? "Start ›" : "…"}</Key>
            </div>
            <button type="button" onClick={onClose} className="mt-3 w-full text-center text-[12.5px] font-bold text-[#8A97AE]">
              Later
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <Steps step={1} />
            {!hasQuestion ? (
              <>
                <p className="text-[17px] font-black">Pick a question</p>
                <p className="text-[12px] font-semibold text-[#6B7FA0]">If you forget your PIN, this answer lets you make a new one</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  {QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setQuestion(q)}
                      className={`rounded-xl px-2.5 py-1.5 text-[12px] font-bold ${q === question ? "bg-[#2C9BEA] text-white" : "bg-[#F1F5FB] text-[#35507E]"}`}
                    >
                      {q.replace(/^What (was|is) (the name of )?/, "").replace(/^./, (c) => c.toUpperCase())}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <p className="text-[17px] font-black">Answer your question</p>
                <p className="mt-2 rounded-xl bg-[#F1F5FB] p-2.5 text-[13.5px] font-semibold text-[#35507E]">❓ {savedQuestion}</p>
              </>
            )}
            <p className="mb-1.5 mt-3 text-[12px] font-extrabold text-[#4A6280]">Answer</p>
            <div className="relative">
              <input type={show ? "text" : "password"} value={answer} onChange={(e) => (setAnswer(e.target.value.slice(0, 200)), setErr(""))} placeholder="Your answer" className={field} />
              <button type="button" onClick={() => setShow((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[16px]" aria-label="Show">
                {show ? "🙈" : "👁"}
              </button>
            </div>
            {!hasQuestion && (
              <>
                <p className="mb-1.5 mt-3 text-[12px] font-extrabold text-[#4A6280]">Confirm answer</p>
                <div className="relative">
                  <input type={show ? "text" : "password"} value={answer2} onChange={(e) => (setAnswer2(e.target.value.slice(0, 200)), setErr(""))} placeholder="Type it again" className={field} />
                  {answer2 && (
                    <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-[12.5px] font-extrabold ${answer2.trim() === answer.trim() ? "text-[#0E9F6E]" : "text-[#DC2626]"}`}>
                      {answer2.trim() === answer.trim() ? "✓ Matches" : "✗"}
                    </span>
                  )}
                </div>
              </>
            )}
            {err && <p className="mt-2 text-[12.5px] text-[#DC2626]">{err}</p>}
            <div className="mt-3.5">
              <Key onClick={nextFromQuestion} disabled={busy}>{busy ? "Checking…" : "Next ›"}</Key>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <Steps step={2} />
            <p className="text-center text-[17px] font-black">{firstPin ? "Enter the PIN again" : "Choose a PIN (4–6 digits)"}</p>
            <p className="text-center text-[12px] font-semibold text-[#6B7FA0]">You&apos;ll need it to send coins</p>
            <div className="my-3.5 flex justify-center gap-2">
              {Array.from({ length: 6 }, (_, i) => (
                <span
                  key={i}
                  className={`flex h-[46px] w-[38px] items-center justify-center rounded-xl border-2 text-[26px] font-black ${i === pin.length ? "border-[#2C9BEA]" : "border-[#E3EAF3]"} ${i < pin.length ? "bg-white" : "bg-[#F7FAFD]"}`}
                >
                  {i < pin.length ? "•" : ""}
                </span>
              ))}
            </div>
            {err && <p className="mb-1.5 text-center text-[12.5px] text-[#DC2626]">{err}</p>}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
                k ? (
                  <button
                    key={i}
                    type="button"
                    disabled={busy}
                    onClick={() => (setErr(""), setPin((p) => (k === "⌫" ? p.slice(0, -1) : p.length < 6 ? p + k : p)))}
                    className="h-12 rounded-[14px] bg-[#F1F5FB] text-[20px] font-extrabold text-[#0B2A5B] shadow-[0_2px_0_#D3E0EE] transition active:translate-y-[2px] active:shadow-none"
                  >
                    {k}
                  </button>
                ) : (
                  <span key={i} />
                )
              )}
            </div>
            <div className="mt-3">
              <Key onClick={pinKey} disabled={busy || pin.length < 4} green={!!firstPin}>
                {busy ? "Saving…" : firstPin ? "✓ Save PIN" : "Continue ›"}
              </Key>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <div className="text-center">
              <span className="mx-auto flex h-[84px] w-[84px] items-center justify-center rounded-full bg-gradient-to-br from-[#A7F3D0] to-[#14B88F] text-[40px] font-black text-[#064E3B] shadow-[0_6px_0_#0A6656]">✓</span>
              <p className="mt-3.5 text-[19px] font-black">Wallet secured! 🎉</p>
              <p className="text-[12.5px] font-semibold text-[#6B7FA0]">You can now send coins safely</p>
            </div>
            <div className="mt-3.5 rounded-2xl bg-[#F6F9FD] px-3">
              {check("❓", "Security Question", true)}
              {check("🔢", "PIN", true)}
            </div>
            <div className="mt-3.5">
              <Key onClick={onDone} green>➤ Send coins now</Key>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
