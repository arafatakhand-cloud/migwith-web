"use client";

import { PageShell } from "../_components/PageShell";
import { PageTitle, PastelCard } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";

// Explore, like the app's. Luxury Festival is still "coming soon" in the app too.
export default function ExplorePage() {
  const ready = useRequireLogin();
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 lg:max-w-4xl pb-8 sm:px-6">
        <PageTitle title="Explore" subtitle="Discover · Community" />
        {ready && (
          <div className="grid gap-2.5 md:grid-cols-2">
            <PastelCard icon="📢" title="Announcements" subtitle="migwith News & Updates" color="#3984D9" href="/announcements" />
            <PastelCard icon="🎁" title="Gift Shops" subtitle="Send gifts to your friends" color="#E5484D" href="/gifts" />
            <PastelCard icon="👥" title="Members" subtitle="Staff, Mentors & Merchants" color="#7B3FC7" href="/members" />
            <PastelCard icon="🏆" title="Leader Board" subtitle="Top Game Winners across rooms" color="#D9A400" href="/leaderboard" />
            <PastelCard icon="💎" title="Luxury Festival" subtitle="Live festival · Top Players by Spend" color="#D9A400" note="Coming soon" />
            <PastelCard icon="🎁" title="Gift Contest" subtitle="Live contest · Top Gifters" color="#E5484D" href="/gift-contest" />
            <PastelCard icon="🍀" title="Lucky User" subtitle="Every 3 hours · Most active chatter wins" color="#1E8C4E" href="/lucky" />
            <PastelCard icon="🎨" title="Style Studio" subtitle="Premium username colors" color="#12AFC7" href="/style-studio" />
            <PastelCard icon="🏪" title="Merchant Program" subtitle="Become or manage a Merchant" color="#7B3FC7" href="/merchant" />
          </div>
        )}
      </section>
    </PageShell>
  );
}
