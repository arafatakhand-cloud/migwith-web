"use client";

import Link from "next/link";
import { CHAT_TEXT_MAX, CHAT_TEXT_MIN, setChatTextSize, useChatTextSize } from "../../lib/chatTextSize";
import { setUiStyle, useUiStyle, type UiStyle } from "../../lib/uiStyle";

// ⚙ Settings rows: grouped white cards, a coloured icon tile, title + short
// line, and a switch / value / › on the right.
export function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <p className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#5B6B8C]">{title}</p>
      <div className="divide-y divide-[#EEF2F8] overflow-hidden rounded-3xl bg-white shadow-[0_2px_10px_rgba(16,40,90,0.06)]">{children}</div>
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
  const body = (
    <>
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg"
        style={{ background: `linear-gradient(145deg, ${tint}26, ${tint}12)`, boxShadow: `inset 0 0 0 1px ${tint}22` }}
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
          <span className="text-xl leading-none text-[#A9B4C2]">›</span>
        </span>
      )}
    </>
  );
  const cls = "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F6F9FD]";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
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

// 📱 App mode picker: two little previews of the look, tap one to switch.
export function AppModeCard() {
  const style = useUiStyle();
  const tile = (id: UiStyle, label: string, hint: string, preview: React.ReactNode) => {
    const on = style === id;
    return (
      <button
        type="button"
        onClick={() => setUiStyle(id)}
        className={`flex-1 rounded-2xl border-2 p-2 text-left transition ${on ? "border-[#E0A800] bg-[#FFFBEB] shadow-md" : "border-[#E3EAF4] bg-white hover:border-[#C9D6E8]"}`}
        aria-pressed={on}
      >
        <div className="h-[92px] overflow-hidden rounded-xl border border-black/5">{preview}</div>
        <p className="mt-2 flex items-center gap-1.5 text-[14px] font-extrabold text-[#0B1F3A]">
          <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] text-white ${on ? "bg-[#E0A800]" : "border border-[#C5D0E0] bg-white"}`}>
            {on ? "✓" : ""}
          </span>
          {label}
        </p>
        <p className="pl-[22px] text-[11px] text-[#6B7A99]">{hint}</p>
      </button>
    );
  };
  return (
    <section>
      <p className="mb-1.5 px-2 text-[11px] font-extrabold uppercase tracking-[1.4px] text-[#5B6B8C]">App mode</p>
      <div className="flex gap-2.5 rounded-3xl bg-white p-2.5 shadow-[0_2px_10px_rgba(16,40,90,0.06)]">
        {tile(
          "modern",
          "Modern",
          "Cards, gradients, bubbles",
          <div className="h-full bg-[#EAF4FE]">
            <div className="h-5 bg-gradient-to-r from-[#2F6FD6] to-[#7C4DFF]" />
            <div className="space-y-1.5 p-2">
              <div className="h-5 rounded-lg bg-gradient-to-r from-[#2F6FD6] to-[#174EA6]" />
              <div className="flex gap-1.5">
                <div className="h-6 flex-1 rounded-lg bg-white shadow-sm" />
                <div className="h-6 flex-1 rounded-lg bg-white shadow-sm" />
              </div>
              <div className="ml-auto h-3 w-2/3 rounded-full bg-[#2F80ED]" />
            </div>
          </div>
        )}
        {tile(
          "classic",
          "Classic",
          "Orange bar, simple lists",
          <div className="h-full bg-white">
            <div className="h-5 bg-gradient-to-b from-[#FF9D2E] to-[#F07A00]" />
            <div className="h-2.5 bg-gradient-to-b from-[#5A8FD6] to-[#2F6ABD]" />
            <div className="space-y-1 p-2">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-1.5 border-b border-[#EEF2F8] pb-1">
                  <span className="h-3 w-3 rounded-sm bg-gradient-to-b from-[#FF9D2E] to-[#F07A00]" />
                  <span className="h-1.5 flex-1 rounded-full bg-[#C9D2DE]" />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

