"use client";

import Link from "next/link";

// The app-wide ← back button: a round glossy button with a drawn chevron.
//   light — on light pages: white pearl button, blue arrow, soft blue shadow
//   dark  — on coloured headers: frosted glass button, white arrow
// It takes either an href (a link) or an onClick (a button).

type Props = {
  variant?: "light" | "dark";
  href?: string;
  onClick?: () => void;
  className?: string;
  label?: string;
};

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 5 8 12l7 7" />
      <path d="M8.5 12H20" opacity=".55" />
    </svg>
  );
}

const BASE =
  "group inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2";

const STYLES = {
  light:
    "border border-white bg-gradient-to-b from-white to-[#E6F0FC] text-[#1E63D6] shadow-[0_4px_12px_rgba(30,99,214,.22),inset_0_1px_0_#fff] hover:shadow-[0_6px_16px_rgba(30,99,214,.32)] focus-visible:ring-[#1E63D6]/40",
  dark:
    "border border-white/45 bg-white/15 text-white shadow-[0_4px_12px_rgba(0,0,0,.18),inset_0_1px_0_rgba(255,255,255,.35)] backdrop-blur-sm hover:bg-white/25 focus-visible:ring-white/60",
};

export function BackButton({ variant = "light", href, onClick, className = "", label = "Back" }: Props) {
  const cls = `${BASE} ${STYLES[variant]} ${className}`;
  const inner = (
    <span className="transition-transform duration-150 group-hover:-translate-x-0.5">
      <Chevron />
    </span>
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} className={cls}>
      {inner}
    </button>
  );
}

/** "← Back to …" as a pill: the same glossy look with the arrow and a label. */
export function BackPill({
  variant = "light",
  href,
  onClick,
  label,
  disabled,
  className = "",
}: Props & { label: string; disabled?: boolean }) {
  const cls = `group inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-4 text-sm font-bold transition duration-150 active:scale-95 disabled:opacity-50 ${STYLES[variant]} ${className}`;
  const inner = (
    <>
      <span
        className={`flex h-7 w-7 items-center justify-center rounded-full transition-transform duration-150 group-hover:-translate-x-0.5 ${
          variant === "light" ? "bg-[#1E63D6] text-white" : "bg-white/20"
        }`}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M15 5 8 12l7 7" />
        </svg>
      </span>
      {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={cls}>
      {inner}
    </button>
  );
}
