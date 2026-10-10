"use client";

import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { EntryEffectShop } from "../_components/EntryEffects";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useRequireLogin } from "../../lib/useRequireLogin";

// ✨ Entry Effects (Discover › Entry Effects, or /entry in a room): a full page
// laid out like 🎨 Style Studio, like the app's MaEntryEffectsPage.
export default function EntryEffectsPage() {
  const ready = useRequireLogin();
  const { user, username } = useCurrentUser();
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6 lg:max-w-4xl">
        <PageTitle title="Entry Effects" subtitle="30 days each · everyone sees it" icon="✨" />
        {ready && user ? <EntryEffectShop uid={user.uid} myName={username} /> : <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>}
      </section>
    </PageShell>
  );
}
