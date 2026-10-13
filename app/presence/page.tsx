"use client";

import { useRouter } from "next/navigation";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { PageShell } from "../_components/PageShell";
import { PresencePopup } from "../_components/PresencePopup";

// Presence Status is a small popup now (tap your status dot anywhere); an old
// link to /presence shows the same popup and goes back when it closes.
export default function PresencePage() {
  const ready = useRequireLogin();
  const router = useRouter();
  return (
    <PageShell light>
      {ready && <PresencePopup onClose={() => (window.history.length > 1 ? router.back() : router.push("/"))} />}
    </PageShell>
  );
}
