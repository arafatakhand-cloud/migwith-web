"use client";

import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { ProfileSongShop } from "../_components/ProfileSongs";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useRequireLogin } from "../../lib/useRequireLogin";

// 🎵 Profile Songs (Explore › Profile Songs), like the app's ProfileSongsPage.
export default function ProfileSongsPage() {
  const ready = useRequireLogin();
  const { user } = useCurrentUser();
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl px-3 pb-8 sm:px-6 lg:max-w-4xl">
        <PageTitle title="Profile Songs" subtitle="15–30 second tunes · 30 days each" icon="🎵" />
        {ready && user ? <ProfileSongShop uid={user.uid} /> : <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>}
      </section>
    </PageShell>
  );
}
