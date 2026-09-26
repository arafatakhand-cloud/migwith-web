"use client";

import { PageShell } from "../_components/PageShell";
import { PageTitle, PastelCard } from "../_components/LightCards";
import { useRequireLogin } from "../../lib/useRequireLogin";

// Explore, like the app's: Gift Shops, Members, Leader Board. The rest live in the app for now.
export default function ExplorePage() {
  const ready = useRequireLogin();
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6">
        <PageTitle title="Explore" subtitle="Discover · Community" />
        {ready && (
          <div className="space-y-2.5">
            <PastelCard icon="🎁" title="Gift Shops" subtitle="Send gifts to your friends" color="#E5484D" href="/gifts" />
            <PastelCard icon="👥" title="Members" subtitle="Staff, Mentors & Merchants" color="#7B3FC7" href="/members" />
            <PastelCard icon="🏆" title="Leader Board" subtitle="Top Game Winners across rooms" color="#D9A400" href="/leaderboard" />
            <PastelCard icon="💎" title="Luxury Festival" subtitle="Live festival · Top Players by Spend" color="#D9A400" note="In app" />
            <PastelCard icon="🎁" title="Gift Contest" subtitle="Live contest · Top Gifters" color="#E5484D" note="In app" />
            <PastelCard icon="🍀" title="Lucky User" subtitle="Every 3 hours · Most active chatter wins" color="#1E8C4E" note="In app" />
            <PastelCard icon="🎨" title="Style Studio" subtitle="Premium username colors" color="#12AFC7" note="In app" />
            <PastelCard icon="🏪" title="Merchant Program" subtitle="Become or manage a Merchant" color="#7B3FC7" note="In app" />
          </div>
        )}
      </section>
    </PageShell>
  );
}
