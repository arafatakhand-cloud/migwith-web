"use client";

import type { ReactNode } from "react";

// 🏠 The room's top card (design C): ONE soft blue glass card with three parts
// divided by thin white lines — "managed by", the welcome and who is here —
// each with its icon in a round white glass bubble. Classic keeps its old boxes.

/** "🏷️ Welcome to …! 🎉\n\nbody" → icon, heading, body. */
function splitWelcome(text: string) {
  const lines = text.trim().split("\n");
  const first = lines.length > 1 ? lines[0].trim() : "";
  const body = (lines.length > 1 ? lines.slice(1).join("\n") : text).trim();
  const m = first.match(/^([^\p{L}\p{N}]*)(.*)$/u);
  const icon = (m?.[1] || "").trim() || "🏷️";
  const heading = (m?.[2] || "").replace(/[🎉✨]/gu, "").trim() || "Welcome";
  return { icon, heading, body };
}

function Bubble({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-white bg-gradient-to-b from-white/95 to-[#E8F3FF]/80 text-[15px] shadow-[0_3px_8px_rgba(40,90,170,.18)]">
      {children}
    </span>
  );
}

const Divider = () => <div className="mx-3 h-px bg-white/85" />;

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
      <div
        className="relative overflow-hidden rounded-[22px] border-[1.5px] border-white/95 shadow-[inset_0_1.5px_1px_#fff,0_10px_24px_rgba(40,90,170,.2)]"
        style={{
          background: "linear-gradient(160deg, rgba(204,228,255,.72), rgba(232,243,255,.5) 55%, rgba(255,255,255,.42))",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
        }}
      >
        {/* soft shine on the top */}
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[44%] bg-gradient-to-b from-white/40 to-transparent" />
        <div className="relative flex gap-2.5 px-3.5 py-2.5">
          <Bubble>🛡️</Bubble>
          <p className="pt-1 text-[14.5px] font-extrabold leading-[20px] text-[#1565D8]">
            This room is managed by: <span data-notranslate className="text-[#0B2A5B]">{manager}</span>
          </p>
        </div>
        <Divider />
        <div className="relative flex gap-2.5 px-3.5 py-2.5">
          <Bubble>{w.icon}</Bubble>
          <div className="min-w-0 flex-1">
            <p className="pt-1.5 text-[12px] font-black tracking-[1px] text-[#0E9F8E]">{w.heading.toUpperCase()}</p>
            {w.body && <p className="mt-1 whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E293B] [overflow-wrap:anywhere]">{w.body}</p>}
          </div>
        </div>
        <Divider />
        <div className="relative flex gap-2.5 px-3.5 py-2.5">
          <Bubble>👫</Bubble>
          <div className="min-w-0 flex-1">
            <p className="pt-1 text-[14.5px] font-extrabold leading-[20px] text-[#6D28D9]">Currently in this room</p>
            {people.length > 0 && (
              <p data-notranslate className="mt-1 text-[14px] font-semibold leading-[20px] text-[#1E293B]">
                {people.join(", ")}
              </p>
            )}
          </div>
        </div>
      </div>
      {locked}
    </>
  );
}
