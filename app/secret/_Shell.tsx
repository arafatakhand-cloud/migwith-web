"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { BackButton } from "../_components/BackButton";

// Frame for the founder pages: back arrow + title, and "FOUNDER ONLY" for everyone else.
export function FounderShell({ title, allowed, loaded, children }: { title: string; allowed: boolean; loaded: boolean; children: ReactNode }) {
  const ready = useRequireLogin();
  const router = useRouter();
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl space-y-2.5 p-4 pb-10 text-[#0B1F3A]">
        <div className="flex items-center gap-1">
          <BackButton onClick={() => router.back()} className="mr-1.5" />
          <h1 className="flex-1 text-[22px] font-extrabold">{title}</h1>
        </div>
        {!ready || !loaded ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading…</p>
        ) : !allowed ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="text-5xl">🔒</span>
            <p className="mt-3 text-[22px] font-extrabold">FOUNDER ONLY</p>
            <p className="mt-2 text-gray-500">This page is available only to the FOUNDER.</p>
          </div>
        ) : (
          children
        )}
      </section>
    </PageShell>
  );
}

export const card = "rounded-2xl bg-white p-4 shadow-sm";
export const input = "w-full rounded-xl border border-[#D4DDEB] bg-white px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]";
