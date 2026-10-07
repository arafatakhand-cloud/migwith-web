import { useEffect, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";

// 🎆 Cricket win fireworks ON/OFF per room (the app's CricketWinFx): set by
// miglife in miglife secret → Cricket Win Effect (app_settings/win_fx.cricketRooms,
// lowercase room names). The Cricket fireworks play ONLY in the rooms listed
// there; LowCard / Ludo win fireworks are not affected.
export const winFxKey = (room: string) => room.trim().toLowerCase();

/** The rooms switched ON (lowercase); null while loading. */
export function useCricketWinFxRooms(): Set<string> | null {
  const [rooms, setRooms] = useState<Set<string> | null>(null);
  useEffect(
    () =>
      onSnapshot(
        doc(db, "app_settings", "win_fx"),
        (s) => {
          const list = s.get("cricketRooms");
          setRooms(new Set(Array.isArray(list) ? list.map((x) => winFxKey(String(x ?? ""))).filter(Boolean) : []));
        },
        () => setRooms(new Set())
      ),
    []
  );
  return rooms;
}
