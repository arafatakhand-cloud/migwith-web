"use client";

import { useAppDownload } from "../../lib/appDownload";

// ▶ Google Play's own triangle (the 4 colours)
function PlayIcon({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
      <path d="M3.6 2.2 13.4 12l-9.8 9.8c-.4-.2-.6-.6-.6-1.1V3.3c0-.5.2-.9.6-1.1z" fill="#00D7FE" />
      <path d="m16.7 8.7-3.3 3.3-9.8-9.8c.2-.1.5-.2.8-.1.2 0 .4.1.6.2l11.7 6.4z" fill="#00F076" />
      <path d="m16.7 15.3-11.7 6.4c-.2.1-.4.2-.6.2-.3 0-.6 0-.8-.1l9.8-9.8 3.3 3.3z" fill="#FF3A44" />
      <path d="m20.4 12-3.7 3.3-3.3-3.3 3.3-3.3L20.4 12c0 .1 0 .1 0 0z" fill="#FFD400" />
    </svg>
  );
}
const isPlayLink = (u: string) => /^https:\/\/play\.google\.com\//.test(u);

// "Download for Android" button. Hidden until miglife has set a link.
// A Google Play link (Secret → App Download Link) shows "GET IT ON Google Play".
export function AndroidDownload({ light = false }: { light?: boolean }) {
  const { url, version } = useAppDownload();
  if (!url) return null;
  if (isPlayLink(url))
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group mt-4 flex w-full max-w-xs items-center gap-3 rounded-2xl border border-white/10 bg-gradient-to-r from-[#111827] to-[#1F2937] px-4 py-3 text-left text-white shadow-lg shadow-black/25 transition hover:-translate-y-0.5"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10">
          <PlayIcon size={26} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/75">Get it on</span>
          <span className="block text-lg font-black leading-tight">Google Play</span>
        </span>
        <span className="text-xl transition-transform group-hover:translate-x-0.5">›</span>
      </a>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`group mt-4 flex w-full max-w-xs items-center gap-3 rounded-2xl px-4 py-3 text-left shadow-lg transition hover:-translate-y-0.5 ${
        light
          ? "border border-[#BFE3C8] bg-gradient-to-r from-[#34A853] to-[#1E8E3E] text-white shadow-[#34A853]/30"
          : "border border-emerald-300/30 bg-gradient-to-r from-[#34A853] to-[#1E8E3E] text-white shadow-emerald-500/20"
      }`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20">
        {/* Android robot */}
        <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden>
          <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.87 3.23A11.4 11.4 0 0 0 12 8.2c-1.77 0-3.43.37-4.9.95L5.23 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/80">Download for</span>
        <span className="block text-lg font-black leading-tight">
          Android App{version && <span className="ml-1.5 align-middle text-xs font-bold text-white/80">v{version}</span>}
        </span>
      </span>
      <span className="text-xl transition-transform group-hover:translate-y-0.5">⬇️</span>
    </a>
  );
}

/** A row for the Home page list (signed in): "Download Android App". */
export function AndroidDownloadRow() {
  const { url, version } = useAppDownload();
  if (!url) return null;
  if (isPlayLink(url))
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 border-t border-[#E3ECF7] bg-white px-4 py-3 text-[#0B2A5B] hover:bg-[#F4F9FF]">
        <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#111827]">
          <PlayIcon size={17} />
        </span>
        <span className="flex-1 text-[16px] font-semibold">Get miGlife on Google Play</span>
        <span className="text-[#64748b]">›</span>
      </a>
    );
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-3 border-t border-[#E3ECF7] bg-white px-4 py-3 text-[#0B2A5B] hover:bg-[#F4F9FF]"
    >
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[#34A853] text-white">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
          <path d="M17.6 9.48l1.84-3.18a.38.38 0 0 0-.66-.38l-1.87 3.23A11.4 11.4 0 0 0 12 8.2c-1.77 0-3.43.37-4.9.95L5.23 5.92a.38.38 0 1 0-.66.38L6.4 9.48A10.8 10.8 0 0 0 1 18h22a10.8 10.8 0 0 0-5.4-8.52zM7 15.25a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5zm10 0a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5z" />
        </svg>
      </span>
      <span className="flex-1 text-[16px] font-semibold">
        Download Android App{version && <span className="ml-1.5 text-xs font-bold text-[#34A853]">v{version}</span>}
      </span>
      <span className="text-[#34A853]">⬇️</span>
    </a>
  );
}
