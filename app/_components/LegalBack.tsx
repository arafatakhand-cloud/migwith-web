"use client";

import { useRouter } from "next/navigation";

// ← on the public pages (Privacy, Terms, ...): goes back to where the person
// came from, or to the start page when the page was opened on its own
// (for example from the app's Settings).
export function LegalBack() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
      aria-label="Back"
      className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-white text-lg font-bold text-[#0B2A5B] shadow-sm"
    >
      ←
    </button>
  );
}
