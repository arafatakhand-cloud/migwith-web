"use client";

import type { ReactNode } from "react";

// 🏠 The room's top cards, the three the owner picked: "managed by" and "who is
// here" as soft pastel cards (design 3), the welcome as a white card with a
// coloured edge (design 1). Classic keeps its old boxes.

function Card({ ink, from, to, title, children }: { ink: string; from: string; to: string; title: ReactNode; children?: ReactNode }) {
  return (
    <div
      className="rounded-[18px] border-[1.5px] border-white px-3.5 py-2.5 shadow-[0_6px_14px_rgba(40,80,140,.1)]"
      style={{ background: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      <p className="text-[14.5px] font-extrabold leading-[20px]" style={{ color: ink }}>
        {title}
      </p>
      {children}
    </div>
  );
}

/** Design 1 for the welcome: a white card with a coloured left edge, a small
 * icon box and the heading in capitals. "🏷️ Welcome to …! 🎉" → icon + heading. */
function WelcomeCard({ text }: { text: string }) {
  const lines = text.trim().split("\n");
  const first = lines.length > 1 ? lines[0].trim() : "";
  const body = (lines.length > 1 ? lines.slice(1).join("\n") : text).trim();
  const m = first.match(/^([^\p{L}\p{N}]*)(.*)$/u);
  const icon = (m?.[1] || "").trim() || "🏷️";
  const heading = (m?.[2] || "").replace(/[🎉✨]/gu, "").trim() || "Welcome";
  return (
    <div className="relative overflow-hidden rounded-[18px] border-[1.5px] border-white bg-gradient-to-b from-white to-[#F6F9FF] py-2.5 pl-4 pr-3 shadow-[0_6px_16px_rgba(40,80,140,.12)]">
      <span className="absolute inset-y-0 left-0 w-[5px] bg-[#0E9F8E]" />
      <div className="flex items-center gap-2 text-[12px] font-black tracking-[1px] text-[#0E9F8E]">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[9px] bg-[#E0F6F2] text-[14px] tracking-normal">{icon}</span>
        <span className="min-w-0 flex-1">{heading.toUpperCase()}</span>
      </div>
      {body && <p className="mt-1.5 whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E293B] [overflow-wrap:anywhere]">{body}</p>}
    </div>
  );
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
  return (
    <>
      <Card ink="#1565D8" from="#E3F0FD" to="#F1F7FF" title={<>🛡️ This room is managed by: <span data-notranslate className="text-[#0B2A5B]">{manager}</span></>} />
      <WelcomeCard text={description} />
      {locked}
      <Card ink="#6D28D9" from="#F1E8FB" to="#FBF6FF" title="👫 Currently in this room">
        {people.length > 0 && (
          <p data-notranslate className="mt-1 text-[14px] font-semibold leading-[20px] text-[#1E293B]">
            {people.join(", ")}
          </p>
        )}
      </Card>
    </>
  );
}
