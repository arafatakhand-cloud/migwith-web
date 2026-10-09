"use client";

import { useState } from "react";

// 🎁 A gift / badge picture that never shows a broken image: sent without the
// page address (some picture hosts refuse pictures shown on other sites, which
// the app never hits), and if it still can't load, the gift's own emoji is
// shown instead — remembered, so it isn't tried again on every line.
const failed = new Set<string>();

export function GiftImg({ src, fallback, className, alt = "" }: { src: string; fallback: React.ReactNode; className?: string; alt?: string }) {
  const [bad, setBad] = useState(() => !src || failed.has(src));
  if (bad || failed.has(src)) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      loading="lazy"
      onError={() => {
        failed.add(src);
        setBad(true);
      }}
      className={className}
    />
  );
}
