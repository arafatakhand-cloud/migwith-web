"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// 📺 Live Scores was turned off (miGlife decision). An old link or bookmark to
// this page now just goes to Home.
export default function LiveScoresPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return null;
}
