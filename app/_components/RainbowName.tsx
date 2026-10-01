"use client";

import type { CSSProperties } from "react";

// 🌈 Rainbow names, like the app's appendMiglifeRainbow:
//   style 0 = miglife's original rainbow
//   1 Rainbow Wave — full rainbow racing the other way, faster
//   2 Neon Flash   — the whole name changes colour together and pulses
//   3 Candy Pastel — soft pastel rainbow drifting slowly
//   4 Fire & Ice   — warm reds/golds sweeping into cool cyans/blues
//   5 Gold Sparkle — rainbow letters with a white sparkle running across
// Every letter runs the same CSS cycle (globals.css .rb-*) from its own
// starting point, so the page needs no timers.

const frac = (x: number) => ((x % 1) + 1) % 1;

function letterStyle(style: number, i: number, n: number): [string, CSSProperties] {
  switch (style) {
    case 1: // hue i·40° + 720° per 2.4 s
      return ["rb-ch rb-up", { animationDuration: "1.2s", animationDelay: `${-frac((i * 40) / 360) * 1.2}s`, ["--rs" as string]: "100%" }];
    case 2: // one hue for the whole name, pulsing
      return ["rb-ch rb-neon", { ["--rs" as string]: "100%", ["--rl" as string]: "52%" }];
    case 3: // pastel, hue i·55° − 180° per 2.4 s
      return [
        "rb-ch rb-down",
        { animationDuration: "4.8s", animationDelay: `${-frac(1 - (i * 55) / 360) * 4.8}s`, ["--rs" as string]: "100%", ["--rl" as string]: "79%" },
      ];
    case 4: // warm ↔ cool wave along the name
      return ["rb-fire", { animationDelay: `${-((i / n) * 0.6) * 2.4}s` }];
    case 5: {
      // a sparkle runs across the name once per cycle
      const start = (i + 2) / (n + 4) - 0.055;
      return ["rb-spark", { animationDelay: `${-frac(1 - start) * 2.4}s`, ["--rc" as string]: `hsl(${(i * 50 + 40) % 360} 88% 57%)` }];
    }
    default: // miglife: hue i·48° − 360° per 2.4 s
      return ["rb-ch rb-down", { animationDuration: "2.4s", animationDelay: `${-frac(1 - (i * 48) / 360) * 2.4}s` }];
  }
}

export function RainbowName({ name, style = 0, className = "" }: { name: string; style?: number; className?: string }) {
  const chars = Array.from(name);
  return (
    <span className={`font-bold ${className}`} data-notranslate>
      {chars.map((ch, i) => {
        const [cls, css] = letterStyle(style, i, Math.max(1, chars.length));
        return (
          <span key={i} className={cls} style={css}>
            {ch}
          </span>
        );
      })}
    </span>
  );
}
