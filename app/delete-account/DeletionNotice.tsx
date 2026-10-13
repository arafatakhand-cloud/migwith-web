"use client";

import { useEffect, useState } from "react";

// Shown right after "Delete my account" (…/delete-account?scheduled=<ms>).
export function DeletionNotice() {
  const [at, setAt] = useState(0);
  useEffect(() => {
    setAt(Number(new URLSearchParams(window.location.search).get("scheduled")) || 0);
  }, []);
  if (!at) return null;
  return (
    <div className="rounded-2xl border border-[#F5C2C0] bg-[#FFF1F0] p-4 text-[14px] text-[#8A1C1C]">
      <b>Your account will be deleted on {new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}.</b>
      <br />
      You have been logged out. Log in again before then to cancel the deletion.
    </div>
  );
}
