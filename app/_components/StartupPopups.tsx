"use client";

import { useState } from "react";
import { AnnouncementPopup } from "./AnnouncementPopup";
import { BirthdayPopup } from "./BirthdayPopup";
import { DailySpinPopup } from "./DailySpinPopup";
import { useSession } from "./AppSession";

// 🎉 the newest announcement once per visit, then 🎂 today's birthdays, then
// 🎡 the daily spin — on whichever page the site opens on (📰 Feed or Lobby).
export function StartupPopups() {
  const { user, username } = useSession();
  const [announcementDone, setAnnouncementDone] = useState(false);
  if (!user) return null;
  return (
    <>
      <AnnouncementPopup username={username} onDone={() => setAnnouncementDone(true)} />
      {announcementDone && <BirthdayPopup username={username} />}
      {announcementDone && <DailySpinPopup uid={user.uid} />}
    </>
  );
}
