"use client";

import { useParams } from "next/navigation";
import { MigView } from "../../_components/MigView";

// 📰 One Mig on its own page (a shared link, an alert). In the Feed the same
// view opens in a bottom sheet instead.
export default function BlogPostPage() {
  const { id } = useParams<{ id: string }>();
  return <MigView id={String(id || "")} />;
}
