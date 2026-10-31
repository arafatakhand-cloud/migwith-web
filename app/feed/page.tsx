"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { FeedList } from "../_components/FeedList";

// 📰 Feed page (web.miglife.app/feed, or ?author=name for one writer's posts).
// The same list shows on the back of the Lobby when 📰 Feed is tapped.
export default function FeedPage() {
  return (
    <PageShell light>
      <Suspense>
        <FeedAuthor />
      </Suspense>
    </PageShell>
  );
}

function FeedAuthor() {
  const author = (useSearchParams().get("author") || "").trim();
  return <FeedList author={author} />;
}
