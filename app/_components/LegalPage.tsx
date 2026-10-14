import Link from "next/link";
import type { ReactNode } from "react";

// Plain public page (Privacy Policy, Delete account): readable without signing in.
export function LegalPage({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <main className="min-h-dvh bg-gradient-to-b from-[#EEF5FD] to-[#DCEBFA] px-4 pb-12 text-[#0B2A5B]">
      <header className="mx-auto flex max-w-3xl items-center gap-2 py-4">
        <Link href="/welcome" className="flex items-center gap-1" data-notranslate>
          <span className="text-xl font-black tracking-tight">miG</span>
          <span className="rounded-full bg-gradient-to-b from-[#FF9A4D] to-[#E5541A] px-1.5 py-px text-[11px] font-black text-white">life</span>
        </Link>
        <span className="flex-1" />
        <Link href="/login" className="rounded-lg bg-[#2F80ED] px-3 py-1.5 text-sm font-bold text-white">
          Login
        </Link>
      </header>
      <article className="mx-auto max-w-3xl rounded-3xl bg-white p-5 shadow-sm sm:p-8">
        <h1 className="text-2xl font-black sm:text-3xl">{title}</h1>
        {updated && <p className="mt-1 text-xs text-[#5B6B8C]">Last updated: {updated}</p>}
        <div className="legal mt-5 space-y-4 text-[15px] leading-6 text-[#2A3B5C]">{children}</div>
      </article>
      <footer className="mx-auto mt-4 flex max-w-3xl flex-wrap gap-x-4 gap-y-1 text-xs text-[#5B6B8C]">
        <Link href="/terms" className="underline">Terms &amp; Community Rules</Link>
        <Link href="/privacy" className="underline">Privacy Policy</Link>
        <Link href="/delete-account" className="underline">Delete your account</Link>
        <a href="mailto:support@miglife.app" className="underline">support@miglife.app</a>
      </footer>
    </main>
  );
}

export function H2({ children }: { children: ReactNode }) {
  return <h2 className="pt-2 text-lg font-extrabold text-[#0B2A5B]">{children}</h2>;
}

export function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {items.map((it, i) => (
        <li key={i}>{it}</li>
      ))}
    </ul>
  );
}
