"use client";

import type { ReactNode } from "react";

// 🏠 The room's top cards (design 1+3): soft pastel cards with a coloured left
// edge, a small icon box and a coloured heading — manager, welcome text and
// who is here (names as coloured chips). Classic keeps its old boxes.

const CHIP_COLORS = ["#43B65A", "#3984D9", "#E9A625", "#7B1FB8", "#12AFC7", "#E12A2A", "#D4AF37", "#3F55C7"];
const chipColor = (name: string) => {
  let sum = 0;
  for (const ch of name.trim().toLowerCase()) sum += ch.codePointAt(0) || 0;
  return CHIP_COLORS[sum % CHIP_COLORS.length];
};

function Card({ edge, from, to, icon, title, children }: { edge: string; from: string; to: string; icon: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[18px] border-[1.5px] border-white py-2.5 pl-4 pr-3 shadow-[0_6px_16px_rgba(40,80,140,.12)]"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <span className="absolute inset-y-0 left-0 w-[5px]" style={{ background: edge }} />
      <div className="flex items-center gap-2 text-[12px] font-black tracking-[1px]" style={{ color: edge }}>
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] border border-white bg-white/85 text-[14px] tracking-normal">
          {icon}
        </span>
        <span className="min-w-0 flex-1">{title}</span>
      </div>
      {children}
    </div>
  );
}

/** "🏷️ Welcome to …! 🎉\n\nbody" → icon, heading, body. */
function splitWelcome(text: string): { icon: string; heading: string; body: string } {
  const lines = text.trim().split("\n");
  const first = lines.length > 1 ? lines[0].trim() : "";
  const body = (lines.length > 1 ? lines.slice(1).join("\n") : text).trim();
  const m = first.match(/^([^\p{L}\p{N}]+)\s*(.*)$/u);
  const icon = (m?.[1] || "").trim() || "🏷️";
  const heading = (m ? m[2] : first).replace(/\s*[🎉✨]+\s*$/u, "").trim() || "WELCOME";
  return { icon: Array.from(icon)[0] === "\u{1F3F7}" ? "🏷️" : icon.slice(0, 4), heading, body };
}

export function RoomInfoCards({
  manager,
  description,
  people,
  locked,
}: {
  manager: string;
  description: string;
  people: string[];
  locked: ReactNode;
}) {
  const w = splitWelcome(description);
  return (
    <>
      <Card edge="#1565D8" from="#E3F0FD" to="#F4F9FF" icon="🛡️" title={<>MANAGED BY <b data-notranslate className="text-[14px] tracking-normal text-[#0B2A5B]">{manager}</b></>} />
      <Card edge="#0F766E" from="#DFF7F1" to="#F3FCF9" icon={w.icon} title={w.heading.toUpperCase()}>
        {w.body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E293B] [overflow-wrap:anywhere]">{w.body}</p>}
      </Card>
      {locked}
      <Card edge="#6D28D9" from="#F1E8FB" to="#FBF7FF" icon="👥" title={`IN THIS ROOM · ${people.length}`}>
        {people.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-[5px]" data-notranslate>
            {people.map((n) => {
              const c = chipColor(n);
              return (
                <span key={n} className="rounded-full border bg-white/85 px-2.5 py-[3px] text-[12.5px] font-bold" style={{ color: c, borderColor: `${c}40` }}>
                  {n}
                </span>
              );
            })}
          </div>
        )}
      </Card>
    </>
  );
}
