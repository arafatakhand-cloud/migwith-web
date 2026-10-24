"use client";

import type { ReactNode } from "react";

// 🏠 The room's top card: ONE card with three parts, divided by thin white
// lines — "managed by" (blue tint), the welcome (white, green edge, icon box,
// heading in capitals) and who is here (lilac tint). Clear glass in the Glass
// theme (globals.css .rc-*). Classic keeps its old boxes.

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
      <div className="rc-card overflow-hidden rounded-[22px] border-[1.5px] border-white bg-white shadow-[0_8px_20px_rgba(40,80,140,.14)]">
        {/* managed by */}
        <div className="rc-part rc-blue bg-gradient-to-br from-[#E3F0FD] to-[#F1F7FF] px-3.5 py-2.5">
          <p className="text-[14.5px] font-extrabold leading-[20px] text-[#1565D8]">
            🛡️ This room is managed by: <span data-notranslate className="text-[#0B2A5B]">{manager}</span>
          </p>
        </div>
        {/* welcome */}
        <div className="rc-part rc-white relative border-y border-white bg-gradient-to-b from-white to-[#F6F9FF] py-2.5 pl-4 pr-3">
          <span className="absolute inset-y-0 left-0 w-[5px] bg-[#0E9F8E]" />
          <div className="flex items-center gap-2 text-[12px] font-black tracking-[1px] text-[#0E9F8E]">
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] bg-[#E0F6F2] text-[14px] tracking-normal">{w.icon}</span>
            <span className="min-w-0 flex-1">{w.heading.toUpperCase()}</span>
          </div>
          {w.body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E293B] [overflow-wrap:anywhere]">{w.body}</p>}
        </div>
        {/* who is here */}
        <div className="rc-part rc-lilac bg-gradient-to-br from-[#F1E8FB] to-[#FBF6FF] px-3.5 py-2.5">
          <p className="text-[14.5px] font-extrabold leading-[20px] text-[#6D28D9]">👫 Currently in this room</p>
          {people.length > 0 && (
            <p data-notranslate className="mt-1 text-[14px] font-semibold leading-[20px] text-[#1E293B]">
              {people.join(", ")}
            </p>
          )}
        </div>
      </div>
      {locked}
    </>
  );
}
