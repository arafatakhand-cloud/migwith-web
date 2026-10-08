// Builds app/themes.css: the app's colour themes for the website.
//
// Same rule as the app (MainActivity.kt remapColor): only BLUE-family colours
// (hue 180-260°, clearly coloured) are turned to the theme's hue; greys,
// whites, golds, reds, greens, photos and emoji keep their own colours. Every
// hex colour used in a Tailwind class (bg-[#…], text-[#…], from-[#…] …) gets
// a themed copy under html[data-theme="…"]. "Dark Night" instead turns pale
// surfaces dark and dark text light, like the app's dark palette.
//
// Runs before every build (npm "prebuild"), so new colours are picked up.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const THEMES = {
  mint: [160 - 217, 1],
  lavender: [262 - 217, 1],
  rose_pink: [330 - 217, 1],
  sunset: [24 - 217, 1],
  sunshine: [46 - 217, 1],
  aqua: [186 - 217, 1],
  cherry: [355 - 217, 1],
  teal: [-45, 1],
  emerald: [-72, 1],
  ruby: [128, 1],
  purple: [48, 1],
  black_gold: [-172, 0.2],
  dark_luxury: [0, 0.15],
  light_clean: [0, 0.85],
  rose_gold: [138, 0.55],
};

function files(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (n === "node_modules" || n.startsWith(".")) return [];
    return statSync(p).isDirectory() ? files(p) : /\.(tsx|ts)$/.test(n) ? [p] : [];
  });
}

const hexToRgb = (h) => {
  const v = h.length === 4 ? h.slice(1).split("").map((c) => c + c).join("") : h.slice(1);
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255);
};
const toHex = (rgb) => "#" + rgb.map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0")).join("");
function rgbToHsl([r, g, b]) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn, l = (mx + mn) / 2;
  if (d < 1e-4) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = (mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
  return [h, s, l];
}
function hslToRgb(h, s, l) {
  const hn = (((h % 360) + 360) % 360) / 360;
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const ch = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
  };
  return [ch(hn + 1 / 3), ch(hn), ch(hn - 1 / 3)];
}
const lum = (rgb) => {
  const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
};

// The app's remapColor.
function remap(hex, shift, satScale) {
  const rgb = hexToRgb(hex);
  const mx = Math.max(...rgb), mn = Math.min(...rgb);
  if (mx - mn < 0.02) return null;
  const [h, s, l] = rgbToHsl(rgb);
  if (h < 180 || h > 260 || s < 0.2) return null;
  const nh = 217 + shift + (h - 217) * 0.45;
  const ns = Math.min(1, Math.max(0, s * satScale));
  if (l >= 0.6) return toHex(hslToRgb(nh, ns, l));
  const target = lum(rgb);
  let lo = 0, hi = 1, best = hslToRgb(nh, ns, l);
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    best = hslToRgb(nh, ns, mid);
    if (lum(best) < target) lo = mid;
    else hi = mid;
  }
  return toHex(best);
}

// Dark Night: pale backgrounds become deep navy, dark text becomes light.
function darkSurface(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l < 0.72) return null;
  return toHex(hslToRgb(s < 0.05 ? 222 : h, Math.min(s < 0.05 ? 0.35 : s, 0.35), 0.09 + (1 - l) * 0.55));
}
// Same as the app's darkModeInk: text too dark to read on the dark pages is
// made light. A coloured one keeps its colour (dark blue → light blue, dark
// red → soft red); a grey / navy one becomes an off-white.
function darkInk(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l >= 0.52) return null;
  if (s > 0.4) return toHex(hslToRgb(h, Math.min(s, 0.9), 0.7));
  return toHex(hslToRgb(h, Math.min(s, 0.35), 0.88 - l * 0.3));
}

const PROPS = {
  bg: "background-color",
  text: "color",
  border: "border-color",
  ring: "--tw-ring-color",
  from: "--tw-gradient-from",
  via: "--tw-gradient-via",
  to: "--tw-gradient-to",
  fill: "fill",
  stroke: "stroke",
  accent: "accent-color",
  decoration: "text-decoration-color",
  outline: "outline-color",
};
const SURFACE = new Set(["bg", "from", "via", "to", "border", "ring", "fill"]);

const re = /(?:^|[\s"'`{(])((?:[a-z-]+:)*)(bg|text|border|ring|from|via|to|fill|stroke|accent|decoration|outline)-\[(#[0-9a-fA-F]{3,6})\](?:\/(\d{1,3}|\[[\d.]+\]))?/g;
const found = new Map();
for (const f of [...files(join(ROOT, "app")), ...files(join(ROOT, "lib"))]) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(re)) {
    const [, variants, kind, hex, alpha] = m;
    const cls = `${variants}${kind}-[${hex}]${alpha ? "/" + alpha : ""}`;
    found.set(cls, { variants, kind, hex: hex.toUpperCase(), alpha });
  }
}

const esc = (s) => s.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
const withAlpha = (hex, alpha) => {
  if (!alpha) return hex;
  const a = alpha.startsWith("[") ? parseFloat(alpha.slice(1, -1)) : Number(alpha) / 100;
  const [r, g, b] = hexToRgb(hex).map((c) => Math.round(c * 255));
  return `rgb(${r} ${g} ${b} / ${a})`;
};
const pseudo = (variants) => {
  const v = variants.split(":").filter(Boolean);
  const states = { hover: ":hover", focus: ":focus", active: ":active", disabled: ":disabled", "focus-within": ":focus-within", placeholder: "::placeholder", before: "::before", after: "::after" };
  // Pseudo-elements (::before / ::after / ::placeholder) must come last.
  const parts = v.map((x) => states[x] || "");
  return [...parts.filter((x) => !x.startsWith("::")), ...parts.filter((x) => x.startsWith("::"))].join("");
};
// sm: / md: / lg: / xl: colours only apply from that width up, like Tailwind.
const BREAKPOINTS = { sm: "40rem", md: "48rem", lg: "64rem", xl: "80rem" };
const media = (variants, body) => {
  const bp = variants.split(":").find((x) => BREAKPOINTS[x]);
  return bp ? `@media (width >= ${BREAKPOINTS[bp]}){${body}}\n` : body + "\n";
};

let css = "/* Generated by scripts/gen-themes.mjs — do not edit by hand. */\n";

const entries = [...found.entries()];
for (const [theme, [shift, sat]] of Object.entries(THEMES)) {
  for (const [cls, info] of entries) {
    const out = remap(info.hex, shift, sat);
    if (!out) continue;
    css += media(info.variants, `html[data-theme="${theme}"] .${esc(cls)}${pseudo(info.variants)}{${PROPS[info.kind]}:${withAlpha(out, info.alpha)}}`);
  }
  // The sky page background (globals.css) and the light page gradient.
  const sky = ["#4FB6EA", "#2E93D3", "#1E73BC"].map((h) => remap(h, shift, sat) || h);
  css += `html[data-theme="${theme}"] .bg-sky-app{background:linear-gradient(180deg,${sky[0]} 0%,${sky[1]} 45%,${sky[2]} 100%);background-attachment:fixed}\n`;
}

// Dark Night
for (const [cls, info] of entries) {
  const out = SURFACE.has(info.kind) ? darkSurface(info.hex) : darkInk(info.hex);
  if (!out) continue;
  css += media(info.variants, `html[data-theme="dark_night"] .${esc(cls)}${pseudo(info.variants)}{${PROPS[info.kind]}:${withAlpha(out, info.alpha)}}`);
}
css += `html[data-theme="dark_night"]{--card-surface:#16213D}
html[data-theme="dark_night"] body{background:#0B1222;color:#E8EEF9}
html[data-theme="dark_night"] .bg-white{background-color:#16213D}
html[data-theme="dark_night"] .bg-white\\/70,html[data-theme="dark_night"] .bg-white\\/85,html[data-theme="dark_night"] .bg-white\\/90{background-color:rgb(22 33 61 / .85)}
html[data-theme="dark_night"] .text-black,html[data-theme="dark_night"] .text-gray-500,html[data-theme="dark_night"] .text-gray-400{color:#AEBBD6}
html[data-theme="dark_night"] input,html[data-theme="dark_night"] textarea,html[data-theme="dark_night"] select{color:#E8EEF9}
html[data-theme="dark_night"] .bg-sky-app{background:linear-gradient(180deg,#131E38 0%,#0F1A31 45%,#0B1424 100%);background-attachment:fixed}
`;

// 📟 Classic app style (html[data-ui="classic"], Settings › Appearance › App
// style): like the app's classicNeutralSurface, pale blue / purple page and
// card tints become plain white / light grey. Strong colours (buttons, bars,
// icons) and the Dark Night theme are left as they are.
function classicSurface(hex) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  if (l < 0.8 || s < 0.08 || h < 170 || h > 290) return null;
  return toHex(hslToRgb(215, s * 0.18, l));
}
for (const [cls, info] of entries) {
  if (!SURFACE.has(info.kind)) continue;
  const out = classicSurface(info.hex);
  if (!out) continue;
  css += media(info.variants, `html[data-ui="classic"]:not([data-theme="dark_night"]) .${esc(cls)}${pseudo(info.variants)}{${PROPS[info.kind]}:${withAlpha(out, info.alpha)}}`);
}

// 📟 Classic: the app's dark windows (Badges, Entry Effects, VIP, Create ID)
// get a light look — white page, navy text, orange + blue instead of pink +
// violet + gold. Only inside an element marked .classic-light.
function classicLight(hex, kind) {
  const [h, s, l] = rgbToHsl(hexToRgb(hex));
  const strong = s > 0.45 && l > 0.35 && l < 0.85;
  if (strong && h >= 245 && h < 295) return "#2F6ABD"; // violet → blue
  if (strong && (h >= 295 || h < 10)) return "#F07A00"; // pink → orange
  if (s > 0.6 && h >= 35 && h < 55 && l > 0.5) return "#F07A00"; // gold → orange
  if (SURFACE.has(kind)) {
    if (l < 0.35) return toHex(hslToRgb(215, 0.18, 0.985 - l * 0.25));
    return null;
  }
  if (l > 0.7 && s < 0.6) return "#16315F";
  if (l >= 0.5 && l <= 0.7 && s < 0.5) return "#6B7788";
  return null;
}
for (const [cls, info] of entries) {
  const out = classicLight(info.hex, info.kind);
  if (!out) continue;
  css += media(info.variants, `html[data-ui="classic"]:not([data-theme="dark_night"]) .classic-light .${esc(cls)}${pseudo(info.variants)},html[data-ui="classic"]:not([data-theme="dark_night"]) .${esc(cls)}.classic-light{${PROPS[info.kind]}:${withAlpha(out, info.alpha)}}`);
}
css += `html[data-ui="classic"]:not([data-theme="dark_night"]) .classic-light :is(.bg-white\\/5,.bg-white\\/10,.bg-white\\/\\[0\\.08\\],.bg-white\\/\\[0\\.06\\]){background-color:#F1F3F6}
html[data-ui="classic"]:not([data-theme="dark_night"]) .classic-light :is(.border-white\\/10,.border-white\\/15,.border-white\\/20){border-color:#C9D2DE}
html[data-ui="classic"]:not([data-theme="dark_night"]) .classic-light :is(.text-white\\/60,.text-white\\/70,.text-white\\/80){color:#6B7788}
`;

writeFileSync(join(ROOT, "app", "themes.css"), css);
console.log(`themes.css: ${found.size} colour classes, ${css.split("\n").length} rules`);
