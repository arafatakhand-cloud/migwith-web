"use client";

import { PageShell } from "../_components/PageShell";
import { EntryEffectShop } from "../_components/EntryEffects";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useRequireLogin } from "../../lib/useRequireLogin";

// ✨ Entry Effects shop (Discover › Entry Effects, or /entry in a room), like the app's.
export default function EntryEffectsPage() {
  const ready = useRequireLogin();
  const { user, username } = useCurrentUser();
  return (
    <PageShell light>
      <section className="mx-auto max-w-xl px-3 pb-8 pt-4 sm:px-6">
        {ready && user ? <EntryEffectShop uid={user.uid} myName={username} /> : <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>}
      </section>
    </PageShell>
  );
}
