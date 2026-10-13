"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { useRequireLogin } from "../../lib/useRequireLogin";
import { BackButton } from "../_components/BackButton";
import { ClassicTitleBar, useIsClassic } from "../_components/Classic";
import { useCurrentUser } from "../../lib/useCurrentUser";
import { isMainFounderName } from "../../lib/founder";
import { SecretLockGate } from "./_SecretLock";

// Frame for the founder pages: back arrow + title, and "FOUNDER ONLY" for everyone else.
export function FounderShell({
  title,
  allowed,
  loaded,
  children,
  onBack,
}: {
  title: string;
  allowed: boolean;
  loaded: boolean;
  children: ReactNode;
  /** Overrides the back arrow (e.g. back from one tool to the tools list). */
  onBack?: () => void;
}) {
  const ready = useRequireLogin();
  const router = useRouter();
  const classic = useIsClassic();
  // 🔒 miGlife: the secret opens only with the Secret PIN (the server checks it too)
  const { username } = useCurrentUser();
  const miglife = isMainFounderName(username);
  return (
    <PageShell light>
      <section className="mx-auto max-w-2xl space-y-2.5 p-4 pb-10 text-[#0B1F3A]">
        {classic ? (
          <div className="-mx-4 -mt-4">
            <ClassicTitleBar title={title} subtitle="Founder tools" onBack={() => (onBack ? onBack() : router.back())} />
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <BackButton onClick={() => (onBack ? onBack() : router.back())} className="mr-1.5" />
            <h1 className="flex-1 text-[22px] font-extrabold">{title}</h1>
          </div>
        )}
        {!ready || !loaded ? (
          <p className="py-10 text-center text-sm text-[#5B6B8C]">Loading…</p>
        ) : !allowed ? (
          <div className="flex flex-col items-center py-16 text-center">
            <span className="text-5xl">🔒</span>
            <p className="mt-3 text-[22px] font-extrabold">FOUNDER ONLY</p>
            <p className="mt-2 text-gray-500">This page is available only to the FOUNDER.</p>
          </div>
        ) : miglife ? (
          <SecretLockGate onBack={() => router.back()}>{children}</SecretLockGate>
        ) : (
          children
        )}
      </section>
    </PageShell>
  );
}

export const card = "rounded-2xl bg-white p-4 shadow-sm";
export const input = "w-full rounded-xl border border-[#D4DDEB] bg-white px-3 py-2.5 text-base outline-none focus:border-[#2F80ED]";
