"use client";

import { useEffect, useRef, useState } from "react";

// 🏏 Cricket celebrations — big pop-ups on top of the room when the Cricket
// Bot announces a SIX / FOUR (bat swing + clapping 👏), an OUT (umpire raises
// the finger ☝️), a DRS review (third-umpire TV → NOT OUT / OUT), an LBW
// (Hawk-Eye ball tracking), a CATCH, or a DUCK 🦆 — like CricketCelebration.kt.
// Only NEW bot lines trigger it; chat history never replays celebrations.
// Only the viewer's own balls pop up (a DUCK is shown to everyone).

type Kind = "SIX" | "FOUR" | "OUT" | "DRS" | "DUCK";
type CkEvent = { kind: Kind; name: string; detail?: string; drsOut?: boolean | null; lbw?: boolean; caught?: boolean };

// ---------------------------------------------------------------- 🔊 SOUND
// Short crowd-style sounds made in the browser (no files). On/off is saved
// on this device; the 🔊 / 🔇 button sits in the Cricket box header.
const SOUND_KEY = "migwith.cricketSound";
const listeners = new Set<() => void>();
let soundOn: boolean | null = null;

export function cricketSoundOn(): boolean {
  if (soundOn === null) {
    try {
      soundOn = localStorage.getItem(SOUND_KEY) !== "0";
    } catch {
      soundOn = true;
    }
  }
  return soundOn;
}

export function toggleCricketSound() {
  soundOn = !cricketSoundOn();
  try {
    localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
  } catch {}
  listeners.forEach((l) => l());
}

export function useCricketSoundOn(): boolean {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return cricketSoundOn();
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function crowd(a: AudioContext, seconds: number, peak: number) {
  const len = Math.floor(a.sampleRate * seconds);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const band = a.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 1200;
  band.Q.value = 0.6;
  const gain = a.createGain();
  const t = a.currentTime;
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(peak, t + seconds * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
  src.connect(band).connect(gain).connect(a.destination);
  src.start();
}

function tone(a: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, vol: number, to?: number) {
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  const t = a.currentTime + start;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function play(name: "six" | "four" | "out" | "drs" | "notout" | "duck") {
  if (!cricketSoundOn() || document.visibilityState !== "visible") return;
  const a = audio();
  if (!a) return;
  if (name === "six") {
    crowd(a, 2.2, 0.35);
    [523, 659, 784, 1047].forEach((f, i) => tone(a, f, i * 0.09, 0.25, "triangle", 0.12));
  } else if (name === "four") {
    crowd(a, 1.5, 0.28);
    [587, 784].forEach((f, i) => tone(a, f, i * 0.1, 0.22, "triangle", 0.1));
  } else if (name === "out") {
    crowd(a, 1.2, 0.18);
    tone(a, 330, 0, 0.6, "sawtooth", 0.08, 110);
  } else if (name === "drs") {
    [880, 880, 1175].forEach((f, i) => tone(a, f, i * 0.18, 0.12, "square", 0.06));
  } else if (name === "notout") {
    crowd(a, 1.6, 0.3);
  } else {
    [0, 0.22, 0.44].forEach((s) => tone(a, 620, s, 0.14, "square", 0.07, 420));
  }
}

// ---------------------------------------------------------------- parsing
const nameBefore = (body: string, marker: string) => {
  const i = body.indexOf(marker);
  return i < 0 ? "" : body.slice(0, i).trim().replace(/:$/, "").trim().slice(0, 24);
};

function parse(lines: string[]): CkEvent[] {
  const out: CkEvent[] = [];
  for (let i = 0; i < lines.length; i++) {
    const body = lines[i].replace(/^Cricket Bot:/i, "").trim();
    if (body.includes("{DRS}") && !body.includes("Review result")) {
      // Appeal line; the result is usually the very next line.
      const next = (lines[i + 1] || "").replace(/^Cricket Bot:/i, "").trim();
      const result = next.includes("Review result") ? (next.includes("{NOTOUT}") ? false : next.includes("{OUT}") ? true : null) : null;
      out.push({ kind: "DRS", name: nameBefore(body, ": {DRS}"), drsOut: result, lbw: body.includes("LBW") });
      if (result !== null) i++;
    } else if (body.includes("Review result") && body.includes("{NOTOUT}")) out.push({ kind: "DRS", name: "", drsOut: false });
    else if (body.includes("Review result") && body.includes("{OUT}")) out.push({ kind: "DRS", name: "", drsOut: true });
    else if (body.includes("{DUCK}")) {
      const after = body.slice(body.indexOf("{DUCK}") + 6);
      out.push({ kind: "DUCK", name: after.split(" is out")[0].trim().slice(0, 24) });
    } else if (body.includes("{6}")) out.push({ kind: "SIX", name: nameBefore(body, " hits ") });
    else if (body.includes("{4}")) out.push({ kind: "FOUR", name: nameBefore(body, " hits ") });
    else if (body.includes("{OUT}")) {
      const detail = body.slice(body.indexOf("{OUT}") + 5).trim();
      out.push({ kind: "OUT", name: nameBefore(body, ": {OUT}"), detail, lbw: detail.includes("LBW"), caught: /caught/i.test(detail) });
    }
  }
  return out;
}

const durationOf = (e: CkEvent) =>
  e.kind === "DRS" && e.lbw ? 4800 : e.kind === "DRS" ? 3400 : e.kind === "OUT" && e.lbw ? 4000 : e.kind === "OUT" && e.caught ? 3900 : e.kind === "DUCK" ? 3000 : 2300;

/**
 * Put this once in the room (only when the Cricket Bot is on). It watches
 * the chat lines (text + id) and plays celebrations for NEW ones.
 */
export function CricketCelebrationHost({ messages, roomKey, myName }: { messages: { id: string; text: string }[]; roomKey: string; myName: string }) {
  const seen = useRef<{ room: string; ids: Set<string>; primed: boolean }>({ room: "", ids: new Set(), primed: false });
  const [queue, setQueue] = useState<CkEvent[]>([]);
  const [current, setCurrent] = useState<{ e: CkEvent; key: number } | null>(null);

  useEffect(() => {
    const s = seen.current;
    if (s.room !== roomKey) {
      seen.current = { room: roomKey, ids: new Set(), primed: false };
      setQueue([]);
    }
    const st = seen.current;
    if (!st.primed) {
      // First look at this room: everything already here is history.
      messages.forEach((m) => m.id && st.ids.add(m.id));
      if (messages.length > 0) st.primed = true;
      return;
    }
    const fresh: string[] = [];
    for (const m of messages) {
      if (!m.id || st.ids.has(m.id)) continue;
      st.ids.add(m.id);
      if (/^Cricket Bot:/i.test(m.text)) fresh.push(m.text);
    }
    if (st.ids.size > 2000) st.ids = new Set(messages.map((m) => m.id));
    if (!fresh.length) return;
    const me = myName.trim().slice(0, 24).toLowerCase();
    const events = parse(fresh).filter((e) => e.kind === "DUCK" || (me && e.name.toLowerCase() === me));
    if (events.length) setQueue((q) => [...q, ...events].slice(0, 4));
  }, [messages, roomKey, myName]);

  useEffect(() => {
    if (current || queue.length === 0) return;
    const [e, ...rest] = queue;
    setQueue(rest);
    setCurrent({ e, key: Date.now() });
  }, [current, queue]);

  useEffect(() => {
    if (!current) return;
    const t = setTimeout(() => setCurrent(null), durationOf(current.e) + 150);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  const { e, key } = current;
  return (
    <div className="pointer-events-none fixed inset-0 z-[90] flex items-center justify-center">
      {e.kind === "SIX" || e.kind === "FOUR" ? (
        <Boundary key={key} e={e} />
      ) : e.kind === "OUT" ? (
        e.lbw ? (
          <Delayed key={key} ms={2100} first={<HawkEye name={e.name} hitting title="HAWK-EYE • LBW" />} then={<Out name={e.name} detail="Leg before wicket (LBW)!" />} />
        ) : e.caught ? (
          <Delayed key={key} ms={2000} first={<Catch name={e.name} />} then={<Out name={e.name} detail="Caught out!" />} />
        ) : (
          <Out key={key} name={e.name} detail={e.detail || ""} />
        )
      ) : e.kind === "DRS" ? (
        <Drs key={key} e={e} />
      ) : (
        <Duck key={key} name={e.name} />
      )}
    </div>
  );
}

function Delayed({ ms, first, then }: { ms: number; first: React.ReactNode; then: React.ReactNode }) {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return <>{done ? then : first}</>;
}

const card = "ck-pop flex flex-col items-center rounded-[22px] px-7 py-3.5 text-center";
const big = (colors: string, size: number, glow: string): React.CSSProperties => ({
  background: `linear-gradient(${colors})`,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  color: "transparent",
  fontSize: size,
  fontWeight: 900,
  lineHeight: 1.05,
  filter: `drop-shadow(0 0 10px ${glow})`,
});

// ---------------------------------------------------------------- SIX / FOUR
function Boundary({ e }: { e: CkEvent }) {
  const six = e.kind === "SIX";
  useEffect(() => play(six ? "six" : "four"), [six]);
  const glow = six ? "#FFB300" : "#00B0FF";
  const sparks = ["#FFD54F", "#69F0AE", "#FF4081", "#40C4FF", "#FFFFFF"];
  return (
    <div className="relative flex h-[250px] w-[300px] items-center justify-center">
      {/* sparks ring */}
      {Array.from({ length: 18 }, (_, k) => (
        <span
          key={k}
          className="ck-spark absolute left-1/2 top-1/2 rounded-full"
          style={{
            width: 9 + (k % 3) * 4,
            height: 9 + (k % 3) * 4,
            background: sparks[k % sparks.length],
            ["--a" as string]: `${(k / 18) * 360}deg`,
            animationDelay: `${(k % 6) * 0.12}s`,
          }}
        />
      ))}
      {/* the ball flying away after the shot */}
      <span className={`absolute left-1/2 top-1/2 h-[18px] w-[18px] rounded-full bg-[#C62828] ${six ? "ck-ball-six" : "ck-ball-four"}`} />
      <div
        className={card}
        style={{
          background: six ? "linear-gradient(135deg, #4A148CEE, #880E4FEE)" : "linear-gradient(135deg, #0D47A1EE, #002171EE)",
          border: `2px solid ${glow}`,
          boxShadow: `0 0 28px ${glow}`,
        }}
      >
        <div className="flex items-center gap-2">
          <span className="ck-swing inline-block text-[40px]">🏏</span>
          <span style={big(six ? "#FFF59D, #FFD54F, #FF8F00" : "#FFFFFF, #80D8FF, #00B0FF", 50, glow)}>{six ? "SIX!" : "FOUR!"}</span>
        </div>
        {e.name && <p className="text-base font-bold text-white">{e.name}</p>}
        <div className="mt-1 flex gap-1.5 text-[26px]">
          {[0, 1, 2, 3, 4].map((k) => (
            <span key={k} className={k % 2 === 0 ? "ck-clap" : "ck-clap ck-clap-b"}>
              👏
            </span>
          ))}
        </div>
        <p className="text-xs text-[#FFF8E1]">{six ? "What a shot! Out of the park!" : "Cracking shot to the boundary!"}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- OUT
function Out({ name, detail }: { name: string; detail: string }) {
  useEffect(() => play("out"), []);
  return (
    <div
      className={`${card} min-w-[200px]`}
      style={{ background: "linear-gradient(#1A0000F2, #4A0000F2)", border: "2px solid #FF1744", boxShadow: "0 0 28px #FF1744" }}
    >
      {/* Umpire with the raised finger */}
      <div className="relative h-[110px] w-[110px]">
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[62px] leading-none">🧑‍⚖️</span>
        <span className="ck-finger absolute right-0 top-0 text-[44px] leading-none">☝️</span>
      </div>
      <span className="ck-flash" style={big("#FF8A80, #FF5252, #FF1744", 52, "#FF1744")}>
        OUT!
      </span>
      {name && <p className="text-base font-bold text-white">{name}</p>}
      {detail && <p className="text-[13px] text-[#FFCDD2]">{detail}</p>}
    </div>
  );
}

function NotOut({ name }: { name: string }) {
  useEffect(() => play("notout"), []);
  return (
    <div className={card} style={{ background: "linear-gradient(#004D40F2, #1B5E20F2)", border: "2px solid #00E676", boxShadow: "0 0 28px #00E676" }}>
      <span className="text-[54px] leading-none">🙅‍♂️</span>
      <span style={big("#FFFFFF, #B9F6CA, #69F0AE", 44, "#00E676")}>NOT OUT!</span>
      {name && <p className="text-base font-bold text-white">{name}</p>}
      <p className="text-xs text-[#E8F5E9]">Decision overturned!</p>
      <div className="flex gap-1.5 text-2xl">
        {[0, 1, 2].map((k) => (
          <span key={k} className="ck-clap">
            👏
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------- DRS
function Drs({ e }: { e: CkEvent }) {
  const [result, setResult] = useState(false);
  useEffect(() => {
    if (e.name) play("drs");
    const t = setTimeout(() => setResult(e.drsOut !== null && e.drsOut !== undefined), !e.name ? 200 : e.lbw ? 3000 : 1700);
    return () => clearTimeout(t);
  }, [e]);
  if (result) return e.drsOut ? <Out name={e.name} detail="Review lost — umpire's decision stays" /> : <NotOut name={e.name} />;
  if (e.lbw) return <HawkEye name={e.name} hitting={e.drsOut !== false} title="DRS • LBW REVIEW" />;
  return (
    <div
      className="ck-pop w-[240px] rounded-[18px] p-3.5 text-center"
      style={{ background: "linear-gradient(#120830F2, #311B92F2)", border: "2px solid #B388FF", boxShadow: "0 0 28px #7C4DFF" }}
    >
      <p className="flex items-center justify-center gap-1.5 text-xs font-bold text-white">
        <span className="cb-twinkle inline-block h-[9px] w-[9px] rounded-full bg-[#FF1744]" /> LIVE • THIRD UMPIRE
      </p>
      {/* TV screen with ball-tracking scan line */}
      <div className="relative mt-2 h-24 overflow-hidden rounded-[10px] bg-gradient-to-b from-[#1B5E20] to-[#2E7D32]">
        <span className="absolute inset-y-0 left-[40%] w-[20%] bg-[#D7CCC8]" />
        {[-1, 0, 1].map((k) => (
          <span key={k} className="absolute top-[15%] h-[30%] w-[3px] bg-white" style={{ left: `calc(50% + ${k * 7 - 1.5}px)` }} />
        ))}
        {Array.from({ length: 13 }, (_, k) => (
          <span
            key={k}
            className="ck-dot absolute h-2 w-2 rounded-full bg-[#FF5252]"
            style={{ left: `calc(${20 + 30 * (k / 12)}% - 4px)`, top: `calc(${95 - 60 * (k / 12)}% - 4px)`, animationDelay: `${k * 0.07}s` }}
          />
        ))}
        <span className="ck-scan absolute inset-y-0 w-1 bg-[#00E5FF]/40" />
        <span className="absolute left-1 top-1 text-lg">📺</span>
      </div>
      <p className="mt-2 text-[26px] font-black" style={big("to right, #FFFFFF, #B388FF", 26, "#7C4DFF")}>
        DRS REVIEW
      </p>
      <p className="text-xs text-[#EDE7F6]">{e.name ? `${e.name} — checking the decision…` : "Checking the decision…"}</p>
    </div>
  );
}

// ---------------------------------------------------------------- LBW / Hawk-Eye
function HawkEye({ name, hitting, title }: { name: string; hitting: boolean; title: string }) {
  const [rows, setRows] = useState(0);
  useEffect(() => {
    const ts = [setTimeout(() => setRows(1), 600), setTimeout(() => setRows(2), 860), setTimeout(() => setRows(3), 1560)];
    return () => ts.forEach(clearTimeout);
  }, []);
  // points in a 100×100 box (pitch in perspective, stumps at the top)
  const release = [42, 98];
  const bounce = [49, 70];
  const impact = [50.5, 44];
  const target = hitting ? [50.5, 15] : [62, 15];
  return (
    <div
      className="ck-pop w-[250px] rounded-[18px] p-3.5"
      style={{ background: "linear-gradient(#061A2EF2, #0D2B4AF2)", border: "2px solid #40C4FF", boxShadow: "0 0 28px #00B0FF" }}
    >
      <p className="flex items-center gap-1.5 text-xs font-bold text-white">
        <span className="cb-twinkle inline-block h-[9px] w-[9px] rounded-full bg-[#FF1744]" /> {title}
      </p>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-2 h-[150px] w-full rounded-[10px] bg-gradient-to-b from-[#1B5E20] to-[#388E3C]">
        <polygon points="40,6 60,6 80,100 20,100" fill="#D7CCC8" />
        <rect x="45.5" y="6" width="9" height="94" fill="#FF174433" />
        {[-1, 0, 1].map((k) => (
          <rect key={k} x={50 + k * 3 - 0.6} y="6" width="1.2" height="17" fill="#FFFFFF" />
        ))}
        <rect x="46.5" y="5" width="7" height="1" fill="#FFE082" />
        <rect x="46.5" y="34" width="8" height="20" rx="2" fill="#F5F5F5" opacity="0.85" />
        <polyline
          className="ck-track1"
          points={`${release} ${bounce} ${impact}`}
          fill="none"
          stroke="#FF5252"
          strokeWidth="3"
          strokeLinecap="round"
          pathLength={100}
        />
        <line
          className="ck-track2"
          x1={impact[0]}
          y1={impact[1]}
          x2={target[0]}
          y2={target[1]}
          stroke="#40C4FF"
          strokeWidth="3"
          strokeDasharray="5 3"
        />
        {rows >= 3 && hitting && <circle cx={target[0]} cy={target[1]} r="7" fill="#FF1744" opacity="0.35" />}
      </svg>
      {(
        [
          ["PITCHING", "IN LINE", true, 1],
          ["IMPACT", "IN LINE", true, 2],
          ["WICKETS", hitting ? "HITTING" : "MISSING", hitting, 3],
        ] as const
      ).map(([label, value, red, need]) => (
        <div key={label} className="flex items-center py-0.5 transition-opacity" style={{ opacity: rows >= need ? 1 : 0.15 }}>
          <span className="w-20 text-xs font-bold text-white">{label}</span>
          <span className="rounded-md px-2.5 py-0.5 text-xs font-black text-white" style={{ background: red ? "#D50000" : "#00C853" }}>
            {rows >= need ? value : "…"}
          </span>
        </div>
      ))}
      {name && <p className="mt-1 text-xs text-[#E1F5FE]">{name} — Leg before wicket?</p>}
    </div>
  );
}

// ---------------------------------------------------------------- CAUGHT
function Catch({ name }: { name: string }) {
  useEffect(() => {
    const t = setTimeout(() => play("notout"), 1100); // fielders cheer the catch
    return () => clearTimeout(t);
  }, []);
  return (
    <div
      className="ck-pop w-[250px] rounded-[20px] p-3.5 text-center"
      style={{ background: "linear-gradient(#0A2342F2, #123D6BF2)", border: "2px solid #FF9100", boxShadow: "0 0 28px #FF9100" }}
    >
      <div className="relative h-[150px] overflow-hidden rounded-xl bg-gradient-to-b from-[#64B5F6] via-[#BBDEFB] to-[#43A047]">
        <span className="ck-sky absolute h-[18px] w-[18px] rounded-full bg-[#C62828]" />
        <span className="absolute bottom-2.5 left-2 text-[30px]">🏏</span>
        <span className="ck-fielder absolute bottom-1.5 right-2.5 flex flex-col items-center leading-none">
          <span className="text-[26px]">🧤</span>
          <span className="-scale-x-100 text-[34px]">🏃</span>
        </span>
      </div>
      <p className="ck-word mt-1.5" style={big("#FFF3E0, #FFB74D, #FF6D00", 42, "#FF9100")}>
        CAUGHT!
      </p>
      <p className="text-xs text-[#E3F2FD]">{name ? `${name} skies it… and it's taken!` : "Skied… and it's taken!"}</p>
    </div>
  );
}

// ---------------------------------------------------------------- 🦆 DUCK (out for 0)
function Duck({ name }: { name: string }) {
  useEffect(() => play("duck"), []);
  return (
    <div
      className={`${card} min-w-[220px]`}
      style={{ background: "linear-gradient(#4FC3F7F2, #0288D1F2, #006064F2)", border: "2px solid #FFD600", boxShadow: "0 0 28px #FFD600" }}
    >
      <div className="relative h-24 w-[200px]">
        <span className="absolute bottom-0 left-0 h-5 w-full rounded-[50%] bg-[#29B6F6]" />
        <span className="ck-duck absolute bottom-1.5 left-1/2 text-[64px] leading-none">🦆</span>
        <span className="absolute bottom-1 right-[18px] text-lg">🥚</span>
      </div>
      <span style={big("#FFFDE7, #FFEE58, #FFB300", 48, "#FFD600")}>DUCK!</span>
      {name && <p className="text-base font-bold text-white">{name} is out for 0</p>}
      <div className="flex gap-1 text-[22px]">
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className={k % 2 === 0 ? "ck-clap" : "ck-clap ck-clap-b"}>
            😂
          </span>
        ))}
      </div>
      <p className="text-xs text-[#FFF9C4]">Quack quack! 🦆</p>
    </div>
  );
}
