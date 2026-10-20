"use client";

import { useState } from "react";
import Link from "next/link";
import { PageShell } from "../_components/PageShell";
import { BackButton } from "../_components/BackButton";
import { PageTitle, PastelCard } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useIsClassic } from "../../lib/uiStyle";

// Discover (modern): 🌙 a night page — tabs, then EVENTS / SHOP / COMMUNITY,
// every feature its own gradient card. Classic keeps the pastel cards.
// 💎 Luxury Festival: everyone sees the Luxury Bet top 25; miglife also sets its time.
type Item = { icon: string; title: string; subtitle: string; color: string; tint: string; href?: string; note?: string; tab: Tab };
// 🌙 each row's own gradient on the night page
const GRAD: Record<string, [string, string]> = {
  "Announcements": ["#7FB2FF", "#2F6ABD"],
  "Gift Gallery": ["#FF8A9A", "#E5484D"],
  "Community": ["#B79CFF", "#5B2A86"],
  "Rankings": ["#FFD66B", "#D97706"],
  "Luxury Festival": ["#FFB347", "#E0457B"],
  "Gift Contest": ["#FF6FA8", "#8B5CFF"],
  "Lucky User": ["#5EE08A", "#12845A"],
  "VIP Subscription": ["#D9A0FF", "#7443D1"],
  "Style Studio": ["#7FE3F2", "#0E7C9A"],
  "Supporters Badge": ["#8FE3A8", "#1B9E4B"],
  "Entry Effects": ["#FFB27F", "#FF6F00"],
  "miGlife Partner": ["#9FB4FF", "#3F55C7"],
};
const LIVE = new Set(["Luxury Festival", "Gift Contest", "Lucky User"]);
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
  const SECTIONS: [Tab, string][] = [
    ["events", "🎉 EVENTS"],
    ["shop", "🛍 SHOP"],
    ["community", "👥 COMMUNITY"],
  ];
  if (classic) {
    return (
      <PageShell light>
        <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
          <PageTitle title="Discover" subtitle="Discover · Community" backHref="/" />
          {ready && (
            <div className="grid gap-2.5">
              {items.map((i) => (
                <PastelCard key={i.title} icon={i.icon} title={i.title} subtitle={i.subtitle} color={i.color} href={i.href} note={i.note} />
              ))}
            </div>
          )}
        </section>
      </PageShell>
    );
  }
  return (
    <PageShell light>
      <div className="relative isolate min-h-[calc(100dvh-64px)] overflow-hidden text-white" style={{ background: "linear-gradient(180deg,#0F1630,#171338 60%,#1F1238)" }}>
        <span className="pointer-events-none absolute -right-20 -top-20 -z-10 h-64 w-64 rounded-full blur-3xl" style={{ background: "#5A8FD655" }} />
        <span className="pointer-events-none absolute -left-24 top-80 -z-10 h-72 w-72 rounded-full blur-3xl" style={{ background: "#8B5CFF40" }} />
        <section className="mx-auto max-w-2xl px-3 pb-10 pt-3 sm:px-6">
          <div className="flex items-center gap-3">
            <BackButton variant="dark" href="/" />
            <div>
              <h1 className="text-[22px] font-black">🧭 Discover</h1>
              <p className="text-xs" style={{ color: "#8FA0C9" }}>Events · Shop · Community</p>
            </div>
          </div>
          {ready && (
            <>
              <div className="no-scrollbar mt-4 flex gap-1.5 overflow-x-auto pb-0.5">
                {TABS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className="shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition"
                    style={
                      tab === id
                        ? { background: "linear-gradient(90deg,#5A8FD6,#8B5CFF)", color: "#fff", boxShadow: "0 4px 12px #5A8FD655" }
                        : { background: "#ffffff14", color: "#B9C4DD", border: "1px solid #ffffff1f" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
              {SECTIONS.filter(([id]) => tab === "all" || tab === id).map(([id, label]) => (
                <div key={id}>
                  <p className="mb-2 ml-1 mt-5 text-[11px] font-black tracking-[1.3px]" style={{ color: "#8FA0C9" }}>
                    {label}
                  </p>
                  <div className="space-y-2">
                    {items
                      .filter((i) => i.tab === id)
                      .map((i) => {
                        const [g1, g2] = GRAD[i.title] || ["#5A8FD6", "#8B5CFF"];
                        const row = (
                          <span
                            className="relative flex items-center gap-3 overflow-hidden rounded-[18px] border px-3 py-2.5 transition active:scale-[.98]"
                            style={{ background: "rgba(255,255,255,.05)", borderColor: "rgba(255,255,255,.08)" }}
                          >
                            {/* a thin colour line on the left, the colour only on the icon */}
                            <span className="absolute inset-y-2.5 left-0 w-[3px] rounded-r-full" style={{ background: `linear-gradient(${g1}, ${g2})` }} />
                            <span
                              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-[22px]"
                              style={{ background: `linear-gradient(135deg, ${g1}, ${g2})`, boxShadow: `0 4px 12px ${g2}55` }}
                            >
                              {i.icon}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] font-extrabold text-white">{i.title}</span>
                              <span className="block truncate text-[11.5px]" style={{ color: "#8FA0C9" }}>{i.subtitle}</span>
                            </span>
                            {i.note ? (
                              <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "rgba(255,255,255,.08)", color: "#B9C4DD" }}>{i.note}</span>
                            ) : (
                              LIVE.has(i.title) && (
                                <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold" style={{ color: "#5EE08A" }}>
                                  <span className="h-1.5 w-1.5 animate-pulse rounded-full" style={{ background: "#5EE08A" }} />
                                  LIVE
                                </span>
                              )
                            )}
                            <span className="shrink-0 text-xl leading-none" style={{ color: "#5B6B8C" }}>›</span>
                          </span>
                        );
                        return i.href ? (
                          <Link key={i.title} href={i.href} className="block">
                            {row}
                          </Link>
                        ) : (
                          <div key={i.title} className="opacity-70">
                            {row}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}
            </>
          )}
        </section>
      </div>
    </PageShell>
  );
}
