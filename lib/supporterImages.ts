"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

// 📷 Supporters Badge team pictures miglife uploaded
// (app_settings/shop_overrides.supporter.images.{team}). One listener for the
// whole page, shared by every badge; a team without a picture keeps its crest.

type Images = Record<string, string>;

let current: Images = {};
const subscribers = new Set<(m: Images) => void>();
let started = false;

function publish(next: Images) {
  current = next;
  subscribers.forEach((fn) => fn(next));
}

function parse(raw: unknown): Images {
  const imgs = raw && typeof raw === "object" ? (raw as { images?: unknown }).images : null;
  const out: Images = {};
  if (imgs && typeof imgs === "object") {
    for (const [team, url] of Object.entries(imgs as Record<string, unknown>)) {
      if (typeof url === "string" && url.startsWith("https://")) out[team] = url;
    }
  }
  return out;
}

function start() {
  if (started) return;
  started = true;
  let stop: (() => void) | null = null;
  onAuthStateChanged(auth, (user) => {
    stop?.();
    stop = null;
    if (!user) return publish({});
    stop = onSnapshot(
      doc(db, "app_settings", "shop_overrides"),
      (snap) => publish(parse(snap.get("supporter"))),
      () => {}
    );
  });
}

/** team id → picture link (only teams that have one). */
export function useSupporterImages(): Images {
  const [images, setImages] = useState<Images>(current);
  useEffect(() => {
    start();
    subscribers.add(setImages);
    setImages(current);
    return () => {
      subscribers.delete(setImages);
    };
  }, []);
  return images;
}
