"use client";

/** "● LIVE · Watch" on a folded game box while a game is running (tap = open it). */
export function LiveWatch({ onWatch }: { onWatch: () => void }) {
  return (
    <button
      type="button"
      onClick={onWatch}
      className="flex shrink-0 items-center gap-[5px] rounded-full border border-white/55 bg-[#E53935] px-2.5 py-[3px] text-[11px] font-bold text-white"
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
      LIVE · Watch
    </button>
  );
}
