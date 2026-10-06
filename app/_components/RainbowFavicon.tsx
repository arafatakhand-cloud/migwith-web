"use client";

import { useEffect } from "react";

// 🌈 The tab icon: "miGlife" on the sky-blue square with rainbow letters whose
// colours keep moving. Drawn on a small canvas and swapped into the page's
// icon links a few times a second (only while the tab is open on screen —
// browsers pause it in the background, so the PNG icon shows then).

const COLORS = ["#FF3B3B", "#FF9500", "#FFE600", "#34D359", "#00C8FF", "#5A6EFF", "#C850FF"];

export function RainbowFavicon() {
  useEffect(() => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const links = () => {
      let list = Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
      if (list.length === 0) {
        const l = document.createElement("link");
        l.rel = "icon";
        document.head.appendChild(l);
        list = [l];
      }
      return list;
    };

    // Fit the word into the square once.
    let font = 22;
    ctx.font = `bold ${font}px Arial, Helvetica, sans-serif`;
    while (ctx.measureText("miGlife").width > size * 0.92 && font > 8) {
      font -= 1;
      ctx.font = `bold ${font}px Arial, Helvetica, sans-serif`;
    }

    let shift = 0;
    const draw = () => {
      if (document.visibilityState !== "visible") return;
      // sky-blue square, same look as the PNG icon
      const bg = ctx.createRadialGradient(size * 0.3, size * 0.2, 0, size * 0.3, size * 0.2, size * 1.15);
      bg.addColorStop(0, "#BAE6FD");
      bg.addColorStop(0.45, "#38BDF8");
      bg.addColorStop(1, "#0284C7");
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.roundRect?.(0, 0, size, size, 12);
      if (!ctx.roundRect) ctx.rect(0, 0, size, size);
      ctx.fill();

      // rainbow that slides across the letters
      const w = ctx.measureText("miGlife").width;
      const x0 = (size - w) / 2;
      const rb = ctx.createLinearGradient(x0 - w + shift * w, 0, x0 + w + shift * w, 0);
      const stops = [...COLORS, ...COLORS];
      stops.forEach((c, i) => rb.addColorStop(i / (stops.length - 1), c));
      ctx.textBaseline = "middle";
      ctx.lineJoin = "round";
      // soft dark edge + white rim so the colours read on the light sky blue
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0,40,80,.45)";
      ctx.strokeText("miGlife", x0, size / 2 + 1);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = "#FFFFFF";
      ctx.strokeText("miGlife", x0, size / 2 + 1);
      ctx.fillStyle = rb;
      ctx.fillText("miGlife", x0, size / 2 + 1);

      const url = canvas.toDataURL("image/png");
      for (const l of links()) {
        l.href = url;
        l.removeAttribute("sizes");
        l.type = "image/png";
      }
      shift = (shift + 0.08) % 1;
    };

    draw();
    const t = setInterval(draw, 150);
    return () => clearInterval(t);
  }, []);
  return null;
}
