"use client";

import { countryFlag, countryInfoFor } from "../../lib/countries";

// ⚠️ "You are not in this room" (design 2+): the whole room is covered — only
// this card. A red "OUT OF THE ROOM" ribbon, a rainbow ring with 🔒 and the
// room's own icon, the room's name in a chip, Close / Rooms › and the reasons.

/** The room's icon (its leading emoji, a country flag, else 💬), its plain name and chip colours. */
function roomLook(room: string) {
  const m = room.trim().match(/^([^\p{L}\p{N}\s]+)\s*(.*)$/u);
  const lead = m ? m[1].trim() : "";
  const name = (m ? m[2] : room).trim() || room.trim();
  const info = countryInfoFor(name);
  if (lead) return { icon: lead, name, bg: "#FFF3E3", ink: "#B8580A", line: "#F2CFA0" };
  if (info) return { icon: countryFlag(info.iso), name, bg: "#E3F7EC", ink: "#0E7A4A", line: "#A8DFC2" };
  return { icon: "💬", name, bg: "#EEF4FF", ink: "#1565D8", line: "#B8D0F0" };
}

export function NotInRoomPage({
  room,
  onClose,
  onRooms,
  onRejoin,
}: {
  room: string;
  onClose: () => void;
  onRooms: () => void;
  /** only after an inactivity auto left: a Rejoin button puts me back in the room */
  onRejoin?: () => void;
}) {
  const look = roomLook(room);
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-gradient-to-b from-[#D6ECFB] via-[#BFE0F7] to-[#E8DEF3] p-6">
      <div
        className="relative w-full max-w-[360px] rounded-[30px] border-2 border-white bg-white px-5 pb-5 pt-9 text-center"
        style={{ boxShadow: "0 5px 0 #b9a8f5, 0 22px 44px rgba(40,80,160,.28)" }}
      >
        <span
          className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-[14px] px-3.5 py-1.5 text-[10.5px] font-black tracking-[1.6px] text-white"
          style={{ background: "linear-gradient(90deg,#ff6b6b,#ff8e53)", boxShadow: "0 3px 0 #c94a3a" }}
        >
          OUT OF THE ROOM
        </span>
        <div
          className="relative mx-auto mt-1 h-[118px] w-[118px] rounded-full p-1.5"
          style={{
            background: "conic-gradient(#5aa2ff,#8b5cf6,#ff6fa8,#ffb547,#5aa2ff)",
            boxShadow: "0 0 0 6px rgba(139,92,246,.10), 0 10px 24px rgba(139,92,246,.35)",
          }}
        >
          <span className="flex h-full w-full items-center justify-center rounded-full text-[52px]" style={{ background: "radial-gradient(circle at 35% 30%, #fff, #eef3ff)" }}>
            🔒
          </span>
          <span className="absolute -right-0.5 bottom-1 flex h-[38px] w-[38px] items-center justify-center rounded-full border-[3px] border-white bg-white text-xl shadow-[0_3px_8px_rgba(0,0,0,.18)]">
            {look.icon}
          </span>
        </div>
        <h2 className="mt-4 bg-gradient-to-r from-[#1565D8] to-[#8b5cf6] bg-clip-text text-[22px] font-black text-transparent">
          You are not in this room
        </h2>
        <span
          data-notranslate
          className="mt-2.5 inline-flex max-w-full items-center gap-[7px] rounded-2xl border-[1.5px] border-white py-1.5 pl-2 pr-3.5 text-sm font-extrabold"
          style={{ background: look.bg, color: look.ink, boxShadow: `0 2px 0 ${look.line}` }}
        >
          <i className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-sm not-italic">{look.icon}</i>
          <span className="truncate">{look.name}</span>
        </span>
        <p className="mt-2.5 text-[13.5px] leading-[19px] text-[#5B6B8C]">
          You can&apos;t see or join this room&apos;s chat now. Open it again from the room list to come back in.
        </p>
        <div className="mt-5 flex gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="h-12 flex-1 rounded-3xl border-[1.5px] border-[#E1E9F5] bg-gradient-to-b from-white to-[#f1f5fb] text-[15px] font-black text-[#5B6B8C] shadow-[0_3px_0_#D5E0EF] active:scale-[.97]"
          >
            Close
          </button>
          {onRejoin && (
            <button
              type="button"
              onClick={onRejoin}
              className="h-12 flex-1 rounded-3xl border-[1.5px] border-white/85 text-[15px] font-black text-white active:scale-[.97]"
              style={{
                background: "linear-gradient(180deg,rgba(255,255,255,.35),transparent 48%), linear-gradient(90deg,#FF5A3C,#E8343E)",
                boxShadow: "inset 0 -3px 5px rgba(0,0,0,.12), 0 4px 0 #a82030, 0 10px 18px rgba(232,52,62,.35)",
              }}
            >
              Rejoin
            </button>
          )}
          <button
            type="button"
            onClick={onRooms}
            className="h-12 flex-1 rounded-3xl border-[1.5px] border-white/85 text-[15px] font-black text-white active:scale-[.97]"
            style={{
              background: "linear-gradient(180deg,rgba(255,255,255,.35),transparent 48%), linear-gradient(90deg,#3b8cff,#7b5cff)",
              boxShadow: "inset 0 -3px 5px rgba(0,0,0,.12), 0 4px 0 #3f3fb5, 0 10px 18px rgba(91,92,240,.35)",
            }}
          >
            Rooms ›
          </button>
        </div>
        <div className="mt-3.5 flex justify-center gap-1.5 text-[11px] font-bold text-[#8A9BBC]">
          <span className="rounded-[10px] bg-[#F4F7FC] px-2 py-[3px]">⏰ away 2h</span>
          <span className="rounded-[10px] bg-[#F4F7FC] px-2 py-[3px]">👢 kicked</span>
          <span className="rounded-[10px] bg-[#F4F7FC] px-2 py-[3px]">🚫 banned</span>
        </div>
      </div>
    </div>
  );
}
