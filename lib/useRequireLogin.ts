"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "../app/_components/AppSession";

// Sends signed-out visitors to /login; true once a signed-in user is known.
export function useRequireLogin(): boolean {
  const router = useRouter();
  const { user, loading } = useSession();
  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);
  return !loading && !!user;
}
