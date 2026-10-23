import type { ReactNode } from "react";

// 📢 The browser's loudspeaker emoji faces the other way from the app's, so on the
// web it is mirrored to face the same way (bell on the left, like the app).
export function flipMegaphone(v: ReactNode): ReactNode {
  if (typeof v !== "string" || !v.includes("📢")) return v;
  return v.split("📢").flatMap((part, i) =>
    i === 0
      ? [part]
      : [
          <span key={`mg${i}`} className="inline-block -scale-x-100">
            📢
          </span>,
          part,
        ]
  );
}
