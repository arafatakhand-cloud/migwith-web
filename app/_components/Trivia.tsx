"use client";

import { useEffect, useRef, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { isClassicNow } from "../../lib/uiStyle";

// 🧠 TRIVIA BOT — the "🧠 Trivia Official" room, plus any CHAT room where
// somebody typed /bot trivia (/bot stop switches it off). Points + leaderboard
// (no coins). Everything runs on the server (triviaStart / triviaAnswer /
// triviaTick / triviaStop / triviaTop), same as TriviaGame.kt:
//   !start bn · !start en · !stop · !top · !topall · !lang bn|en · !help
//   a / b / c / d typed while a question is open = my answer (not posted).

export const TRIVIA_ROOM = "🧠 Trivia Official";

const startCall = httpsCallable(functions, "triviaStart");
const stopCall = httpsCallable(functions, "triviaStop");
const answerCall = httpsCallable(functions, "triviaAnswer");
const tickCall = httpsCallable(functions, "triviaTick");
const topCall = httpsCallable<{ period: string }, { rows?: { username?: string; pts?: number }[] }>(functions, "triviaTop");

type Score = [string, number];

export type TriviaState = {
  roomId: string;
  running: boolean;
  phase: string;
  lang: string;
  qNo: number;
  total: number;
  question: string;
  options: string[];
  startedByUid: string;
  iAnswered: boolean;
  answeredCount: number;
  correctIndex: number;
  lastRight: Score[];
  scores: Score[];
  secondsLeft: number;
  busy: boolean;
  /** My A/B/C/D tap for the current question (-1 = none), only on this device. */
  myPick: number;
  /** Language picked for the next !start. */
  pickedLang: string;
  setPickedLang: (l: string) => void;
  start: (lang: string) => void;
  stop: () => void;
  pick: (choice: number) => void;
  top: { open: boolean; all: boolean; rows: Score[] | null };
  openTop: (all: boolean) => void;
  closeTop: () => void;
};

const errText = (e: any) => e?.message || "Something went wrong.";

export function useTrivia(roomId: string | null, uid: string | undefined, note: (t: string) => void): TriviaState | null {
  const [g, setG] = useState({
    running: false,
    phase: "IDLE",
    lang: "bn",
    qNo: 0,
    total: 10,
    question: "",
    options: [] as string[],
    phaseEndsAt: 0,
    startedByUid: "",
    iAnswered: false,
    answeredCount: 0,
    correctIndex: -1,
    lastRight: [] as Score[],
    scores: [] as Score[],
  });
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [pickedLang, setPickedLang] = useState("bn");
  const [mine, setMine] = useState<{ q: number; pick: number }>({ q: 0, pick: -1 });
  const [top, setTop] = useState<{ open: boolean; all: boolean; rows: Score[] | null }>({ open: false, all: false, rows: null });
  const lastTick = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  useEffect(() => {
    if (!roomId || !uid) return;
    return onSnapshot(doc(db, "trivia_games", roomId), (d) => {
      if (!d.exists()) {
        setG((p) => ({ ...p, running: false, phase: "IDLE" }));
        return;
      }
      const toScores = (list: unknown[]): Score[] =>
        list
          .map((v: any) => (v && typeof v.name === "string" ? ([v.name, Number(v.pts) || 0] as Score) : null))
          .filter((x): x is Score => !!x);
      setG({
        running: d.get("running") === true,
        phase: String(d.get("phase") || "IDLE"),
        lang: String(d.get("lang") || "bn"),
        qNo: Number(d.get("qNo") || 0),
        total: Number(d.get("total") || 10),
        question: String(d.get("question") || ""),
        options: Array.isArray(d.get("options")) ? d.get("options").map(String) : [],
        phaseEndsAt: Number(d.get("phaseEndsAt") || 0),
        startedByUid: String(d.get("startedByUid") || ""),
        iAnswered: (d.get("answered") || {})[uid] === true,
        answeredCount: Number(d.get("answeredCount") || 0),
        correctIndex: Number(d.get("correctIndex") ?? -1),
        lastRight: toScores(Array.isArray(d.get("lastRight")) ? d.get("lastRight") : []),
        scores: toScores(Object.values((d.get("scores") || {}) as Record<string, unknown>)).sort((a, b) => b[1] - a[1]),
      });
    });
  }, [roomId, uid]);

  // Countdown + ask the server to close the question / show the next one when due.
  useEffect(() => {
    if (!roomId) return;
    const t = setInterval(() => {
      const n = Date.now();
      setNow(n);
      if (g.running && g.phaseEndsAt > 0 && n >= g.phaseEndsAt + 250 && n - lastTick.current > 1200 && document.visibilityState === "visible") {
        lastTick.current = n;
        tickCall({ roomId }).catch(() => {});
      }
    }, 250);
    return () => clearInterval(t);
  }, [roomId, g.running, g.phaseEndsAt]);

  if (!roomId) return null;

  const openTop = (all: boolean) => {
    setTop({ open: true, all, rows: null });
    topCall({ period: all ? "all" : "day" })
      .then(({ data }) =>
        setTop((t) => ({
          ...t,
          rows: (data?.rows || []).filter((r) => typeof r?.username === "string").map((r) => [String(r.username), Number(r.pts) || 0] as Score),
        }))
      )
      .catch((e) => {
        setTop((t) => ({ ...t, rows: [] }));
        noteRef.current(`Trivia Bot: ${errText(e)}`);
      });
  };

  return {
    ...g,
    roomId,
    secondsLeft: g.running && g.phase === "QUESTION" ? Math.max(0, Math.ceil((g.phaseEndsAt - now) / 1000)) : 0,
    busy,
    myPick: mine.q === g.qNo ? mine.pick : -1,
    pickedLang,
    setPickedLang,
    start: (lang: string) => {
      if (busy) return;
      setBusy(true);
      setPickedLang(lang);
      startCall({ lang, roomId })
        .catch((e) => noteRef.current(`Trivia Bot: ${errText(e)}`))
        .finally(() => setBusy(false));
    },
    stop: () => {
      stopCall({ roomId }).catch((e) => noteRef.current(`Trivia Bot: ${errText(e)}`));
    },
    pick: (choice: number) => {
      if (!g.running || g.phase !== "QUESTION" || g.iAnswered) return;
      if (mine.q === g.qNo && mine.pick >= 0) return;
      setMine({ q: g.qNo, pick: choice });
      answerCall({ choice, qNo: g.qNo, roomId }).catch((e) => {
        setMine({ q: g.qNo, pick: -1 });
        noteRef.current(`Trivia Bot: ${errText(e)}`);
      });
    },
    top,
    openTop,
    closeTop: () => setTop((t) => ({ ...t, open: false })),
  };
}

/** Chat commands in a Trivia room. True = handled (not posted as chat). */
export function triviaHandleCommand(state: TriviaState, clean: string, note: (t: string) => void): boolean {
  const lower = clean.trim().toLowerCase().replace(/\s+/g, " ");
  const official = state.roomId === TRIVIA_ROOM;
  const help = () =>
    note(
      "Trivia Bot: !start bn (বাংলা) · !start en (English) · tap A·B·C·D (or type a/b/c/d) · !top today · !topall all-time · !stop" +
        (official ? "" : " · /bot stop switches the bot off")
    );
  // !trivia … — works in every room with the bot
  switch (lower) {
    case "!trivia":
    case "!trivia start":
      state.start(state.pickedLang);
      return true;
    case "!trivia bn":
    case "!trivia bangla":
    case "!trivia বাংলা":
    case "!trivia start bn":
      state.start("bn");
      return true;
    case "!trivia en":
    case "!trivia english":
    case "!trivia start en":
      state.start("en");
      return true;
    case "!trivia stop":
    case "!trivia off":
      state.stop();
      return true;
    case "!trivia top":
      state.openTop(false);
      return true;
    case "!trivia topall":
    case "!trivia top all":
      state.openTop(true);
      return true;
    case "!trivia help":
      help();
      return true;
  }
  // a / b / c / d while a question is open = my answer (NOT posted, so nobody can copy it)
  if (state.running && state.phase === "QUESTION" && /^[abcd]$/.test(lower)) {
    state.pick("abcd".indexOf(lower));
    return true;
  }
  switch (lower) {
    case "!start":
      state.start(state.pickedLang);
      return true;
    case "!start bn":
    case "!start bangla":
    case "!start বাংলা":
      state.start("bn");
      return true;
    case "!start en":
    case "!start english":
      state.start("en");
      return true;
    case "!stop":
      state.stop();
      return true;
    case "!top":
      state.openTop(false);
      return true;
    case "!topall":
    case "!top all":
      state.openTop(true);
      return true;
    case "!lang bn":
    case "!lang bangla":
      state.setPickedLang("bn");
      note("Trivia Bot: Next game in বাংলা. Type !start");
      return true;
    case "!lang en":
    case "!lang english":
      state.setPickedLang("en");
      note("Trivia Bot: Next game in English. Type !start");
      return true;
    case "!j":
    case "!join":
      note(
        state.running
          ? "Trivia Bot: No need to join — just tap A · B · C · D! 🧠"
          : "Trivia Bot: No need to join — tap ▶ Start (or type !start bn / !start en), then tap A · B · C · D."
      );
      return true;
    case "!help":
      help();
      return true;
  }
  return false;
}

const INK = "#1B1446";
const SOFT = "#6B6690";
// 📟 Classic app style: orange + blue instead of gold + violet.
const violet = () => (isClassicNow() ? "#2F6ABD" : "#6A4BD8");
const gold = () => (isClassicNow() ? "#F07A00" : "#F2B705");
const PINK = "#E5586A";
const MEDALS = ["🥇", "🥈", "🥉"];

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border px-2.5 py-1 text-xs font-bold"
      style={{ background: selected ? violet() : "#FFFFFF", color: selected ? "#FFFFFF" : violet(), borderColor: `${violet()}99` }}
    >
      {label}
    </button>
  );
}

/** The Trivia panel shown above the input bar (like the app). */
export function TriviaPanel({ state, uid, isStaff }: { state: TriviaState; uid: string; isStaff: boolean }) {
  const reveal = state.phase === "BREAK" && state.correctIndex >= 0;
  const locked = state.phase !== "QUESTION" || state.iAnswered || state.myPick >= 0;
  // 7-second questions (TRIVIA_QUESTION_MS on the server); red for the last 2 seconds.
  const frac = Math.min(1, Math.max(0, state.secondsLeft / 7));
  const low = state.secondsLeft <= 2;
  return (
    <div className="px-2 py-1">
      <div
        className="rounded-[18px] p-[1.5px]"
        style={{ background: `linear-gradient(135deg, ${violet()}, ${gold()}, ${violet()})` }}
      >
        <div className="rounded-[17px] bg-gradient-to-b from-[#F4F0FF] to-[#E9E2FF] p-2.5" style={{ color: INK }}>
          <div className="flex items-center gap-1.5">
            <span className="mr-0.5 text-[15px] font-extrabold">🧠 Trivia</span>
            {state.running ? (
              <>
                <Chip label={state.lang === "bn" ? "বাংলা" : "English"} selected />
                <span className="flex-1" />
                <span className="text-xs font-bold" style={{ color: SOFT }}>
                  Q {state.qNo}/{state.total}
                </span>
              </>
            ) : (
              <>
                <Chip label="বাংলা" selected={state.pickedLang === "bn"} onClick={() => state.setPickedLang("bn")} />
                <Chip label="English" selected={state.pickedLang === "en"} onClick={() => state.setPickedLang("en")} />
                <span className="flex-1" />
              </>
            )}
            <Chip label="🏆 Top" selected={false} onClick={() => state.openTop(false)} />
          </div>

          {!state.running ? (
            <>
              <p className="mt-2 text-xs" style={{ color: SOFT }}>
                {state.pickedLang === "bn"
                  ? "১০টি প্রশ্ন · A B C D থেকে বেছে নিন · দ্রুত সঠিক উত্তর = বেশি পয়েন্ট"
                  : "10 questions · pick A · B · C · D · faster right answer = more points"}
              </p>
              <button
                type="button"
                disabled={state.busy}
                onClick={() => state.start(state.pickedLang)}
                className={`mt-2 h-10 w-full rounded-full bg-gradient-to-r ${isClassicNow() ? "from-[#5A8FD6] to-[#2F6ABD]" : "from-[#6A4BD8] to-[#9B6BFF]"} text-sm font-bold text-white disabled:opacity-60`}
              >
                {state.busy ? "…" : state.pickedLang === "bn" ? "▶\uFE0E শুরু করুন (বাংলা)" : "▶\uFE0E Start (English)"}
              </button>
            </>
          ) : (
            <div className="mt-2 rounded-[14px] bg-white p-3">
              <p className="text-base font-bold leading-[21px]">{state.question}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {state.options.map((text, idx) => {
                  const isMine = idx === state.myPick;
                  const isCorrect = reveal && idx === state.correctIndex;
                  const isWrongMine = reveal && isMine && idx !== state.correctIndex;
                  const bg = isCorrect ? "#1E9E5A" : isWrongMine ? PINK : isMine ? violet() : "#F4F0FF";
                  const lit = isCorrect || isWrongMine || isMine;
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={locked}
                      onClick={() => state.pick(idx)}
                      className="flex items-center rounded-xl border px-2 py-[9px] text-left"
                      style={{ background: bg, borderColor: isCorrect ? "#1E9E5A" : `${violet()}73`, color: lit ? "#FFFFFF" : INK }}
                    >
                      <span
                        className="shrink-0 rounded-full px-[7px] py-px text-xs font-extrabold text-white"
                        style={{ background: lit ? "rgba(255,255,255,.25)" : violet() }}
                      >
                        {"ABCD"[idx] || "?"}
                      </span>
                      <span className="ml-1.5 line-clamp-2 text-[13px] font-semibold">{text}</span>
                    </button>
                  );
                })}
              </div>
              {reveal ? (
                <>
                  <p className="mt-1.5 text-[13px] font-bold" style={{ color: state.myPick >= 0 && state.myPick === state.correctIndex ? "#1E9E5A" : PINK }}>
                    {state.myPick >= 0 && state.myPick === state.correctIndex ? "🎉 Correct! " : state.myPick >= 0 ? "❌ Not this time " : "⏰ Time's up "}
                    {state.lastRight.length === 0 ? "· nobody got it" : `· ${state.lastRight.length} got it`}
                  </p>
                  <p className="text-[11px]" style={{ color: SOFT }}>
                    {state.qNo >= state.total ? "Final results coming…" : "Next question…"}
                  </p>
                </>
              ) : (
                <>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#E6E1F7]">
                      <div className="h-full transition-[width] duration-300" style={{ width: `${frac * 100}%`, background: low ? PINK : violet() }} />
                    </div>
                    <span className="text-xs font-bold" style={{ color: low ? PINK : SOFT }}>
                      {state.secondsLeft}s
                    </span>
                  </div>
                  <p className="text-[10px]" style={{ color: SOFT }}>
                    {locked
                      ? `✓ Answer locked · ${state.answeredCount} answered · result when time is up`
                      : `Faster = more points (10 · 7 · 5) · one answer only · ${state.answeredCount} answered`}
                  </p>
                </>
              )}
            </div>
          )}

          {/* this game's scores */}
          {state.scores.length > 0 && (
            <p className="mt-1.5 truncate text-xs">
              {state.scores
                .slice(0, 5)
                .map(([n, p], i) => `${MEDALS[i] || `${i + 1}.`} ${n} ${p}`)
                .join("   ")}
            </p>
          )}
          {state.running && (uid === state.startedByUid || isStaff) && (
            <div className="text-right">
              <button type="button" onClick={state.stop} className="p-1 text-xs font-bold" style={{ color: PINK }}>
                ⏹ Stop
              </button>
            </div>
          )}
        </div>
      </div>

      {state.top.open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onClick={state.closeTop}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4" style={{ color: INK }} onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-extrabold">{state.top.all ? "🏆 Trivia — All time" : "🏆 Trivia — Today"}</p>
            <div className="mt-2 flex gap-1.5">
              <Chip label="Today" selected={!state.top.all} onClick={() => state.openTop(false)} />
              <Chip label="All time" selected={state.top.all} onClick={() => state.openTop(true)} />
            </div>
            <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto">
              {state.top.rows === null ? (
                <p className="text-sm" style={{ color: SOFT }}>
                  Loading…
                </p>
              ) : state.top.rows.length === 0 ? (
                <p className="text-sm" style={{ color: SOFT }}>
                  No scores yet — be the first!
                </p>
              ) : (
                state.top.rows.map(([n, p], i) => (
                  <div key={`${n}${i}`} className="flex items-center">
                    <span className="w-8 text-center text-[15px]">{MEDALS[i] || `${i + 1}.`}</span>
                    <span className="flex-1 truncate text-sm font-bold">{n}</span>
                    <span className="text-[13px] font-bold" style={{ color: violet() }}>
                      {p} pts
                    </span>
                  </div>
                ))
              )}
            </div>
            <div className="mt-3 text-right">
              <button type="button" onClick={state.closeTop} className="rounded-lg px-3 py-1.5 text-sm font-bold" style={{ color: violet() }}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
