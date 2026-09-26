"use client";

import { useSession } from "./AppSession";
import { Dashboard } from "./Dashboard";
import { PageShell } from "./PageShell";

/* "/" — the signed-in home (Dashboard) or, signed out, the landing page. */
export function HomeGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return <main className="min-h-screen bg-[#0a1440]" />;
  if (user) {
    return (
      <PageShell>
        <Dashboard />
      </PageShell>
    );
  }
  return <>{children}</>;
}
