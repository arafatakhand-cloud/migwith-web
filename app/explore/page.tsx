"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../_components/PageShell";
import { PageTitle, PastelCard } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useIsClassic } from "../../lib/uiStyle";

// Discover: tabs (All / Events / Shop / Community) over one clean white list.
// 💎 Luxury Festival: everyone sees the Luxury Bet top 25; miglife also sets its time.
type Item = { icon: string; title: string; subtitle: string; color: string; tint: string; href?: string; note?: string; tab: Tab };
type Tab = "events" | "shop" | "community";
const ITEMS: Item[] = [
  { icon: "📢", title: "Announcements", subtitle: "miGlife news & updates", color: "#3984D9", tint: "#FFF3D6", href: "/announcements", tab: "community" },
  { icon: "🎁", title: "Gift Gallery", subtitle: "Send gifts to your friends", color: "#E5484D", tint: "#FFE6F2", href: "/gifts", tab: "shop" },
  { icon: "👥", title: "Community", subtitle: "Staff, Mentors & Merchants", color: "#7B3FC7", tint: "#EDE6FF", href: "/members", tab: "community" },
  { icon: "🏆", title: "Rankings", subtitle: "Top game winners across rooms", color: "#D9A400", tint: "#FFF6DD", href: "/leaderboard", tab: "events" },
  { icon: "💎", title: "Luxury Festival", subtitle: "Live festival · top players by spend", color: "#D9A400", tint: "#E3F2FF", href: "/luxury-festival", tab: "events" },
  { icon: "🎁", title: "Gift Contest", subtitle: "Live contest · top gifters", color: "#E5484D", tint: "#FFE6F2", href: "/gift-contest", tab: "events" },
  { icon: "🍀", title: "Lucky User", subtitle: "Every 3 hours · most active chatter wins", color: "#1E8C4E", tint: "#E3F7EA", href: "/lucky", tab: "events" },
  { icon: "👑", title: "VIP Subscription", subtitle: "Rainbow name · picture & voice share", color: "#B04BD6", tint: "#FFF1C9", href: "/special-colour", tab: "shop" },
  { icon: "🎨", title: "Style Studio", subtitle: "Premium username colors", color: "#12AFC7", tint: "#FFE9DE", href: "/style-studio", tab: "shop" },
  { icon: "⚽", title: "Supporters Badge", subtitle: "Your football team's badge", color: "#1B9E4B", tint: "#E3F7F0", href: "/supporter-colours", tab: "shop" },
  { icon: "✨", title: "Entry Effects", subtitle: "Everyone sees it when you enter a room · 30 days", color: "#FF6F00", tint: "#F3E8FF", href: "/entry-effects", tab: "shop" },
  { icon: "🏪", title: "miGlife Partner", subtitle: "Become or manage a Merchant", color: "#7B3FC7", tint: "#E6F0FC", href: "/merchant", tab: "community" },
];
const TABS: [Tab | "all", string][] = [
  ["all", "All"],
  ["events", "Events"],
  ["shop", "Shop"],
  ["community", "Community"],
];

export default function ExplorePage() {
  const ready = useRequireLogin();
  const classic = useIsClassic();
  const [tab, setTab] = useState<Tab | "all">("all");
  const items = ITEMS;
  const shown = tab === "all" ? items : items.filter((i) => i.tab === tab);
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="Discover" subtitle="Discover · Community" backHref="/" />
        {ready &&
          (classic ? (
            <div className="grid gap-2.5">
              {items.map((i) => (
                <PastelCard key={i.title} icon={i.icon} title={i.title} subtitle={i.subtitle} color={i.color} href={i.href} note={i.note} />
              ))}
            </div>
          ) : (
            <>
              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-0.5">
                {TABS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
                      tab === id ? "bg-[#1E63D6] text-white shadow" : "bg-white text-[#5B6B8C] shadow-sm"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ul className="overflow-hidden rounded-[22px] bg-white px-3 shadow-[0_2px_10px_rgba(30,99,214,.08)]">
                {shown.map((i, n) => {
                  const row = (
                    <span className={`flex items-center gap-3 py-3 ${n < shown.length - 1 ? "border-b border-[#E3ECF7]" : ""}`}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-xl" style={{ backgroundColor: i.tint }}>
                        {i.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-black text-[#0B2A5B]">{i.title}</span>
                        <span className="block truncate text-xs text-[#5B6B8C]">{i.subtitle}</span>
                      </span>
                      {i.note && <span className="shrink-0 rounded-full bg-[#EAF1FC] px-2 py-0.5 text-[10px] font-bold text-[#5B6B8C]">{i.note}</span>}
                      <span className="shrink-0 text-xl leading-none text-[#A3AFC2]">›</span>
                    </span>
                  );
                  return (
                    <li key={i.title}>
                      {i.href ? (
                        <Link href={i.href} className="block active:opacity-70">
                          {row}
                        </Link>
                      ) : (
                        <div className="opacity-70">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ))}
      </section>
    </PageShell>
  );
}
