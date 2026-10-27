"use client";

import type { CSSProperties } from "react";
import { StyleShopDialog, type Inventory, type ShopItem } from "./StyleShop";

// 🎨 MIG Royale bet box colours. Classic (dark) is free; the light ones are
// bought through buyLuxuryItem(kind = "royale") and kept in lb_inventory/{uid}
// (ownedRoyale[], royale). The colour is what YOU see on your own screen.
// A light colour sets CSS variables on the box; globals.css (.rk-light) maps the
// box's dark-theme text/tint classes onto them.

export type RkSkin = ShopItem & {
  light: boolean;
  bg: string;
  frame: string;
  ink: string;
  sub: string;
  muted: string;
  odds: string;
  gold: string;
  tint: string;
  line: string;
  ring: string;
  track: string;
  swatch: string[];
  /** 🫧 see-through 3D glass: raised keys, glossy tiles, its own Bet colour */
  glass?: { key: string; keyBg: string; rim: string; redEdge: string; blueEdge: string; bet: string; betEdge: string; gloss: string; shadow: string };
};

const DARK_BG = "radial-gradient(130% 80% at 50% 0%, #26306A 0%, #141A3A 55%, #0D1128 100%)";

export const RK_SKINS: RkSkin[] = [
  { id: "classic", name: "Royal Night", emoji: "🌙", price: 0, light: false, bg: DARK_BG, frame: "transparent", ink: "#EAF0FF", sub: "#C9D2F2", muted: "#9BA6D6", odds: "#C4B5FD", gold: "#FCD34D", tint: "rgba(255,255,255,.07)", line: "rgba(255,255,255,.12)", ring: "#141A3A", track: "#2A3366", swatch: ["#26306A", "#0D1128", "#FCD34D"] },
  { id: "pearl", name: "Pearl White", emoji: "🤍", price: 50000, light: true, bg: "linear-gradient(180deg, #FFFFFF 0%, #F3F6FC 100%)", frame: "#E1E7F3", ink: "#1B2440", sub: "#3D4766", muted: "#6B7591", odds: "#7C6BD6", gold: "#B7791F", tint: "rgba(27,36,64,.06)", line: "rgba(27,36,64,.13)", ring: "#FFFFFF", track: "#E5E9F4", swatch: ["#FFFFFF", "#F3F6FC", "#7C3AED"] },
  { id: "mint", name: "Mint Sky", emoji: "🌿", price: 75000, light: true, bg: "linear-gradient(180deg, #F3FCF9 0%, #E4F3FF 100%)", frame: "#D3EAF0", ink: "#12324A", sub: "#2F5068", muted: "#5C7A8C", odds: "#0F8C8A", gold: "#B7791F", tint: "rgba(18,50,74,.06)", line: "rgba(18,50,74,.13)", ring: "#F6FCFD", track: "#D3EAF0", swatch: ["#F3FCF9", "#E4F3FF", "#14B8A6"] },
  { id: "blush", name: "Blush Rose", emoji: "🌸", price: 100000, light: true, bg: "linear-gradient(180deg, #FFF8F9 0%, #FDE9F0 100%)", frame: "#F6D6E1", ink: "#4A1F2E", sub: "#6B3446", muted: "#9A6B7B", odds: "#BE185D", gold: "#B7791F", tint: "rgba(131,24,67,.06)", line: "rgba(131,24,67,.13)", ring: "#FFF6F9", track: "#F6D6E1", swatch: ["#FFF8F9", "#FDE9F0", "#EC4899"] },
  { id: "lavender", name: "Lavender", emoji: "💜", price: 125000, light: true, bg: "linear-gradient(180deg, #FAF7FF 0%, #EEE6FF 100%)", frame: "#E0D5FA", ink: "#2A1F4F", sub: "#463A72", muted: "#7A6FA3", odds: "#8B5CF6", gold: "#B7791F", tint: "rgba(76,29,149,.07)", line: "rgba(76,29,149,.14)", ring: "#F8F4FF", track: "#E4D9FB", swatch: ["#FAF7FF", "#EEE6FF", "#8B5CF6"] },
  { id: "gold", name: "Champagne Gold", emoji: "👑", price: 150000, light: true, bg: "linear-gradient(180deg, #FFFCF3 0%, #FBF0D6 100%)", frame: "#EEDDB4", ink: "#3A2A10", sub: "#5C4520", muted: "#8A7350", odds: "#A07A3A", gold: "#A86A0C", tint: "rgba(120,82,20,.07)", line: "rgba(120,82,20,.16)", ring: "#FFF8E6", track: "#F0E0BC", swatch: ["#FFFCF3", "#FBF0D6", "#C8952A"] },
  // 🫧 see-through 3D glass (same looks as the demo page)
  { id: "glassclear", name: "Clear Glass", emoji: "🫧", price: 175000, light: true,
    bg: "linear-gradient(135deg, rgba(255,255,255,.75), rgba(255,255,255,0) 40%), linear-gradient(160deg, rgba(252,231,214,.85), rgba(251,224,234,.8) 45%, rgba(220,230,255,.85))",
    frame: "rgba(255,255,255,.85)", ink: "#1B2440", sub: "#3D4766", muted: "#5B6585", odds: "#7C6BD6", gold: "#B7791F", tint: "rgba(255,255,255,.45)", line: "rgba(255,255,255,.8)", ring: "#FFFFFF", track: "rgba(255,255,255,.6)",
    swatch: ["#FFFFFF", "#FBE0EA", "#8B5CF6"],
    glass: { key: "0 3px 0 rgba(120,130,170,.4), 0 6px 10px rgba(40,40,90,.08)", keyBg: "rgba(255,255,255,.5)", rim: "rgba(255,255,255,.85)", redEdge: "rgba(185,28,28,.55)", blueEdge: "rgba(29,78,216,.55)", bet: "linear-gradient(#A78BFA, #7C3AED)", betEdge: "#5B21B6", gloss: "rgba(255,255,255,.7)", shadow: "0 14px 34px rgba(40,40,90,.22), inset 0 1px 0 #fff" } },
  { id: "glassice", name: "Ice Glass", emoji: "🧊", price: 175000, light: true,
    bg: "linear-gradient(125deg, rgba(255,255,255,.65), rgba(255,255,255,0) 35%, rgba(255,255,255,0) 60%, rgba(255,255,255,.3) 61%, rgba(255,255,255,0) 66%), linear-gradient(180deg, rgba(224,242,254,.92), rgba(186,230,253,.85))",
    frame: "rgba(224,242,254,.95)", ink: "#0C2D4A", sub: "#1E4A6E", muted: "#4A7090", odds: "#0284C7", gold: "#B45309", tint: "rgba(240,249,255,.5)", line: "rgba(255,255,255,.85)", ring: "#F0F9FF", track: "rgba(255,255,255,.6)",
    swatch: ["#E0F2FE", "#BAE6FD", "#0EA5E9"],
    glass: { key: "0 3px 0 rgba(56,130,190,.4), 0 6px 10px rgba(14,90,160,.1)", keyBg: "rgba(240,249,255,.55)", rim: "rgba(255,255,255,.9)", redEdge: "rgba(185,28,28,.5)", blueEdge: "rgba(29,78,216,.5)", bet: "linear-gradient(#38BDF8, #0284C7)", betEdge: "#075985", gloss: "rgba(255,255,255,.75)", shadow: "0 14px 34px rgba(14,90,160,.22), inset 0 1px 0 #fff" } },
  { id: "glasssmoke", name: "Smoky Glass", emoji: "🌫️", price: 175000, light: false,
    bg: "linear-gradient(135deg, rgba(255,255,255,.16), rgba(255,255,255,0) 45%), linear-gradient(160deg, rgba(40,46,84,.92), rgba(16,20,44,.95))",
    frame: "rgba(255,255,255,.22)", ink: "#F1F4FF", sub: "#D3DAF5", muted: "#A9B3DA", odds: "#C4B5FD", gold: "#FCD34D", tint: "rgba(255,255,255,.09)", line: "rgba(255,255,255,.2)", ring: "#1E2448", track: "rgba(0,0,0,.35)",
    swatch: ["#283054", "#10142C", "#FBD24E"],
    glass: { key: "0 3px 0 rgba(0,0,0,.5), 0 6px 10px rgba(0,0,0,.2)", keyBg: "rgba(255,255,255,.1)", rim: "rgba(255,255,255,.22)", redEdge: "rgba(80,10,10,.75)", blueEdge: "rgba(10,30,90,.75)", bet: "linear-gradient(#FBD24E, #E0A82E)", betEdge: "#9A6B12", gloss: "rgba(255,255,255,.18)", shadow: "0 14px 34px rgba(10,12,30,.45), inset 0 1px 0 rgba(255,255,255,.25)" } },
  { id: "glassaurora", name: "Aurora Glass", emoji: "🌈", price: 200000, light: true,
    bg: "radial-gradient(120% 60% at 0% 0%, rgba(244,114,182,.3), transparent 60%), radial-gradient(120% 60% at 100% 100%, rgba(56,189,248,.3), transparent 60%), linear-gradient(160deg, rgba(224,247,241,.9), rgba(232,228,255,.88) 50%, rgba(255,228,241,.9))",
    frame: "rgba(255,255,255,.9)", ink: "#25184D", sub: "#463A72", muted: "#6A5F95", odds: "#DB2777", gold: "#A855F7", tint: "rgba(255,255,255,.5)", line: "rgba(255,255,255,.85)", ring: "#FFFFFF", track: "rgba(255,255,255,.6)",
    swatch: ["#F472B6", "#A855F7", "#38BDF8"],
    glass: { key: "0 3px 0 rgba(147,112,219,.45), 0 6px 10px rgba(90,60,160,.1)", keyBg: "rgba(255,255,255,.55)", rim: "rgba(255,255,255,.9)", redEdge: "rgba(190,24,93,.45)", blueEdge: "rgba(3,105,161,.45)", bet: "linear-gradient(90deg, #F472B6, #A855F7, #38BDF8)", betEdge: "#7E22CE", gloss: "rgba(255,255,255,.8)", shadow: "0 14px 34px rgba(90,60,160,.22), 0 0 0 2px rgba(168,85,247,.25), 0 0 22px rgba(56,189,248,.25)" } },
  { id: "glasscrystal", name: "Crystal 3D", emoji: "💎", price: 200000, light: true,
    bg: "linear-gradient(160deg, rgba(255,255,255,.75) 0%, rgba(255,255,255,0) 35%, rgba(255,255,255,0) 70%, rgba(255,255,255,.4) 100%), linear-gradient(180deg, rgba(248,250,255,.95), rgba(225,232,250,.92))",
    frame: "#FFFFFF", ink: "#1B2440", sub: "#3D4766", muted: "#5B6585", odds: "#6D28D9", gold: "#B45309", tint: "rgba(255,255,255,.6)", line: "rgba(255,255,255,.95)", ring: "#FFFFFF", track: "#D9DFF0",
    swatch: ["#FFFFFF", "#E1E8FA", "#10B981"],
    glass: { key: "0 4px 0 #B7C0DD, 0 8px 12px rgba(40,40,90,.12)", keyBg: "linear-gradient(#FFFFFF, #E6EBF8)", rim: "#FFFFFF", redEdge: "#C0392B", blueEdge: "#1E50B4", bet: "linear-gradient(#34D399, #059669)", betEdge: "#047857", gloss: "rgba(255,255,255,.9)", shadow: "0 6px 0 rgba(150,160,200,.5), 0 18px 34px rgba(40,40,90,.22)" } },
];

export function rkSkin(id: string | undefined): RkSkin {
  return RK_SKINS.find((k) => k.id === id) || RK_SKINS[0];
}

/** Style for the box root: background + the colour variables. */
export function rkBoxStyle(s: RkSkin): CSSProperties {
  return {
    background: s.bg,
    ...(s.light ? { border: `1px solid ${s.frame}` } : {}),
    ["--rk-ink" as string]: s.ink,
    ["--rk-sub" as string]: s.sub,
    ["--rk-muted" as string]: s.muted,
    ["--rk-odds" as string]: s.odds,
    ["--rk-gold" as string]: s.gold,
    ["--rk-tint" as string]: s.tint,
    ["--rk-line" as string]: s.line,
    ["--rk-ring" as string]: s.ring,
    ["--rk-track" as string]: s.track,
    ...(s.glass
      ? {
          border: `1px solid ${s.glass.rim}`,
          boxShadow: s.glass.shadow,
          ["--rk-key" as string]: s.glass.key,
          ["--rk-keybg" as string]: s.glass.keyBg,
          ["--rk-rim" as string]: s.glass.rim,
          ["--rk-redge" as string]: s.glass.redEdge,
          ["--rk-uedge" as string]: s.glass.blueEdge,
          ["--rk-bet" as string]: s.glass.bet,
          ["--rk-betedge" as string]: s.glass.betEdge,
          ["--rk-gloss" as string]: s.glass.gloss,
        }
      : {}),
  };
}

function RkPreview({ s }: { s: RkSkin }) {
  return (
    <div className="rounded-xl p-1.5" style={{ background: s.bg, border: `1px solid ${s.light ? s.frame : "rgba(255,255,255,.15)"}`, color: s.ink }}>
      <div className="flex items-center gap-1">
        <span className="grid h-3.5 w-3.5 place-items-center rounded-full border-2 text-[6px] font-black" style={{ borderColor: s.odds }}>32</span>
        <span className="text-[8px] font-black">MIG Royale</span>
        <span className="ml-auto text-[8px] font-black" style={{ color: s.gold }}>48k</span>
      </div>
      <div className="mt-1 grid grid-cols-2 gap-1">
        <span className="rounded-md border py-0.5 text-center text-[8px] font-black" style={{ background: "rgba(239,68,68,.16)", borderColor: "rgba(239,68,68,.4)", color: s.light ? "#DC2626" : "#FF8C8C" }}>Red</span>
        <span className="rounded-md border py-0.5 text-center text-[8px] font-black" style={{ background: "rgba(59,130,246,.16)", borderColor: "rgba(59,130,246,.4)", color: s.light ? "#2563EB" : "#8DBBFF" }}>Blue</span>
      </div>
      <div className="mt-1 grid grid-cols-5 gap-0.5">
        {["2.5x", "10x", "15x", "100x", "150x"].map((x) => (
          <span key={x} className="rounded-[4px] py-px text-center text-[6.5px] font-black" style={{ background: s.tint, color: s.gold }}>{x}</span>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5">
        {s.swatch.map((c) => (
          <i key={c} className="h-2 w-2 rounded-full" style={{ background: c, border: "1px solid rgba(0,0,0,.1)" }} />
        ))}
      </div>
    </div>
  );
}

export function RkStyleDialog({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  return (
    <StyleShopDialog
      title="🎨 MIG Royale Box Colours"
      subtitle="Royal Night is free · light colours from 50,000 · 🫧 glass from 175,000 coins · saved to your account"
      theme={{ bg: "#0D1128", border: "#FCD34D", title: "#FCD34D", sub: "#C9D2F2", accent: "linear-gradient(90deg, #FCD34D, #F59E0B)", accentInk: "#3A2500" }}
      tabs={[{ label: "Box", kind: "royale", items: RK_SKINS, perRow: 2, noun: "MIG Royale box colour", preview: (s: RkSkin) => <RkPreview s={s} /> }]}
      inv={inv}
      buyFn="buyLuxuryItem"
      setFn="setLuxuryStyle"
      opPrefix="rk"
      onClose={onClose}
    />
  );
}
