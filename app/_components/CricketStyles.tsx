"use client";

import type { CSSProperties } from "react";
import { StyleShopDialog, type Inventory, type ShopItem } from "./StyleShop";

// 🎨 Cricket box styles (the app's CkBoxSkins). Classic Green is free; the
// others are bought through buyLuxuryItem(kind = "cricket") and kept in
// lb_inventory/{uid} (ownedCricket[], cricket). The style is what YOU see.

export type CkSkin = ShopItem & {
  frame: string[];
  bg: string[];
  stripes?: boolean;
  horizontal?: boolean;
  floodlights?: boolean;
  pitchStrip?: boolean;
  stars?: boolean;
  band?: string[];
  logoBg: string[];
  logoInk: string;
  liveBg: string;
  liveInk: string;
  scoreBg: string;
  scoreBorder: string;
  accent: string;
  chipBg: string;
  chipBorder: string;
  waitEdge: string;
  avatar: string[];
  avatarInk: string;
  ringBg: string;
};

export const CK_SKINS: CkSkin[] = [
  {"id": "classic", "name": "Classic Green", "emoji": "🏏", "price": 0, "frame": ["#FFE082", "#2E7D32", "#00C853", "#FFE082"], "bg": ["#1E7B34", "#22883A"], "stripes": true, "logoBg": ["#FFE082", "#FFB300"], "logoInk": "#3E2723", "liveBg": "#D50000", "liveInk": "#FFFFFF", "scoreBg": "rgba(0,0,0,0.67)", "scoreBorder": "rgba(255,193,7,0.6)", "accent": "#FFC83D", "chipBg": "rgba(0,0,0,0.4)", "chipBorder": "rgba(255,255,255,0.2)", "waitEdge": "#FFD54F", "avatar": ["#FFFFFF", "#B9F6CA"], "avatarInk": "#0B2E13", "ringBg": "#08261C"},
  {"id": "pitch", "name": "Premium Pitch", "emoji": "🌿", "price": 50000, "frame": ["#FFF59D", "#2E7D32", "#00E676", "#FFF59D"], "bg": ["#1E7B34", "#22883A"], "stripes": true, "pitchStrip": true, "logoBg": ["#FFFFFF", "#E8F5E9"], "logoInk": "#1B5E20", "liveBg": "#FFFFFF", "liveInk": "#2E7D32", "scoreBg": "rgba(0,0,0,0.4)", "scoreBorder": "rgba(255,255,255,0.4)", "accent": "#FFF59D", "chipBg": "rgba(255,255,255,0.19)", "chipBorder": "rgba(255,255,255,0.31)", "waitEdge": "#FFFFFF", "avatar": ["#1B5E20", "#2E7D32"], "avatarInk": "#FFFFFF", "ringBg": "#0B3D1A"},
  {"id": "desert", "name": "Desert Cup", "emoji": "🏜️", "price": 70000, "frame": ["#FFE0B2", "#FF6D00", "#FFE0B2"], "bg": ["#8D4E1A", "#C17A2C", "#E0A458"], "pitchStrip": true, "logoBg": ["#FFF3E0", "#FFB74D"], "logoInk": "#4E2600", "liveBg": "#3E2723", "liveInk": "#FFD180", "scoreBg": "rgba(0,0,0,0.47)", "scoreBorder": "rgba(255,224,178,0.6)", "accent": "#FFE082", "chipBg": "rgba(62,39,35,0.33)", "chipBorder": "rgba(255,224,178,0.33)", "waitEdge": "#FFAB40", "avatar": ["#FFF3E0", "#FFCC80"], "avatarInk": "#4E2600", "ringBg": "#4E2600"},
  {"id": "ice", "name": "Frost Arena", "emoji": "❄️", "price": 90000, "frame": ["#FFFFFF", "#80D8FF", "#FFFFFF"], "bg": ["#0D47A1", "#1976D2", "#64B5F6"], "stars": true, "logoBg": ["#FFFFFF", "#E1F5FE"], "logoInk": "#0D47A1", "liveBg": "#00E5FF", "liveInk": "#002F6C", "scoreBg": "rgba(0,47,108,0.4)", "scoreBorder": "rgba(255,255,255,0.67)", "accent": "#B3E5FC", "chipBg": "rgba(0,47,108,0.27)", "chipBorder": "rgba(255,255,255,0.4)", "waitEdge": "#80D8FF", "avatar": ["#FFFFFF", "#B3E5FC"], "avatarInk": "#0D47A1", "ringBg": "#0A2A5C"},
  {"id": "night", "name": "Stadium Night", "emoji": "🌙", "price": 100000, "frame": ["#FFE082", "#FF8F00", "#FFE082", "#FFB300"], "bg": ["#0B1A3A", "#0D2A1F", "#14532D"], "floodlights": true, "pitchStrip": true, "logoBg": ["#FFF59D", "#FFB300"], "logoInk": "#3E2723", "liveBg": "#D50000", "liveInk": "#FFFFFF", "scoreBg": "rgba(0,0,0,0.67)", "scoreBorder": "rgba(255,193,7,0.6)", "accent": "#FFD54F", "chipBg": "rgba(0,0,0,0.53)", "chipBorder": "rgba(255,255,255,0.2)", "waitEdge": "#FFD54F", "avatar": ["#FFFFFF", "#B9F6CA"], "avatarInk": "#0B2E13", "ringBg": "#08261C"},
  {"id": "tv", "name": "TV Broadcast", "emoji": "📺", "price": 120000, "frame": ["#FF2D75", "#FF7A00", "#6A1B9A", "#FF2D75"], "bg": ["#1A0636", "#3B0A6B", "#6A1B9A"], "horizontal": true, "band": ["#FF2D75", "#FF7A00"], "logoBg": ["#FFFFFF", "#FFFFFF"], "logoInk": "#C2185B", "liveBg": "#FFFFFF", "liveInk": "#D50000", "scoreBg": "rgba(255,255,255,0.13)", "scoreBorder": "rgba(0,229,255,0.53)", "accent": "#00E5FF", "chipBg": "rgba(255,255,255,0.09)", "chipBorder": "rgba(255,255,255,0.19)", "waitEdge": "#00E5FF", "avatar": ["#FF2D75", "#FF7A00"], "avatarInk": "#FFFFFF", "ringBg": "#1A0636"},
  {"id": "royal", "name": "Royal Gold", "emoji": "👑", "price": 150000, "frame": ["#FFF8E1", "#D4AF37", "#8D6E00", "#FFF8E1"], "bg": ["#2A1F06", "#0D0A02", "#2A1F06"], "stars": true, "logoBg": ["#FFF59D", "#D4AF37"], "logoInk": "#2A1F00", "liveBg": "#D4AF37", "liveInk": "#1A1405", "scoreBg": "rgba(0,0,0,0.6)", "scoreBorder": "rgba(212,175,55,0.8)", "accent": "#FFD54F", "chipBg": "rgba(42,31,6,0.4)", "chipBorder": "rgba(212,175,55,0.47)", "waitEdge": "#FFE082", "avatar": ["#FFF8E1", "#D4AF37"], "avatarInk": "#2A1F00", "ringBg": "#1A1405"},
  {"id": "neon", "name": "Neon Cyber", "emoji": "⚡", "price": 175000, "frame": ["#00E5FF", "#FF00E5", "#00E5FF"], "bg": ["#05010F", "#0B0B2A", "#120424"], "pitchStrip": true, "logoBg": ["#00E5FF", "#00B8D4"], "logoInk": "#001018", "liveBg": "#FF00E5", "liveInk": "#FFFFFF", "scoreBg": "rgba(5,1,15,0.53)", "scoreBorder": "rgba(0,229,255,0.67)", "accent": "#00E5FF", "chipBg": "rgba(11,11,42,0.27)", "chipBorder": "rgba(255,0,229,0.47)", "waitEdge": "#FF00E5", "avatar": ["#FF00E5", "#7C4DFF"], "avatarInk": "#FFFFFF", "ringBg": "#05010F"},
  {"id": "galaxy", "name": "Galaxy Cup", "emoji": "🌌", "price": 200000, "frame": ["#B388FF", "#7DF9FF", "#B388FF"], "bg": ["#1A0E40", "#0B0524", "#3A1C71"], "stars": true, "logoBg": ["#D9C2FF", "#B388FF"], "logoInk": "#1A0E40", "liveBg": "#7DF9FF", "liveInk": "#1A0E40", "scoreBg": "rgba(11,5,36,0.4)", "scoreBorder": "rgba(125,249,255,0.6)", "accent": "#7DF9FF", "chipBg": "rgba(38,22,89,0.27)", "chipBorder": "rgba(122,85,230,0.4)", "waitEdge": "#7DF9FF", "avatar": ["#B388FF", "#7DF9FF"], "avatarInk": "#1A0E40", "ringBg": "#0B0524"},
];

export function ckSkin(id: string | undefined): CkSkin {
  return CK_SKINS.find((k) => k.id === id) || CK_SKINS[0];
}

export const ckGrad = (colors: string[], dir = "to bottom") => `linear-gradient(${dir}, ${colors.join(", ")})`;

// Same stars every time for a style (the app seeds them by the style id).
function starLayers(id: string): string[] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const rnd = () => {
    h = (h * 1103515245 + 12345) & 0x7fffffff;
    return h / 0x7fffffff;
  };
  return Array.from({ length: 26 }, () => {
    const a = (0.25 + rnd() * 0.5).toFixed(2);
    const r = (0.8 + rnd() * 1.6).toFixed(1);
    return `radial-gradient(circle at ${(rnd() * 100).toFixed(1)}% ${(rnd() * 100).toFixed(1)}%, rgba(255,255,255,${a}) ${r}px, transparent ${(+r + 0.6).toFixed(1)}px)`;
  });
}

/** The style's background: stripes / gradient + lights, pitch, stars. */
export function ckBackground(skin: CkSkin): CSSProperties {
  const layers: string[] = ["linear-gradient(to bottom, rgba(255,255,255,.13), rgba(255,255,255,0) 50%, rgba(0,0,0,.2))"];
  if (skin.floodlights) {
    layers.push("radial-gradient(circle at 12% 0%, rgba(255,255,255,.4), transparent 32%)");
    layers.push("radial-gradient(circle at 88% 0%, rgba(255,255,255,.4), transparent 32%)");
  }
  if (skin.stars) layers.push(...starLayers(skin.id));
  if (skin.pitchStrip) layers.push("linear-gradient(to right, transparent 42%, rgba(232,213,176,.15) 42% 58%, transparent 58%)");
  if (skin.stripes && skin.bg.length >= 2) layers.push(`repeating-linear-gradient(to right, ${skin.bg[0]} 0 22px, ${skin.bg[1]} 22px 44px)`);
  else layers.push(ckGrad(skin.bg, skin.horizontal ? "to right" : "to bottom"));
  return { background: layers.join(", ") };
}

function CkSkinPreview({ skin }: { skin: CkSkin }) {
  return (
    <div className="rounded-xl p-[1.5px]" style={{ background: ckGrad(skin.frame, "135deg") }}>
      <div className="rounded-[11px] p-[6px]" style={ckBackground(skin)}>
        <div className="flex items-center rounded-md" style={skin.band ? { background: ckGrad(skin.band, "to right"), padding: 2 } : undefined}>
          <span className="whitespace-nowrap rounded-full px-[5px] py-px text-[7px] font-black italic" style={{ background: ckGrad(skin.logoBg), color: skin.logoInk }}>
            🏏 CRICKET
          </span>
          <span className="ml-[3px] rounded-[3px] px-[3px] text-[6px] font-black" style={{ background: skin.liveBg, color: skin.liveInk }}>
            LIVE
          </span>
        </div>
        <div className="mt-1 flex items-center rounded-[5px] px-1 py-px" style={{ background: skin.scoreBg, border: `.8px solid ${skin.scoreBorder}` }}>
          <span className="text-[7px] font-bold text-white">R 1/6</span>
          <span className="flex-1" />
          <span className="text-[7px] font-black" style={{ color: skin.accent }}>
            🏆 600
          </span>
        </div>
        <div className="mt-1 flex gap-[3px]">
          {(
            [
              ["A", false],
              ["B", true],
            ] as const
          ).map(([n, wait]) => (
            <span
              key={n}
              className="flex flex-1 items-center rounded-full p-px"
              style={{ background: skin.chipBg, border: `.8px solid ${wait ? skin.waitEdge : skin.chipBorder}` }}
            >
              <span
                className="flex h-[9px] w-[9px] items-center justify-center rounded-full text-[5px] font-black"
                style={{ background: ckGrad(skin.avatar), color: skin.avatarInk }}
              >
                {n}
              </span>
              <span className="ml-0.5 text-[7px] font-black" style={{ color: skin.accent }}>
                {wait ? "6" : "4"}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CkStyleDialog({ inv, onClose }: { inv: Inventory; onClose: () => void }) {
  return (
    <StyleShopDialog
      title="🎨 Cricket Box Styles"
      subtitle="Classic is free · others from 50,000 coins · saved to your account"
      theme={{ bg: "#0E1A14", border: "#FFD54F", title: "#FFD54F", sub: "#B9D7C4", accent: "linear-gradient(90deg, #FFE082, #FFB300)", accentInk: "#3E2723" }}
      tabs={[{ label: "Box", kind: "cricket", items: CK_SKINS, noun: "Cricket box style", preview: (s: CkSkin) => <CkSkinPreview skin={s} /> }]}
      inv={inv}
      buyFn="buyLuxuryItem"
      setFn="setLuxuryStyle"
      opPrefix="ck"
      onClose={onClose}
    />
  );
}
