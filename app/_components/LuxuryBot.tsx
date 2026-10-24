"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { awardUserXp } from "../../lib/xp";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../lib/firebase";
import { LB_KINDS, StyleShopDialog, useInventory, type ShopItem } from "./StyleShop";
import { isClassicNow } from "../../lib/uiStyle";
import { useRememberedAmount } from "../../lib/amountMemory";

// 👻 Luxury Bot — the web side only shows the round and sends bets. Money,
// results and the round itself are handled by the Cloud Functions
// (startLuxuryRound / placeLuxuryBotBet / settleLuxuryRound), same as the app.

function betTotalLabel(total: number): string {
  if (total <= 0) return "0";
  if (total < 1000) return String(total);
  if (total % 1000 === 0) return `${total / 1000}k`;
  return `${(total / 1000).toFixed(1)}k`;
}

export const LUXURY_ROOM = "👻 Luxury Bot Official";

export const LUXURY_CHARACTERS = [
  "🕵️ Chor",
  "🥷 Dakat",
  "👮 Police",
  "👨 Babu",
  "🧑‍🌾 Krishok",
  "💰 Mohajon",
];

const CHIPS = [500, 1000, 2000, 5000, 10000, 12000];

const startRound = httpsCallable<{ roomId: string }, { claimed?: boolean; bettingEndsAt?: number }>(
  functions,
  "startLuxuryRound"
);
const placeBet = httpsCallable(functions, "placeLuxuryBotBet");
const settleRound = httpsCallable(functions, "settleLuxuryRound");

function opId(): string {
  return "lux_" + crypto.randomUUID().replace(/-/g, "");
}

export type LuxuryState = {
  running: boolean;
  phase: string;
  round: number;
  endsAt: number;
  controllerUid: string;
  secondsLeft: number;
  myBets: Record<string, number>;
  starting: boolean;
  start: () => Promise<void>;
};

export function useLuxuryBot(enabled: boolean, uid: string | undefined, note: (t: string) => void): LuxuryState | null {
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("IDLE");
  const [round, setRound] = useState(0);
  const [endsAt, setEndsAt] = useState(0);
  const [controllerUid, setControllerUid] = useState("");
  const [settled, setSettled] = useState(false);
  const [myBets, setMyBets] = useState<Record<string, number>>({});
  const [now, setNow] = useState(Date.now());
  const [starting, setStarting] = useState(false);
  const rescuedRound = useRef(0);
  const noteRef = useRef(note);
  noteRef.current = note;

  // The round document.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LUXURY_ROOM), (snap) => {
      setRunning(snap.get("botRunning") === true);
      setPhase(String(snap.get("phase") || "IDLE"));
      setRound(Number(snap.get("roundNumber") || 0));
      setEndsAt(Number(snap.get("serverEndsAt") || snap.get("bettingEndsAt") || 0));
      setControllerUid(String(snap.get("controllerUid") || ""));
      setSettled(Boolean(snap.get("settledAt") || snap.get("settlementStartedAt")));
    });
  }, [enabled, uid]);

  // My bets this round.
  useEffect(() => {
    if (!enabled || !uid) return;
    return onSnapshot(doc(db, "room_game", LUXURY_ROOM, "user_bets", uid), (snap) => {
      const bets = (snap.get("bets") || {}) as Record<string, number>;
      setMyBets(Number(snap.get("roundNumber") || -1) === round ? bets : {});
    });
  }, [enabled, uid, round]);

  // Countdown tick.
  useEffect(() => {
    if (!enabled) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [enabled]);

  // Rescue: if a round is well past its deadline and nobody finished it, ask
  // the server to finish it (the app's other devices do the same). Only for
  // rounds this browser does not control — the server finishes those itself.
  useEffect(() => {
    if (!enabled || !running || phase !== "BETTING" || settled || !endsAt) return;
    if (controllerUid === uid) return;
    if (now < endsAt + 6000 || rescuedRound.current === round) return;
    rescuedRound.current = round;
    settleRound({ roomId: LUXURY_ROOM, roundNumber: round }).catch(() => {});
  }, [enabled, running, phase, settled, endsAt, controllerUid, uid, now, round]);

  if (!enabled) return null;

  const secondsLeft =
    running && phase === "BETTING" && endsAt ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : 0;

  return {
    running,
    phase,
    round,
    endsAt,
    controllerUid,
    secondsLeft,
    myBets,
    starting,
    start: async () => {
      if (starting) return;
      setStarting(true);
      try {
        const { data } = await startRound({ roomId: LUXURY_ROOM });
        if (!data?.claimed) noteRef.current("👻 Luxury Bot: A round is already running.");
      } catch (err: any) {
        noteRef.current(`👻 Luxury Bot: Could not start the bot. ${err?.message || "Please try again."}`);
      } finally {
        setStarting(false);
      }
    },
  };
}

// 🎨 Bet box colours (the app's LbBoxSkins). Royal Night is free; the rest
// are bought through buyLuxuryItem and kept in lb_inventory/{uid}.
export type LbSkin = ShopItem & {
  bgTop: string; bgBottom: string; chip: string; accent: string; accent2: string; accentText: string;
  cream: string; tileTop: string; tileBottom: string; tileBase: string; tileBorder: string;
};

export const LB_SKINS: LbSkin[] = [
  // 🫧 Clear Glass (shown FIRST in the shop) — a see-through box (the chat shows behind it), bright white rims, dark-blue writing
  { id: "glass", name: "Clear Glass", emoji: "🫧", price: 150000, bgTop: "rgba(255,255,255,.34)", bgBottom: "rgba(255,255,255,.1)", chip: "rgba(255,255,255,.22)", accent: "#3B82F6", accent2: "#A5D8FF", accentText: "#1E3A6E", cream: "#0B2A5B", tileTop: "rgba(255,255,255,.4)", tileBottom: "rgba(255,255,255,.14)", tileBase: "rgba(255,255,255,.1)", tileBorder: "rgba(255,255,255,.92)" },
  // 🫧 Four more glass boxes (demos A–D): 3D rim, pastel per character, raised white, gradient ring
  { id: "glass3d", name: "Glass 3D Rim", emoji: "💠", price: 150000, bgTop: "rgba(255,255,255,.5)", bgBottom: "rgba(255,255,255,.25)", chip: "rgba(255,255,255,.28)", accent: "#3B82F6", accent2: "#A5D8FF", accentText: "#1E3A6E", cream: "#0B2A5B", tileTop: "rgba(255,255,255,.62)", tileBottom: "rgba(255,255,255,.28)", tileBase: "transparent", tileBorder: "rgba(255,255,255,.95)" },
  { id: "glasspastel", name: "Pastel Glass", emoji: "🍬", price: 150000, bgTop: "rgba(255,255,255,.5)", bgBottom: "rgba(255,255,255,.25)", chip: "rgba(255,255,255,.28)", accent: "#3B82F6", accent2: "#A5D8FF", accentText: "#1E3A6E", cream: "#0B2A5B", tileTop: "rgba(255,255,255,.62)", tileBottom: "rgba(255,255,255,.28)", tileBase: "transparent", tileBorder: "rgba(255,255,255,.95)" },
  { id: "white3d", name: "White 3D", emoji: "🕊️", price: 150000, bgTop: "rgba(255,255,255,.5)", bgBottom: "rgba(255,255,255,.25)", chip: "#EAF2FF", accent: "#3B82F6", accent2: "#A5D8FF", accentText: "#1E3A6E", cream: "#0B2A5B", tileTop: "#FFFFFF", tileBottom: "#EAF2FF", tileBase: "transparent", tileBorder: "#FFFFFF" },
  { id: "glassring", name: "Glass Ring", emoji: "💍", price: 150000, bgTop: "rgba(255,255,255,.5)", bgBottom: "rgba(255,255,255,.25)", chip: "rgba(255,255,255,.35)", accent: "#3B82F6", accent2: "#C8B6FF", accentText: "#1E3A6E", cream: "#0B2A5B", tileTop: "rgba(255,255,255,.7)", tileBottom: "rgba(255,255,255,.35)", tileBase: "transparent", tileBorder: "#9CC8FF" },
  { id: "royal", name: "Royal Night", emoji: "👑", price: 0, bgTop: "#1E1A2E", bgBottom: "#151222", chip: "#2A2440", accent: "#D4AF37", accent2: "#FFF0B3", accentText: "#F2D675", cream: "#F2E6C2", tileTop: "#3A3350", tileBottom: "#27213A", tileBase: "#0E0B18", tileBorder: "#5A4F7A" },
  { id: "ocean", name: "Ocean Breeze", emoji: "🌊", price: 50000, bgTop: "#0B2A3F", bgBottom: "#061826", chip: "#12384F", accent: "#3FC1E8", accent2: "#B8F1FF", accentText: "#9BE7FF", cream: "#DDF6FF", tileTop: "#17506E", tileBottom: "#0E3349", tileBase: "#04121B", tileBorder: "#2E86A8" },
  { id: "emerald", name: "Emerald Palace", emoji: "💚", price: 75000, bgTop: "#0E3324", bgBottom: "#071C13", chip: "#134430", accent: "#2ED48A", accent2: "#C8FFE3", accentText: "#9BF5C8", cream: "#DFF8EA", tileTop: "#1B5A3E", tileBottom: "#113B29", tileBase: "#05140D", tileBorder: "#31956A" },
  { id: "rose", name: "Pink Velvet", emoji: "🌸", price: 100000, bgTop: "#3A1228", bgBottom: "#220818", chip: "#4E1A36", accent: "#FF5C9A", accent2: "#FFD1E3", accentText: "#FFB3D1", cream: "#FFE3EE", tileTop: "#66203F", tileBottom: "#45152B", tileBase: "#19060F", tileBorder: "#B0447A" },
  { id: "pearl", name: "Pearl White", emoji: "🤍", price: 60000, bgTop: "#FFFFFF", bgBottom: "#EFF1F7", chip: "#E4E7F0", accent: "#C9A227", accent2: "#FFE58A", accentText: "#5A4300", cream: "#2B2B3A", tileTop: "#FFFFFF", tileBottom: "#EAEDF5", tileBase: "#C3C7D6", tileBorder: "#D3D7E3" },
  { id: "sky", name: "Sky Blue", emoji: "☁️", price: 80000, bgTop: "#EAF6FF", bgBottom: "#D1EAFF", chip: "#CBE5FB", accent: "#2F8FE0", accent2: "#8FD3FF", accentText: "#0E4C80", cream: "#123A5C", tileTop: "#FFFFFF", tileBottom: "#DFF0FF", tileBase: "#A5CBEB", tileBorder: "#9CC9EE" },
  { id: "mint", name: "Mint Fresh", emoji: "🍃", price: 90000, bgTop: "#EBFFF5", bgBottom: "#D0F6E2", chip: "#CAEEDB", accent: "#1FB878", accent2: "#9BF0C8", accentText: "#0B5B3A", cream: "#0F3D2A", tileTop: "#FFFFFF", tileBottom: "#DFF8EB", tileBase: "#A2DABD", tileBorder: "#98DDB9" },
  { id: "peach", name: "Peach Blossom", emoji: "🍑", price: 110000, bgTop: "#FFF4ED", bgBottom: "#FFDFCF", chip: "#FFE1D3", accent: "#FF7A59", accent2: "#FFC2A8", accentText: "#8A3018", cream: "#4A2216", tileTop: "#FFFFFF", tileBottom: "#FFECE2", tileBase: "#EDB8A1", tileBorder: "#F5C3AE" },
  { id: "lavender", name: "Lavender Dream", emoji: "💜", price: 130000, bgTop: "#F7F1FF", bgBottom: "#E5D8FF", chip: "#E5D9FF", accent: "#8A5CF5", accent2: "#D2BBFF", accentText: "#4A2A99", cream: "#2E1A63", tileTop: "#FFFFFF", tileBottom: "#EEE6FF", tileBase: "#C4AFF0", tileBorder: "#CDB8F7" },
  { id: "sunset", name: "Golden Sunset", emoji: "🌅", price: 125000, bgTop: "#3A1E0A", bgBottom: "#221004", chip: "#4F2B10", accent: "#FF9A3C", accent2: "#FFE0A3", accentText: "#FFC98F", cream: "#FFEAD6", tileTop: "#6B3A16", tileBottom: "#47250C", tileBase: "#1A0C03", tileBorder: "#B8682C" },
  { id: "crimson", name: "Crimson Fire", emoji: "🔥", price: 150000, bgTop: "#360A0E", bgBottom: "#1E0507", chip: "#4A1015", accent: "#FF4A3D", accent2: "#FFC66E", accentText: "#FF9E9B", cream: "#FFE1E0", tileTop: "#661A1F", tileBottom: "#431014", tileBase: "#160405", tileBorder: "#B8352F" },
  { id: "galaxy", name: "Purple Galaxy", emoji: "🌌", price: 175000, bgTop: "#1A0E40", bgBottom: "#0B0524", chip: "#261659", accent: "#B388FF", accent2: "#7DF9FF", accentText: "#D9C2FF", cream: "#EEE4FF", tileTop: "#3A2478", tileBottom: "#241452", tileBase: "#07031A", tileBorder: "#7A55E6" },
  { id: "diamond", name: "Diamond Ice", emoji: "💎", price: 200000, bgTop: "#1B2E3E", bgBottom: "#0C1823", chip: "#243C50", accent: "#DDEFFF", accent2: "#8FD3FF", accentText: "#FFFFFF", cream: "#E6F0F8", tileTop: "#34556E", tileBottom: "#213A4E", tileBase: "#08121A", tileBorder: "#A9D2F0" },
];

// 📟 Classic app style: a light box (white / grey, orange accents, navy text)
// for everyone — not sold in the shop; bought colours return in Modern.
export const LB_CLASSIC_SKIN: LbSkin = {
  id: "classic_ui", name: "Classic", emoji: "📟", price: 0, bgTop: "#FFFFFF", bgBottom: "#EEF1F5", chip: "#E3E8EE",
  accent: "#F07A00", accent2: "#FFC27A", accentText: "#7A3A00", cream: "#16315F",
  tileTop: "#FFFFFF", tileBottom: "#E9EEF4", tileBase: "#B9C4D2", tileBorder: "#C9D2DE",
};
const LB_GLASS_3D = new Set(["glass3d", "glasspastel", "white3d", "glassring"]);
/** Any see-through glass box (the dark game strip behind it is hidden). */
export const lbIsGlass = (skin: LbSkin) => skin.id === "glass" || LB_GLASS_3D.has(skin.id);

// Pastel tint for each character slot (Laila, Majnu, Romeo, Juliet, Shirin, Farhad).
const LB_PASTELS = ["#FFD6E7", "#FFE6C7", "#D6E8FF", "#F4D9FF", "#FFD9D9", "#D9F5EC"];
// 🎨 The coloured 3D edge of each glass box's tiles (pastel: one per character).
const LB_RIMS: Record<string, string> = { glass: "#8DB8EE", glass3d: "#6FA3EA", white3d: "#A9BEDD", glassring: "#A993F2" };
// …and of the whole bet box's frame.
const LB_BOX_RIMS: Record<string, string> = { ...LB_RIMS, glasspastel: "#C99BF0" };
const LB_PASTEL_RIMS = ["#F49AC1", "#F2B266", "#86B4F0", "#C99BF0", "#F09A9A", "#76CFAF"];
const lbRim = (skin: LbSkin, slot: number) =>
  skin.id === "glasspastel" ? LB_PASTEL_RIMS[slot % LB_PASTEL_RIMS.length] : LB_RIMS[skin.id] || "#8DB8EE";
/** Floating 3D look: white top edge, coloured sides and bottom, a coloured lip under it. */
const lbFloat = (rim: string): CSSProperties => ({
  borderWidth: 2,
  borderStyle: "solid",
  borderColor: `rgba(255,255,255,.95) ${rim}cc ${rim} ${rim}cc`,
  boxShadow: `inset 0 2px 1px #fff, inset 0 -3px 5px rgba(40,80,160,.12), 0 3px 0 ${rim}, 0 7px 12px rgba(40,80,160,.22)`,
});

/** An open, un-bet character tile (slot = its position, for the pastel tints). */
export function lbTileFace(skin: LbSkin, slot: number): CSSProperties {
  const rim = lbRim(skin, slot);
  switch (skin.id) {
    case "glass":
    case "glass3d":
      return { background: `linear-gradient(${skin.tileTop}, ${skin.tileBottom})`, ...lbFloat(rim) };
    case "glasspastel": {
      const t = LB_PASTELS[slot % LB_PASTELS.length];
      return { background: `linear-gradient(${t}cc, ${t}55)`, ...lbFloat(rim) };
    }
    case "white3d":
      return { background: "linear-gradient(#fff, #eaf2ff)", ...lbFloat(rim) };
    case "glassring":
      return {
        background: "linear-gradient(rgba(255,255,255,.7), rgba(255,255,255,.35)) padding-box, linear-gradient(160deg, #9cc8ff, #c8b6ff, #ffffff) border-box",
        border: "2px solid transparent",
        boxShadow: `inset 0 2px 1px #fff, 0 3px 0 ${rim}, 0 7px 12px rgba(40,80,160,.22)`,
      };
  }
  return { background: `linear-gradient(${skin.tileTop}, ${skin.tileBottom})`, border: `1px solid ${skin.tileBorder}` };
}

/** An open amount chip. The glass boxes use a blue 3D chip when selected. */
export function lbChipFace(skin: LbSkin, selected: boolean): CSSProperties {
  if (LB_GLASS_3D.has(skin.id)) {
    if (selected)
      return {
        background: "linear-gradient(rgba(255,255,255,.38), transparent 48%), linear-gradient(#5aa2ff, #1565d8)",
        border: "1.5px solid rgba(255,255,255,.85)",
        boxShadow: "inset 0 -3px 4px rgba(0,0,0,.12), 0 6px 14px rgba(21,101,216,.45)",
        color: "#fff",
      };
    const face = lbTileFace(skin.id === "glasspastel" ? { ...skin, id: "glass3d" } : skin, 0);
    return { ...face, color: skin.cream };
  }
  if (skin.id === "glass" && !selected) return { ...lbTileFace(skin, 0), color: skin.cream };
  return {
    background: selected ? `linear-gradient(${skin.accent2}, ${skin.accent})` : `linear-gradient(${skin.tileTop}, ${skin.chip})`,
    border: `1px solid ${selected ? skin.accent : skin.tileBorder}`,
    color: selected ? "#2A1E00" : skin.cream,
  };
}

/** The bet total under each character: blue in the glass boxes. */
export const lbValueColor = (skin: LbSkin) => (LB_GLASS_3D.has(skin.id) ? "#1565D8" : skin.cream);
/** Shine on the top half of a glass tile / chip. */
export const lbHasShine = (skin: LbSkin) => skin.id === "glass3d" || skin.id === "glasspastel" || skin.id === "glassring";

/** Bet box frame. "Clear Glass" uses the same recipe as the "Mention a user" panel. */
export function lbBoxStyle(skin: LbSkin, borderPx = 1.6): CSSProperties {
  // 🫧 glass boxes: a coloured 3D frame + a lip under it, so the box stands out from the room
  const frame = LB_BOX_RIMS[skin.id];
  const frameStyle: CSSProperties = frame
    ? {
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: `${frame}99 ${frame} ${frame} ${frame}`,
        boxShadow: `inset 0 1.5px 1px #fff, 0 4px 0 ${frame}, 0 10px 24px rgba(40,80,160,.22)`,
      }
    : {};
  if (LB_GLASS_3D.has(skin.id)) {
    return {
      background: "linear-gradient(rgba(255,255,255,.5), rgba(255,255,255,.25))",
      ...frameStyle,
      backdropFilter: "blur(12px) saturate(1.4)",
      WebkitBackdropFilter: "blur(12px) saturate(1.4)",
    };
  }
  if (skin.id === "glass") {
    return {
      background: "linear-gradient(160deg, rgba(255,255,255,.34), rgba(255,255,255,.1))",
      ...frameStyle,
      backdropFilter: "blur(6px) saturate(1.4)",
      WebkitBackdropFilter: "blur(6px) saturate(1.4)",
    };
  }
  return {
    background: `linear-gradient(${skin.bgTop}, ${skin.bgBottom}) padding-box, linear-gradient(135deg, ${skin.accent}, ${skin.accent2}, ${skin.accent}) border-box`,
    border: `${borderPx}px solid transparent`,
    boxShadow: `0 3px 10px ${skin.accent}55`,
  };
}

export function lbSkinNow(id: string | undefined): LbSkin {
  if (isClassicNow()) return LB_CLASSIC_SKIN;
  // (the free Royal Night is the default — not simply the first in the list)
  return LB_SKINS.find((k) => k.id === id) || LB_SKINS.find((k) => k.id === "royal")!;
}

function LbSkinPreview({ skin }: { skin: LbSkin }) {
  return (
    <div
      className="rounded-xl p-1.5"
      style={
        lbIsGlass(skin)
          ? { background: "linear-gradient(#dfe8f5, #eef1f6)", border: "1.2px solid #fff" }
          : { background: `linear-gradient(${skin.bgTop}, ${skin.bgBottom})`, border: `1.2px solid ${skin.accent}` }
      }
    >
      <div className="flex gap-[3px]">
        {["🧕", "🤵", "💃"].map((e, i) => (
          <span
            key={e}
            className="flex h-[30px] flex-1 items-center justify-center rounded-[7px] text-sm"
            style={lbTileFace(skin, [0, 2, 4][i])}
          >
            {e}
          </span>
        ))}
      </div>
      <div className="mt-1 flex gap-[3px]">
        {["1k", "5k", "10k"].map((t, i) => (
          <span
            key={t}
            className="flex h-3.5 flex-1 items-center justify-center rounded-[7px] text-[7px] font-bold"
            style={{ ...lbChipFace(skin, i === 1), border: undefined, boxShadow: undefined }}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

export function LbStyleDialog({ inv, onClose }: { inv: ReturnType<typeof useInventory>; onClose: () => void }) {
  return (
    <StyleShopDialog
      title="🎨 Bet Box Colours"
      subtitle="Royal is free · others from 50,000 coins · saved to your account"
      theme={{ bg: "#14111F", border: "#D4AF37", title: "#F2D675", sub: "#B9B2CC", accent: "linear-gradient(90deg, #D4AF37, #FFF0B3)", accentInk: "#1A1200" }}
      tabs={[{ label: "Box", kind: "box", items: LB_SKINS, noun: "bet box colour", preview: (s: LbSkin) => <LbSkinPreview skin={s} /> }]}
      inv={inv}
      buyFn="buyLuxuryItem"
      setFn="setLuxuryStyle"
      opPrefix="lb"
      onClose={onClose}
    />
  );
}

export function LuxuryBetBox({ state, uid, note }: { state: LuxuryState; uid: string; note: (t: string) => void }) {
  const [amount, setAmount] = useRememberedAmount("bot", 500);
  const [inFlight, setInFlight] = useState(0);
  const [collapsed, setCollapsed] = useState(false);
  // Bets sent but not yet seen in the round document, like the app's
  // optimisticBetTotals: the label goes up at once, rolled back on failure.
  const [optimistic, setOptimistic] = useState<Record<string, number>>({});
  const [lastBet, setLastBet] = useState<{ character: string; amount: number } | null>(null);
  const lastBetAt = useRef(0);
  const lastTap = useRef<{ character: string; at: number }>({ character: "", at: 0 });
  // ✨ smooth feel: the first tap lights the tile up, a placed bet makes it bounce
  const [armed, setArmed] = useState("");
  const [popped, setPopped] = useState<{ c: string; n: number }>({ c: "", n: 0 });
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastClosedNoteAt = useRef(0);
  const canBet = state.running && state.phase === "BETTING" && state.secondsLeft > 0;

  // New round: start clean.
  useEffect(() => {
    setOptimistic({});
    setLastBet(null);
  }, [state.round]);

  const shownTotal = (c: string) => Math.max(Number(state.myBets[c] || 0), Number(optimistic[c] || 0));

  const bet = async (character: string, betAmount: number) => {
    if (!canBet) return;
    const now = Date.now();
    if (now - lastBetAt.current < 1000) return; // the app's 1 s guard
    if (betAmount < 100 || betAmount > 12000) return;
    lastBetAt.current = now;
    setLastBet({ character, amount: betAmount });
    setOptimistic((o) => ({ ...o, [character]: Math.max(Number(o[character] || 0), Number(state.myBets[character] || 0)) + betAmount }));
    setInFlight((n) => n + 1);
    try {
      await placeBet({
        roomGamePath: `room_game/${LUXURY_ROOM}`,
        character,
        amount: betAmount,
        expectedRound: state.round,
        operationId: opId(),
      });
      awardUserXp(uid, 3, "luxury_bot_bet", 15_000); // like the app
    } catch (err: any) {
      setOptimistic((o) => ({ ...o, [character]: Math.max(0, Number(o[character] || 0) - betAmount) }));
      const msg = String(err?.message || "");
      if (/too fast/i.test(msg)) return;
      if (/closed/i.test(msg)) {
        if (Date.now() - lastClosedNoteAt.current < 8000) return;
        lastClosedNoteAt.current = Date.now();
        note("👻 Luxury Bot: Betting is closed.");
        return;
      }
      if (/insufficient|not enough/i.test(msg)) note("👻 Luxury Bot: Insufficient coins.");
      else if (/round/i.test(msg)) note("👻 Luxury Bot: Round changed. Please try again.");
      else note(`👻 Luxury Bot: Bet rejected. ${msg || "Please try again."}`);
    } finally {
      setInFlight((n) => n - 1);
    }
  };

  // Like the app: one tap does nothing, a second tap on the same character
  // within half a second places one bet.
  const tap = (character: string) => {
    const now = Date.now();
    const prev = lastTap.current;
    if (armTimer.current) clearTimeout(armTimer.current);
    if (prev.character === character && now - prev.at <= 600) {
      lastTap.current = { character: "", at: 0 };
      setArmed("");
      setPopped((p) => ({ c: character, n: p.n + 1 }));
      bet(character, amount);
    } else {
      lastTap.current = { character, at: now };
      setArmed(character);
      armTimer.current = setTimeout(() => setArmed(""), 600);
    }
  };

  const myTotal = LUXURY_CHARACTERS.reduce((a, c) => a + shownTotal(c), 0);
  const inv = useInventory("lb_inventory", uid, LB_KINDS);
  const [showStyles, setShowStyles] = useState(false);
  const skin = lbSkinNow(inv.active.box);
  const urgent = canBet && state.secondsLeft <= 10;
  const iconBtn = "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold";

  return (
    <div className="px-[7px] py-[3px]">
      <div
        className={`rounded-2xl px-[7px] py-1${lbIsGlass(skin) ? " lb-glass" : ""}`}
        style={lbBoxStyle(skin)}
      >
        <div className="flex items-center gap-[3px]">
          {state.running && (
            <span
              className={`rounded-xl px-1.5 text-[9px] font-bold ${urgent ? "lb-blink" : ""}`}
              style={{
                background: urgent ? "#E53935" : skin.chip,
                color: urgent ? "#fff" : skin.accentText,
                border: `1px solid ${urgent ? "#E53935" : skin.accentText}`,
              }}
            >
              {state.phase === "BETTING" ? (state.secondsLeft > 0 ? `${state.secondsLeft}s` : "🎲") : "🎲"}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[10px] font-bold" style={{ color: skin.accentText }}>
            {inFlight > 0 ? "⏳ Sending bet…" : state.running && state.phase !== "BETTING" ? "🎲 Result…" : "👻 Luxury Bot · tap 2x to bid"}
          </span>
          {canBet && lastBet && (
            <>
              <button
                type="button"
                onClick={() => bet(lastBet.character, lastBet.amount)}
                title="Repeat last bet"
                className={iconBtn}
                style={{ background: skin.chip, border: `1px solid ${skin.accent}`, color: skin.accent }}
              >
                ↻
              </button>
              <button
                type="button"
                onClick={() => bet(lastBet.character, Math.min(lastBet.amount * 2, 12000))}
                title="Double last bet"
                className={`${iconBtn} !text-[8px]`}
                style={{ background: skin.chip, border: `1px solid ${skin.accent}`, color: skin.accent }}
              >
                ×2
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => setShowStyles(true)}
            title="Box colours"
            className={iconBtn}
            style={{ background: `linear-gradient(135deg, ${skin.accent}, ${skin.accent2})` }}
          >
            🎨
          </button>
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="flex h-4 w-4 shrink-0 items-center justify-center rounded-lg text-[11px] font-bold"
            style={{ background: skin.chip, border: `1px solid ${skin.accent}`, color: skin.accent }}
          >
            {collapsed ? "+" : "−"}
          </button>
        </div>
        <div
          className="mt-px h-0.5 rounded"
          style={{ background: `linear-gradient(90deg, transparent, ${skin.accent}, ${skin.accent2}, ${skin.accent}, transparent)` }}
        />

        {!collapsed &&
          (!state.running ? (
            <button
              type="button"
              onClick={state.start}
              disabled={state.starting}
              className="my-1.5 w-full rounded-xl py-2.5 text-sm font-black disabled:opacity-50"
              style={{ background: `linear-gradient(${skin.accent2}, ${skin.accent})`, color: "#1A1200" }}
            >
              {state.starting ? "Starting…" : "▶\uFE0E Start Luxury Bot"}
            </button>
          ) : (
            <>
              <div className="mt-1 grid grid-cols-6 gap-1.5">
                {LUXURY_CHARACTERS.map((c) => {
                  const total = shownTotal(c);
                  const mine = total > 0;
                  const sp = c.indexOf(" ");
                  const emoji = c.slice(0, sp);
                  const name = c.slice(sp + 1);
                  const face = !canBet
                    ? ["#2E2A3C", "#24212F", "#15131C", "#3A3648"]
                    : mine
                      ? ["#FFF8DC", "#FCD97A", "#C8901A", "#D4AF37"]
                      : [skin.tileTop, skin.tileBottom, skin.tileBase, skin.tileBorder];
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => tap(c)}
                      disabled={!canBet}
                      className={`lb-press select-none touch-manipulation rounded-xl pb-[3px] ${armed === c ? "lb-armed" : ""}`}
                      style={{ background: face[2] }}
                    >
                      <span
                        key={popped.c === c ? popped.n : 0}
                        className={`flex h-[64px] flex-col items-center justify-center rounded-xl ${popped.c === c && popped.n ? "lb-pop" : ""}${canBet && !mine && lbHasShine(skin) ? " lb-shine" : ""}`}
                        style={
                          canBet && !mine
                            ? lbTileFace(skin, LUXURY_CHARACTERS.indexOf(c))
                            : { background: `linear-gradient(${face[0]}, ${face[1]})`, border: `${mine ? 2 : 1}px solid ${face[3]}` }
                        }
                      >
                        <span className="text-lg leading-5" style={canBet ? undefined : { filter: "grayscale(1)", opacity: 0.6 }}>
                          {emoji}
                        </span>
                        <span
                          className="max-w-full truncate px-0.5 text-[8px] font-bold leading-[9px]"
                          style={{ color: !canBet ? "#6E6880" : mine ? "#7A4E00" : skin.cream }}
                        >
                          {name}
                        </span>
                        {/* My total, the app's label: 500 → "500", 2000 → "2k", 2500 → "2.5k" */}
                        <span
                          className="text-[11px] font-extrabold leading-3"
                          style={{ color: !canBet ? "#6E6880" : mine ? "#B8790A" : lbValueColor(skin), opacity: !canBet || mine || lbValueColor(skin) !== skin.cream ? 1 : 0.7 }}
                        >
                          {betTotalLabel(total)}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="py-px text-center text-[8px]" style={{ color: skin.accentText, opacity: 0.75 }}>
                👆 Tap twice on a character to bid instantly{myTotal > 0 ? ` · Your bets: 🪙 ${myTotal.toLocaleString()}` : ""}
              </p>
              <div className="flex gap-1.5 pb-1">
                {CHIPS.map((c) => {
                  const sel = amount === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAmount(c)}
                      disabled={!canBet}
                      className={`lb-press lb-chip h-[34px] flex-1 rounded-xl text-[13px] font-bold shadow-sm${canBet && !sel && lbHasShine(skin) ? " lb-shine" : ""}`}
                      style={
                        !canBet
                          ? { background: "linear-gradient(#2E2A3C, #24212F)", border: "1px solid #3A3648", color: "#6E6880" }
                          : lbChipFace(skin, sel)
                      }
                    >
                      {c >= 1000 ? `${c / 1000}k` : c}
                    </button>
                  );
                })}
              </div>
            </>
          ))}
      </div>
      {showStyles && <LbStyleDialog inv={inv} onClose={() => setShowStyles(false)} />}
    </div>
  );
}
