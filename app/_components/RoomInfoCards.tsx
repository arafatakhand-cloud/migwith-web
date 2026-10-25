"use client";

import type { ReactNode } from "react";

// 🏠 The room's top cards: three separate solid cards — "managed by" (blue),
// the welcome (white, icon box, heading in capitals) and who is here (lilac),
// each with a lip in its colour. Classic keeps its old boxes.

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
  // "2 · three separate cards": solid white cards (no glass), each with a lip in
  // its own colour — blue (managed by), green (welcome), lilac (who is here).
  const card = "rounded-[18px] border-2 border-white px-3.5 py-2.5";
  return (
    <>
      <div className="flex flex-col gap-2.5 pb-1">
        {/* managed by */}
        <div className={card} style={{ background: "linear-gradient(135deg, #E3F0FD, #FFFFFF)", boxShadow: "0 3px 0 #8DB8EE, 0 6px 12px rgba(40,80,160,.14)" }}>
          <p className="text-[14.5px] font-extrabold leading-[20px] text-[#1565D8]">
            🛡️ This room is managed by: <span data-notranslate className="text-[#0B2A5B]">{manager}</span>
          </p>
        </div>
        {/* welcome */}
        <div className={card} style={{ background: "#FFFFFF", boxShadow: "0 3px 0 #7CC9BE, 0 6px 12px rgba(40,80,160,.14)" }}>
          <div className="flex items-center gap-2 text-[12px] font-black tracking-[1px] text-[#0E9F8E]">
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] bg-[#E0F6F2] text-[14px] tracking-normal">{w.icon}</span>
            <span className="min-w-0 flex-1">{w.heading.toUpperCase()}</span>
          </div>
          {w.body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E293B] [overflow-wrap:anywhere]">{w.body}</p>}
        </div>
        {/* who is here */}
        <div className={card} style={{ background: "linear-gradient(135deg, #F1E8FB, #FFFFFF)", boxShadow: "0 3px 0 #C9B2F2, 0 6px 12px rgba(40,80,160,.14)" }}>
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
