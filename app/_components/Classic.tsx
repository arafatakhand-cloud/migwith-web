"use client";

import Link from "next/link";
import { useIsClassic } from "../../lib/uiStyle";
import { BackButton } from "./BackButton";

// 📟 CLASSIC versions of the shared page pieces (the app's ClassicPageTitleBar,
// ClassicSectionBar and ClassicListRow). Pages show these instead of their own
// header / labels / cards when Settings › Appearance › App style is Classic.

export { useIsClassic };

/** Blue gradient title bar with an orange line under it: ← back, title, small subtitle, actions. */
export function ClassicTitleBar({
  title,
  subtitle,
  onBack,
  backHref,
  children,
}: {
  title: React.ReactNode;
  subtitle?: string;
  onBack?: () => void;
  backHref?: string;
  /** Things on the right (a button, the coin balance …). */
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-2 bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD] px-2 py-[7px] text-white">
        {(onBack || backHref) && <BackButton onClick={onBack} href={backHref} />}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold leading-6">{title}</h1>
          {subtitle && <p className="truncate text-[11px] text-white/80">{subtitle}</p>}
        </div>
        {children}
      </div>
      <div className="h-[2px] bg-[#F07A00]" />
    </div>
  );
}

/** Grey folder bar "▼ Section". */
export function ClassicSectionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-1.5 flex items-center bg-gradient-to-b from-[#E9EEF4] to-[#D6DEE8] px-2.5 py-1.5">
      <span className="w-4 text-[10px] text-[#2F6ABD]">▼</span>
      <span className="text-[13px] font-bold text-[#16315F]">{children}</span>
    </div>
  );
}

/** One plain list line: small square icon tile, title + grey subtitle, › (or `right`), thin line under it. */
export function ClassicListRow({
  icon,
  title,
  subtitle,
  color = "#2F6ABD",
  href,
  onClick,
  right,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  color?: string;
  href?: string;
  onClick?: () => void;
  right?: React.ReactNode;
}) {
  const body = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-[17px]"
        style={{ background: `${color}29`, border: `1px solid ${color}73` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-[#16315F]">{title}</span>
        {subtitle && <span className="line-clamp-2 block text-xs text-[#6B7788]">{subtitle}</span>}
      </span>
      {right ?? <span className="text-xl text-[#A9B4C2]">›</span>}
    </>
  );
  const cls =
    "classic-row relative flex w-full items-center gap-2.5 bg-white px-2.5 py-[9px] text-left after:absolute after:bottom-0 after:left-[52px] after:right-0 after:h-px after:bg-[#DDE3EA]";
  if (href)
    return (
      <Link href={href} className={`${cls} hover:bg-[#F6F8FB]`}>
        {body}
      </Link>
    );
  if (onClick && !right)
    return (
      <button type="button" onClick={onClick} className={`${cls} hover:bg-[#F6F8FB]`}>
        {body}
      </button>
    );
  return (
    <div className={cls} onClick={onClick} role={onClick ? "button" : undefined}>
      {body}
    </div>
  );
}
