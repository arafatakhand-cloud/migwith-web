"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageShell } from "../_components/PageShell";
import { FeedList } from "../_components/FeedList";
import { StartupPopups } from "../_components/StartupPopups";

// 📰 Feed page (web.miglife.app/feed, or ?author=name for one writer's posts).
// 📰 Feed is the first tab (before Lobby) and where the site opens.
export default function FeedPage() {
  return (
    <PageShell light>
      <Suspense>
        <FeedAuthor />
      </Suspense>
      <StartupPopups />
    </PageShell>
  );
}

function FeedAuthor() {
  const author = (useSearchParams().get("author") || "").trim();
  return <FeedList author={author} />;
}
