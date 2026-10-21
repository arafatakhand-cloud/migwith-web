"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { BackButton } from "./BackButton";
import { ClassicListRow, ClassicSectionBar, ClassicTitleBar } from "./Classic";
import { useIsClassic } from "../../lib/uiStyle";

// Pieces shared by the app-style light pages (Explore, Members, Gift Shops).

export function PageTitle({ title, subtitle, icon, backHref }: { title: string; subtitle?: string; icon?: string; backHref?: string }) {
  const router = useRouter();
  const classic = useIsClassic();
  // backHref: always go to that page (like the app's fixed back), so two pages
  // can't send you back and forth through the browser history.
  const back = () => (backHref ? router.push(backHref) : window.history.length > 1 ? router.back() : router.push("/"));
  if (classic)
    return (
      <div className="-mx-3 mb-2 sm:-mx-6">
        <ClassicTitleBar
          title={
            <>
              {icon && <span className="mr-1">{icon}</span>}
              {title}
            </>
          }
          subtitle={subtitle ? subtitle.toLowerCase().replace(/^./, (c) => c.toUpperCase()) : undefined}
          onBack={back}
        />
      </div>
    );
  return (
    <div className="flex items-center gap-3 py-3">
      <BackButton onClick={back} />
      <div className="min-w-0 flex-1 text-center">
        <h1 className="text-xl font-black text-[#0B2A5B]">
          {icon && <span className="mr-1">{icon}</span>}
          {title}
        </h1>
        {subtitle && <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#2F80ED]">{subtitle}</p>}
      </div>
      <span className="w-10 shrink-0" />
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  const classic = useIsClassic();
  if (classic) return <ClassicSectionBar>{children}</ClassicSectionBar>;
  return (
    <p className="mb-2 mt-4 border-l-4 border-[#2F80ED] pl-2 text-xs font-bold uppercase tracking-widest text-[#35507E]">
      {children}
    </p>
  );
}

// A pastel card: coloured icon box, title and subtitle, round › on the right.
export function PastelCard({
  icon,
  title,
  subtitle,
  color,
  href,
  onClick,
  note,
  right,
}: {
  icon: string;
  title: string;
  subtitle: string;
  color: string;
  href?: string;
  onClick?: () => void;
  note?: string;
  /** Replaces the › on the right (a switch, say). */
  right?: React.ReactNode;
}) {
  const classic = useIsClassic();
  if (classic)
    return (
      <ClassicListRow
        icon={icon}
        title={title}
        subtitle={subtitle}
        color={color}
        href={href}
        onClick={onClick}
        right={right ?? (note ? <span className="shrink-0 text-[10px] font-bold text-[#8A97A8]">{note}</span> : undefined)}
      />
    );
  const body = (
    <>
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl"
        style={{ backgroundColor: `${color}26` }}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-bold text-[#0B2A5B]">{title}</span>
        <span className="block truncate text-xs text-[#6B7A99]">{subtitle}</span>
      </span>
      {right ? (
        right
      ) : note ? (
        <span className="shrink-0 rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-bold text-[#6B7A99]">{note}</span>
      ) : (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
          style={{ backgroundColor: `${color}22`, color }}
        >
          ›
        </span>
      )}
    </>
  );
  const cls = "flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left shadow-sm transition";
  const style = { background: `linear-gradient(90deg, var(--card-surface, #ffffff) 40%, ${color}1f)`, borderColor: `${color}40` };
  // A `right` with nothing to open (a switch, say) stays a plain row; with an
  // href / onClick the whole card still opens it (Discover's LIVE, Play Zone).
  if (right && !href && !onClick)
    return (
      <div className={cls} style={style}>
        {body}
      </div>
    );
  if (href)
    return (
      <Link href={href} className={`${cls} hover:brightness-[0.98]`} style={style}>
        {body}
      </Link>
    );
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className={`${cls} ${onClick ? "" : "opacity-70"}`} style={style}>
      {body}
    </button>
  );
}
