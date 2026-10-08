"use client";

import type { ReactNode } from "react";
import { findRoomLinks, youTubeIdOf } from "../../lib/roomLinks";

// 🔗 Room chat links, like the app's RoomLinks.kt.

/** Plain text with every link blue, underlined and tappable; the rest goes through `inner`. */
export function withLinks(
  text: string,
  keyPrefix: string,
  onLink: (url: string) => void,
  inner: (s: string, key: string) => ReactNode
): ReactNode[] {
  const links = findRoomLinks(text);
  if (links.length === 0) return [inner(text, keyPrefix)];
  const out: ReactNode[] = [];
  let last = 0;
  links.forEach((l, i) => {
    if (l.start > last) out.push(inner(text.slice(last, l.start), `${keyPrefix}t${i}_`));
    out.push(
      <a
        key={`${keyPrefix}l${i}`}
        href={l.url}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onLink(l.url);
        }}
        className="break-all text-[#1E6FFF] underline"
      >
        {text.slice(l.start, l.end)}
      </a>
    );
    last = l.end;
  });
  if (last < text.length) out.push(inner(text.slice(last), `${keyPrefix}end_`));
  return out;
}

// YouTube thumbnail card under a message.
export function YouTubePreviewCard({ videoId, onPlay }: { videoId: string; onPlay: () => void }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="relative mt-1.5 block aspect-video w-full max-w-[260px] overflow-hidden rounded-xl bg-black"
      aria-label="Play YouTube video"
    >
      {videoId.startsWith("list:") ? (
        // a playlist has no single picture → a red YouTube card
        <span className="absolute inset-0 bg-gradient-to-br from-[#3A0000] to-[#B00000]">
          <span className="absolute right-2 top-2 text-xs font-bold text-white">☰ Playlist</span>
        </span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`} alt="YouTube video" loading="lazy" className="h-full w-full object-cover" />
      )}
      <span className="absolute inset-0 bg-gradient-to-b from-transparent to-black/60" />
      <span className="absolute left-1/2 top-1/2 flex h-10 w-[58px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-[#FF0000] text-xl text-white">
        {"▶\uFE0E"}
      </span>
      <span className="absolute bottom-2 left-2 text-[11px] font-bold text-white">YouTube</span>
    </button>
  );
}

const openOutside = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

/** The right popup for a tapped link (null = nothing open). */
export function RoomLinkDialog({ url, onClose }: { url: string | null; onClose: () => void }) {
  if (!url) return null;
  const yt = youTubeIdOf(url);
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-3" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={yt ? "w-full max-w-2xl" : "w-full max-w-sm"}>
        {yt ? <YouTubePlayer id={yt} url={url} onClose={onClose} /> : <LeaveMiglife url={url} onClose={onClose} />}
      </div>
    </div>
  );
}

function LeaveMiglife({ url, onClose }: { url: string; onClose: () => void }) {
  let host = "";
  try {
    host = new URL(url).host.replace(/^www\./, "");
  } catch {
    // shown as the full link
  }
  return (
    <div className="flex flex-col items-center rounded-[22px] border border-white/30 bg-[#141C33] p-5 text-center text-white">
      <span className="text-[34px]">🔗</span>
      <p className="mt-2 text-[17px] font-extrabold">You are leaving miGlife</p>
      <p className="mt-1.5 break-all text-[15px] font-bold text-[#FFD66B]">{host || url}</p>
      <p className="mt-1 line-clamp-2 break-all text-[11px] text-[#9EA9C0]">{url}</p>
      <p className="mt-2 text-xs text-[#B8C1D3]">Only open links from people you trust. Never type your password on another site.</p>
      <div className="mt-4 flex gap-2.5">
        <button type="button" onClick={onClose} className="rounded-[14px] bg-[#26314D] px-5 py-[11px] font-bold text-[#D6DCE8]">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            openOutside(url);
            onClose();
          }}
          className="rounded-[14px] bg-gradient-to-r from-[#FFD86B] to-[#F5B533] px-5 py-[11px] font-extrabold text-black"
        >
          Open link
        </button>
      </div>
    </div>
  );
}

function YouTubePlayer({ id, url, onClose }: { id: string; url: string; onClose: () => void }) {
  return (
    <div className="overflow-hidden rounded-[18px] bg-[#0B0F1C] text-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <span className="flex h-[18px] w-[26px] items-center justify-center rounded-[5px] bg-[#FF0000] text-[10px]">{"▶\uFE0E"}</span>
        <span className="flex-1 text-[15px] font-bold">YouTube</span>
        <button
          type="button"
          onClick={() => {
            openOutside(url);
            onClose();
          }}
          className="rounded-[10px] p-2 text-xs font-bold text-[#FFD66B]"
        >
          Open in YouTube
        </button>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-lg text-[#9EA9C0]">
          ✕
        </button>
      </div>
      <div className="relative aspect-video bg-black">
        <iframe
          src={`${
            id.startsWith("list:") ? `https://www.youtube.com/embed/videoseries?list=${id.slice(5)}&` : `https://www.youtube.com/embed/${id}?`
          }autoplay=1&playsinline=1&rel=0&modestbranding=1&origin=${encodeURIComponent(window.location.origin)}`}
          title="YouTube video"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          className="absolute inset-0 h-full w-full border-0"
        />
      </div>
      {/* footer: the miglife name in its rainbow colours, like the app */}
      <p className="px-3.5 pb-1 pt-2.5 text-center text-lg font-bold tracking-[0.04em]">
        <span
          className="bg-clip-text text-transparent"
          style={{ backgroundImage: "linear-gradient(90deg, #FF9F1C, #FFD93D, #4CD964, #34AADC, #AF52DE, #FF2D95)", WebkitBackgroundClip: "text" }}
        >
          miGlife
        </span>
      </p>
      <p className="px-2.5 pb-2.5 text-center text-[10px] text-[#7D88A3]">
        If the video doesn&apos;t play here, the owner has turned off playing in other apps — use &quot;Open in YouTube&quot;.
      </p>
    </div>
  );
}
