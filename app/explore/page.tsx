"use client";

import { useState } from "react";
import { PageShell } from "../_components/PageShell";
import { PageTitle, PastelCard, SectionLabel } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { useIsClassic } from "../../lib/uiStyle";

// Discover (modern): ☀️ the Community page's light look — tabs, then
// ANNOUNCEMENTS / SHOP / EVENTS / COMMUNITY as pastel cards. Classic keeps its rows.
// 💎 Luxury Festival: everyone sees the Luxury Bet top 25; miglife also sets its time.
type Item = { icon: string; title: string; subtitle: string; color: string; tint: string; href?: string; note?: string; tab: Tab };
const LIVE = new Set(["Luxury Festival", "Gift Contest", "Game Contest", "Lucky User"]);
type Tab = "events" | "shop" | "community";
const ITEMS: Item[] = [
  { icon: "📰", title: "Feed", subtitle: "Read and share stories", color: "#2563EB", tint: "#E6F0FC", href: "/feed", tab: "community" },
  { icon: "📢", title: "Announcements", subtitle: "miGlife news & updates", color: "#3984D9", tint: "#FFF3D6", href: "/announcements", tab: "community" },
  { icon: "🎁", title: "Gift Gallery", subtitle: "Send gifts to your friends", color: "#E5484D", tint: "#FFE6F2", href: "/gifts", tab: "shop" },
  { icon: "💭", title: "Feel Gallery", subtitle: "Share how you feel in a room", color: "#2563EB", tint: "#E6F0FC", href: "/feels", tab: "shop" },
  { icon: "👥", title: "Community", subtitle: "Staff, Mentors & Merchants", color: "#7B3FC7", tint: "#EDE6FF", href: "/members", tab: "community" },
  { icon: "🏆", title: "Leader Board", subtitle: "Top game winners across rooms", color: "#D9A400", tint: "#FFF6DD", href: "/leaderboard", tab: "events" },
  { icon: "💎", title: "Luxury Festival", subtitle: "Live festival · top players by spend", color: "#D9A400", tint: "#E3F2FF", href: "/luxury-festival", tab: "events" },
  { icon: "🎁", title: "Gift Contest", subtitle: "Live contest · top gifters", color: "#E5484D", tint: "#FFE6F2", href: "/gift-contest", tab: "events" },
  { icon: "🎮", title: "Game Contest", subtitle: "Live contest · top players", color: "#2F6FD6", tint: "#E6EEFF", href: "/ludo-contest", tab: "events" },
  { icon: "🍀", title: "Lucky User", subtitle: "Every 3 hours · most active chatter wins", color: "#1E8C4E", tint: "#E3F7EA", href: "/lucky", tab: "events" },
  { icon: "👑", title: "VIP Subscription", subtitle: "Rainbow name · picture & voice share", color: "#B04BD6", tint: "#FFF1C9", href: "/special-colour", tab: "shop" },
  { icon: "🎨", title: "Style Studio", subtitle: "Premium username colors", color: "#12AFC7", tint: "#FFE9DE", href: "/style-studio", tab: "shop" },
  { icon: "⚽", title: "Supporters Badge", subtitle: "Your football team's badge", color: "#1B9E4B", tint: "#E3F7F0", href: "/supporter-colours", tab: "shop" },
  { icon: "🎨", title: "Sticker Store", subtitle: "Free and paid sticker packs", color: "#7C3AED", tint: "#F1E8FB", href: "/stickers", tab: "shop" },
  { icon: "✨", title: "Entry Effects", subtitle: "Everyone sees it when you enter a room · 30 days", color: "#FF6F00", tint: "#F3E8FF", href: "/entry-effects", tab: "shop" },
  { icon: "🎵", title: "Profile Songs", subtitle: "A tune plays on your profile · 30 days", color: "#8B4DFF", tint: "#EDE6FF", href: "/profile-songs", tab: "shop" },
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
  // 📢 Announcements first, then Shop, Events and Community.
  const SECTIONS: [Tab | "news", string][] = [
    ["news", "📢 ANNOUNCEMENTS"],
    ["shop", "🛍 SHOP"],
    ["events", "🎉 EVENTS"],
    ["community", "👥 COMMUNITY"],
  ];
  const inSection = (i: Item, id: Tab | "news") => (id === "news" ? i.title === "Announcements" : i.tab === id && i.title !== "Announcements");
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
  // ☀️ Light look like Community: pastel cards in sections, tabs on top.
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-10 sm:px-6">
        <PageTitle title="Discover" subtitle="Events · Shop · Community" backHref="/" />
        {ready && (
          <>
            <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-0.5">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition ${
                    tab === id ? "bg-gradient-to-b from-[#7FA6E6] to-[#8B5CFF] text-white shadow-[inset_0_2px_0_rgba(255,255,255,.45),0_3px_0_#5A6FC4,0_5px_0_#4A5BB0,0_9px_12px_rgba(90,111,196,.35)] active:translate-y-[2px]" : "border border-[#D5E3F5] bg-white text-[#5B6B8C] shadow-[inset_0_2px_0_#fff,0_2px_0_#C9D8EA,0_4px_0_#B7C9E0,0_7px_10px_rgba(11,31,58,.12)] active:translate-y-[2px]"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {SECTIONS.filter(([id]) => tab === "all" || tab === id || (id === "news" && tab === "community")).map(([id, label]) => (
              <div key={id}>
                <SectionLabel>{label}</SectionLabel>
                <div className="grid gap-2.5 md:grid-cols-2">
                  {items
                    .filter((i) => inSection(i, id))
                    .map((i) => (
                      <PastelCard
                        key={i.title}
                        icon={i.icon}
                        title={i.title}
                        subtitle={i.subtitle}
                        color={i.color}
                        href={i.href}
                        note={i.note}
                        right={
                          LIVE.has(i.title) ? (
                            <span className="flex shrink-0 items-center gap-1 rounded-full bg-[#E3F7EA] px-2 py-0.5 text-[10px] font-black text-[#16A34A]">
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#16A34A]" />
                              LIVE
                            </span>
                          ) : undefined
                        }
                      />
                    ))}
                </div>
              </div>
            ))}
          </>
        )}
      </section>
    </PageShell>
  );
}
