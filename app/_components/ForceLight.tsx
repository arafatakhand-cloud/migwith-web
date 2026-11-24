"use client";

import { useForceLight } from "../../lib/theme";

// ☀️ miglife 2026-11-24: "feed light + dark mode same থাকবে light mode এর মতো"
export default function ForceLight() {
  useForceLight();
  return null;
}
