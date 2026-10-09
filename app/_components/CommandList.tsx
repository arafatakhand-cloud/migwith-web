"use client";

import { useMemo, useState } from "react";
import { ALL_ROOM_COMMANDS } from "../../lib/socialExtra";
import { BackButton } from "./BackButton";
import { ClassicTitleBar, useIsClassic } from "./Classic";

// 📜 The room's "Command" page, like the app's RoomCommandListPage: every
// command in two columns, A → Z, with a search box on top. Tap one and it goes
// into the message box.
export function CommandListPage({ onPick, onBack }: { onPick: (cmd: string) => void; onBack: () => void }) {
  const classic = useIsClassic();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().replace(/^\//, "").toLowerCase();
    return q ? ALL_ROOM_COMMANDS.filter((c) => c.slice(1).includes(q)) : ALL_ROOM_COMMANDS;
  }, [query]);
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white pt-[env(safe-area-inset-top)]">
      {classic ? (
        <ClassicTitleBar title="Command" subtitle={`${ALL_ROOM_COMMANDS.length} commands • tap one`} onBack={onBack} />
      ) : (
        <div className="flex items-center gap-2 bg-[#0B2A5B] px-1.5 py-2 text-white">
          <BackButton variant="dark" onClick={onBack} />
          <span className="flex-1 text-lg font-bold">Command</span>
          <span className="pr-2.5 text-xs text-white/60">{ALL_ROOM_COMMANDS.length}</span>
        </div>
      )}
      <div className="mx-2.5 my-2 rounded-xl bg-[#F0F3F8] px-3 py-[9px]">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 Search command"
          className="w-full bg-transparent text-[13px] text-[#16264A] outline-none placeholder:text-[#8A97A8]"
        />
      </div>
      <div className="grid flex-1 grid-cols-2 content-start gap-x-2 overflow-y-auto px-2 pb-6">
        {shown.map((cmd) => (
          <button
            key={cmd}
            type="button"
            onClick={() => onPick(`${cmd} `)}
            className="flex items-center gap-2 rounded-lg px-1.5 py-[9px] text-left hover:bg-[#F4F7FB]"
          >
            <span className={`text-xs ${classic ? "text-[#2F6ABD]" : "text-[#3B7BF0]"}`}>↪</span>
            <span className="truncate text-sm text-[#2E3B4E]">{cmd}</span>
          </button>
        ))}
        {shown.length === 0 && <p className="col-span-2 py-8 text-center text-sm text-[#8A97A8]">No command found.</p>}
      </div>
    </div>
  );
}
