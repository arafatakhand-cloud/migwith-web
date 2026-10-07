"use client";

import { useRouter } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { AvatarEditor } from "../_components/Avatar";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { useRequireLogin } from "../../lib/useRequireLogin";

// 🧍 My Avatar (Discover › Avatar, or Edit Avatar on your profile), like the app's.
export default function AvatarPage() {
  const ready = useRequireLogin();
  const router = useRouter();
  const { user } = useCurrentUser();
  return (
    <PageShell light>
      <section className="mx-auto max-w-xl px-3 pb-8 pt-4 sm:px-6">
        {ready && user ? <AvatarEditor uid={user.uid} onBack={() => router.back()} /> : <p className="py-20 text-center text-sm text-[#5B6B8C]">Loading…</p>}
      </section>
    </PageShell>
  );
}
