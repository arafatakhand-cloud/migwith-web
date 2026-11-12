"use client";

import type { CatalogFeel } from "../../lib/roomFeelings";

// 💭 /feel step 2: after the name (or "Just me"), every feeling in a list to
// scroll through; typing narrows it; tapping one fills in "/feel name sad ".

export function FeelPicker({ feels, onPick }: { feels: CatalogFeel[]; onPick: (f: CatalogFeel) => void }) {
  if (feels.length === 0) return null;
  return (
    <div
      className="absolute left-2 top-2 z-30 flex max-h-[calc(100%-16px)] w-[60%] min-w-[190px] max-w-[320px] flex-col overflow-hidden rounded-2xl border border-[#D9E4F2] bg-white shadow-[0_10px_30px_-8px_rgba(11,31,58,.35)]"
      data-notranslate
    >
      <div className="flex items-center justify-between border-b border-[#EEF2F7] bg-gradient-to-r from-[#EFF5FF] to-[#F5F0FF] px-2.5 py-2">
        <span className="min-w-0 truncate text-[12px] font-extrabold text-[#0B1F3A]">💭 Pick a feeling · 5 coins</span>
        <span className="ml-1.5 shrink-0 rounded-full bg-[#E8EEF8] px-1.5 py-0.5 text-[10px] font-bold text-[#4A5A78]">{feels.length}</span>
      </div>
      <div className="min-h-0 overflow-y-auto overscroll-contain py-1">
        {feels.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => onPick(f)}
            className="flex w-full items-center gap-2 px-2.5 py-[6px] text-left hover:bg-[#F3F7FC] active:bg-[#EAF1FB]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#EFF4FB] text-[18px]">
              {f.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.imageUrl} alt="" className="h-[26px] w-[26px] object-contain" />
              ) : (
                f.emoji
              )}
            </span>
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-[#0B1F3A]">{f.label}</span>
            <span className="shrink-0 text-[10.5px] text-[#8A97A8]">{f.category}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
