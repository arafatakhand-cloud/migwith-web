"use client";

import { useSession } from "./AppSession";
import { Dashboard } from "./Dashboard";
import { PageShell } from "./PageShell";

/* "/" — the signed-in home (Dashboard) or, signed out, the landing page. */
export function HomeGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  if (loading) return <main className="min-h-screen bg-sky-app" />;
  if (user) {
    return (
      <PageShell light>
        <Dashboard />
      </PageShell>
    );
  }
  return <>{children}</>;
}
