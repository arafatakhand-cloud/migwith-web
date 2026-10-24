"use client";

import type { ReactNode } from "react";

// 🏠 The room's top cards (design 3): soft pastel cards (blue / mint / lilac)
// with a coloured heading and dark text — manager, welcome text and who is
// here. Classic keeps its old boxes.

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
  const lines = description.trim().split("\n");
  const heading = lines.length > 1 ? lines[0].trim() : "";
  const body = (lines.length > 1 ? lines.slice(1).join("\n") : description).trim();
  return (
    <>
      <Card ink="#1565D8" from="#E3F0FD" to="#F1F7FF" title={<>🛡️ This room is managed by: <span data-notranslate className="text-[#0B2A5B]">{manager}</span></>} />
      <Card ink="#0F766E" from="#DFF7F1" to="#F2FBF8" title={heading || "🏷️ Welcome!"}>
        {body && <p className="mt-1 whitespace-pre-wrap text-[14px] leading-[20px] text-[#1E293B] [overflow-wrap:anywhere]">{body}</p>}
      </Card>
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
