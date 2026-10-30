"use client";

import { useState } from "react";

// 🎁 A gift / badge picture that never shows a broken image: sent without the
// page address (some picture hosts refuse pictures shown on other sites, which
// the app never hits), and if it still can't load, the gift's own emoji is
// shown instead.
// 💪 Sturdier (miglife: "pictures sometimes don't show"): one failed load (a
// network blip) is tried once more with a fresh link before giving up, and a
// picture that failed is only skipped for 2 minutes — not for the whole visit.
const RETRY_AFTER_MS = 2 * 60_000;
const failedAt = new Map<string, number>();
const isFailed = (src: string) => {
  const t = failedAt.get(src);
  if (t === undefined) return false;
  if (Date.now() - t > RETRY_AFTER_MS) {
    failedAt.delete(src);
    return false;
  }
  return true;
};
const withRetry = (src: string) => `${src}${src.includes("?") ? "&" : "?"}retry=${Date.now()}`;

export function GiftImg({ src, fallback, className, alt = "" }: { src: string; fallback: React.ReactNode; className?: string; alt?: string }) {
  const [state, setState] = useState<{ for: string; url: string; tries: number; bad: boolean }>(() => ({
    for: src,
    url: src,
    tries: 0,
    bad: !src || isFailed(src),
  }));
  // a new picture for this spot → start again
  const cur = state.for === src ? state : { for: src, url: src, tries: 0, bad: !src || isFailed(src) };
  if (cur !== state) setState(cur);
  if (cur.bad) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cur.url}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      decoding="async"
      onError={() => {
        if (cur.tries < 1) {
          setState({ ...cur, url: withRetry(src), tries: cur.tries + 1 });
          return;
        }
        failedAt.set(src, Date.now());
        setState({ ...cur, bad: true });
      }}
      className={className}
    />
  );
}
