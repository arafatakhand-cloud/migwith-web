"use client";

import Link from "next/link";
import { CHAT_TEXT_MAX, CHAT_TEXT_MIN, setChatTextSize, useChatTextSize } from "../../lib/chatTextSize";
import { ThemePicker } from "../_components/ThemePicker";
import { useUiStyle } from "../../lib/uiStyle";

// ⚙ Settings rows: a coloured icon tile, title + short line, and a switch /
// value / › on the right. Modern: every row is its own Community-page card
// (white → its colour); Classic: grouped white cards with dividers.
export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const classic = useUiStyle() === "classic";
  return (
    <section>
      <p className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#5B6B8C]">{title}</p>
      {classic ? (
        <div className="divide-y divide-[#EEF2F8] overflow-hidden rounded-3xl bg-white shadow-[0_2px_10px_rgba(16,40,90,0.06)]">{children}</div>
      ) : (
        <div className="space-y-2.5">{children}</div>
      )}
    </section>
  );
}

export function Row({
  icon,
  tint,
  title,
  subtitle,
  value,
  right,
  href,
  onClick,
}: {
  icon: string;
  tint: string;
  title: string;
  subtitle?: string;
  value?: string;
  right?: React.ReactNode;
  href?: string;
  onClick?: () => void;
}) {
  const classic = useUiStyle() === "classic";
  const body = (
    <>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ background: `linear-gradient(145deg, ${tint}26, ${tint}12)`, boxShadow: `inset 0 0 0 1px ${tint}${classic ? "22" : "4D"}` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-bold text-[#0B1F3A]">{title}</span>
        {subtitle && <span className="block truncate text-xs text-[#6B7A99]">{subtitle}</span>}
      </span>
      {right ?? (
        <span className="flex shrink-0 items-center gap-1.5">
          {value && <span className="text-[13px] font-semibold text-[#5B6B8C]">{value}</span>}
          {classic ? (
            <span className="text-xl leading-none text-[#A9B4C2]">›</span>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full text-lg font-bold" style={{ background: `${tint}24`, color: tint }}>
              ›
            </span>
          )}
        </span>
      )}
    </>
  );
  const cls = classic
    ? "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F9FD]"
    : "flex w-full items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition hover:brightness-[.98]";
  // 🎨 the Community page's card: white → the row's colour
  const style = classic
    ? undefined
    : { borderColor: `${tint}38`, background: `linear-gradient(90deg, #FFFFFF, #FFFFFF, ${tint}1A)`, // 🫧 subtle 6D (option C): two stacked layers in the row's colour
    boxShadow: `inset 0 2px 0 #fff, 0 2px 0 ${tint}3D, 0 4px 0 ${tint}24` };
  if (href) return <Link href={href} className={cls} style={style}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls} style={style}>{body}</button>;
  return <div className={cls} style={style}>{body}</div>;
}

// 🔠 Room text size inside the Appearance group: A− · size · A+ (saved in this browser).
export function TextSizeRow() {
  const size = useChatTextSize();
  const step = (d: number) => setChatTextSize(Math.min(CHAT_TEXT_MAX, Math.max(CHAT_TEXT_MIN, size + d)));
  return (
    <Row
      icon="🔠"
      tint="#174EA6"
      title="Room text size"
      subtitle="How big chat text is in rooms"
      right={
        <span className="flex shrink-0 items-center gap-1.5">
          <button type="button" disabled={size <= CHAT_TEXT_MIN} onClick={() => step(-1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#174EA6]/10 text-xs font-extrabold text-[#174EA6] disabled:opacity-40">
            A−
          </button>
          <span className="w-6 text-center text-sm font-bold text-[#0B1F3A]">{size}</span>
          <button type="button" disabled={size >= CHAT_TEXT_MAX} onClick={() => step(1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-[#174EA6]/10 text-[15px] font-extrabold text-[#174EA6] disabled:opacity-40">
            A+
          </button>
        </span>
      }
    />
  );
}

// 🎨 Theme picker: Light / Dark / Auto (only Modern Light and Modern Dark).
export function AppModeCard() {
  return (
    <div>
      <p className="mb-1.5 pl-2 text-[11px] font-extrabold tracking-[0.14em] text-[#5B6B8C]">THEME</p>
      <div className="rounded-[18px] bg-white p-3 shadow-sm">
        <ThemePicker />
      </div>
    </div>
  );
}

