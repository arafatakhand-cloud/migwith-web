"use client";

import { useState, type CSSProperties } from "react";

// ↻ A refresh button that shows it worked: the arrow turns once on every tap
// (the page reloads its numbers at the same time).
export function RefreshButton({
  onClick,
  className,
  style,
  glyph = "↻",
  label,
  title = "Refresh",
  disabled,
}: {
  onClick: () => void;
  className?: string;
  style?: CSSProperties;
  glyph?: string;
  label?: string;
  title?: string;
  disabled?: boolean;
}) {
  const [tick, setTick] = useState(0);
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      className={className}
      style={style}
      onClick={() => {
        setTick((t) => t + 1);
        onClick();
      }}
    >
      <span key={tick} className={`inline-block ${tick ? "refresh-spin" : ""}`}>
        {glyph}
      </span>
      {label && <> {label}</>}
    </button>
  );
}
