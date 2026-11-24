"use client";

import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PageTitle } from "../_components/LightCards";
import { ThemePicker } from "../_components/ThemePicker";

// Settings › Appearance: only two themes now — Modern Light and Modern Dark.
// Light / Dark / Auto (Auto follows the phone's own setting). Kept in this browser.
export default function AppearancePage() {
  const ready = useRequireLogin();
  return (
    <PageShell light>
      <section className="mx-auto max-w-md px-3 pb-8 sm:px-6 lg:max-w-3xl">
        <PageTitle title="Appearance" subtitle="Light or dark" icon="🎨" />
        {ready && (
          <div className="rounded-2xl bg-white p-3.5 shadow-sm">
            <p className="mb-2.5 font-extrabold text-[#0B2A5B]">Choose your theme</p>
            <ThemePicker />
          </div>
        )}
      </section>
    </PageShell>
  );
}
