"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// ✏️ Photo editor (miglife: "edit the picture before sharing it in a room"):
// ✂️ crop (free / original / 1:1 / 4:5 / 16:9), ⟳ turn, ⇋ mirror, 🎨 filters,
// ☀️ brightness / contrast / colour, ✏️ draw, 🅣 text. Nothing is uploaded
// until Send; the result is one JPEG (at most 2048 px). An untouched photo is
// sent as it was picked.

const MAX_SIDE = 2048;
type Rect = { x: number; y: number; w: number; h: number }; // 0…1 of the turned photo
type Pt = { x: number; y: number };
type Stroke = { id: number; color: string; width: number; pts: Pt[] }; // width: share of the short side
type TextItem = { id: number; text: string; color: string; x: number; y: number; size: number; bg: boolean };
type Tool = "crop" | "filter" | "adjust" | "draw" | "text";
type M = number[]; // 3 × 4 colour matrix, rows r, g, b: [r, g, b, +]

const COLORS = ["#FFFFFF", "#111111", "#E53935", "#FF9800", "#FFEB3B", "#43A047", "#1E88E5", "#8E24AA", "#EC407A"];
const BRUSH = [0.008, 0.016, 0.03];
const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };

// ---------- colour maths ----------
const I: M = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];
const mul = (a: M, b: M): M => {
  // a after b
  const o: M = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      let v = 0;
      for (let k = 0; k < 3; k++) v += a[r * 4 + k] * b[k * 4 + c];
      if (c === 3) v += a[r * 4 + 3];
      o.push(v);
    }
  }
  return o;
};
const bright = (b: number): M => [b, 0, 0, 0, 0, b, 0, 0, 0, 0, b, 0];
const contrast = (c: number): M => [c, 0, 0, 128 * (1 - c), 0, c, 0, 128 * (1 - c), 0, 0, c, 128 * (1 - c)];
const saturate = (s: number): M => {
  const r = 0.2126 * (1 - s), g = 0.7152 * (1 - s), b = 0.0722 * (1 - s);
  return [r + s, g, b, 0, r, g + s, b, 0, r, g, b + s, 0];
};
const sepia = (k: number): M => {
  const s: M = [0.393, 0.769, 0.189, 0, 0.349, 0.686, 0.168, 0, 0.272, 0.534, 0.131, 0];
  return s.map((v, i) => v * k + I[i] * (1 - k));
};
const tint = (r: number, g: number, b: number): M => [r, 0, 0, 0, 0, g, 0, 0, 0, 0, b, 0];
const chain = (...ms: M[]) => ms.reduce((acc, m) => mul(m, acc), I);

const FILTERS: { key: string; label: string; m: M }[] = [
  { key: "none", label: "Original", m: I },
  { key: "bright", label: "Bright", m: chain(bright(1.12), contrast(1.06)) },
  { key: "vivid", label: "Vivid", m: chain(saturate(1.45), contrast(1.1)) },
  { key: "warm", label: "Warm", m: chain(tint(1.1, 1.02, 0.88), saturate(1.1)) },
  { key: "cool", label: "Cool", m: chain(tint(0.92, 1.0, 1.12)) },
  { key: "bw", label: "B & W", m: chain(saturate(0), contrast(1.15)) },
  { key: "vintage", label: "Vintage", m: chain(sepia(0.65), contrast(0.92), bright(1.05)) },
  { key: "fade", label: "Fade", m: chain(contrast(0.8), saturate(0.8), bright(1.06)) },
];

function applyMatrix(g: CanvasRenderingContext2D, w: number, h: number, m: M) {
  if (m.every((v, i) => Math.abs(v - I[i]) < 1e-4)) return;
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], gg = d[i + 1], b = d[i + 2];
    d[i] = m[0] * r + m[1] * gg + m[2] * b + m[3];
    d[i + 1] = m[4] * r + m[5] * gg + m[6] * b + m[7];
    d[i + 2] = m[8] * r + m[9] * gg + m[10] * b + m[11];
  }
  g.putImageData(img, 0, 0);
}

// ---------- the photo, upright and turned ----------
async function loadUpright(file: File): Promise<HTMLCanvasElement> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const s = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(bmp.width * s));
  c.height = Math.max(1, Math.round(bmp.height * s));
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return c;
}

function orient(src: HTMLCanvasElement, quarter: number, flip: boolean): HTMLCanvasElement {
  if (quarter === 0 && !flip) return src;
  const c = document.createElement("canvas");
  const turned = quarter % 2 === 1;
  c.width = turned ? src.height : src.width;
  c.height = turned ? src.width : src.height;
  const g = c.getContext("2d")!;
  g.translate(c.width / 2, c.height / 2);
  if (flip) g.scale(-1, 1);
  g.rotate((quarter * Math.PI) / 2);
  g.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

// turning / mirroring moves the crop, drawings and words with the photo
const turnPt = (p: Pt): Pt => ({ x: 1 - p.y, y: p.x });
const turnRect = (r: Rect): Rect => ({ x: 1 - (r.y + r.h), y: r.x, w: r.h, h: r.w });
const flipPt = (p: Pt): Pt => ({ x: 1 - p.x, y: p.y });
const flipRect = (r: Rect): Rect => ({ ...r, x: 1 - (r.x + r.w) });

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function PhotoEditor({
  file,
  onCancel,
  onSend,
  sendLabel = "Send",
}: {
  file: File;
  onCancel: () => void;
  onSend: (edited: File) => void;
  sendLabel?: string;
}) {
  const [base, setBase] = useState<HTMLCanvasElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [quarter, setQuarter] = useState(0);
  const [flip, setFlip] = useState(false);
  const [crop, setCrop] = useState<Rect>(FULL);
  const [aspect, setAspect] = useState<string>("free");
  const [filter, setFilter] = useState("none");
  const [adj, setAdj] = useState({ b: 0, c: 0, s: 0 }); // −50 … 50
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [texts, setTexts] = useState<TextItem[]>([]);
  const [undo, setUndo] = useState<{ kind: "stroke" | "text"; id: number; prev?: TextItem }[]>([]);
  const [tool, setTool] = useState<Tool | null>(null);
  const [color, setColor] = useState(COLORS[2]);
  const [brush, setBrush] = useState(1);
  const [editing, setEditing] = useState<TextItem | null>(null);
  const [box, setBox] = useState({ w: 1, h: 1 });
  const [saving, setSaving] = useState(false);
  const areaRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nextId = useRef(1);
  const drag = useRef<
    | { kind: "draw"; id: number }
    | { kind: "text"; id: number; dx: number; dy: number; moved: boolean; start: Pt }
    | { kind: "crop"; handle: "move" | "tl" | "tr" | "bl" | "br"; start: Pt; rect: Rect }
    | null
  >(null);
  const textBoxes = useRef<{ id: number; x: number; y: number; w: number; h: number }[]>([]);

  useEffect(() => {
    let alive = true;
    loadUpright(file)
      .then((c) => alive && setBase(c))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [file]);

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const oriented = useMemo(() => (base ? orient(base, quarter, flip) : null), [base, quarter, flip]);
  const matrix = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)?.m || I;
    return chain(f, bright(1 + adj.b / 100), contrast(1 + adj.c / 100), saturate(1 + adj.s / 50));
  }, [filter, adj]);
  const cropping = tool === "crop";
  const view: Rect = cropping ? FULL : crop; // what the canvas shows

  // size of the shown picture, fitted in the middle area
  const shown = useMemo(() => {
    if (!oriented) return { w: 1, h: 1 };
    const pw = view.w * oriented.width, ph = view.h * oriented.height;
    const pad = cropping ? 28 : 8;
    const s = Math.min((box.w - pad * 2) / pw, (box.h - pad * 2) / ph);
    return { w: Math.max(1, Math.floor(pw * s)), h: Math.max(1, Math.floor(ph * s)) };
  }, [oriented, view, box, cropping]);

  /** Draws the edited photo (the part `area` of it) at outW × outH. */
  const paint = useCallback(
    (g: CanvasRenderingContext2D, area: Rect, outW: number, outH: number, boxes?: typeof textBoxes.current, scaleCss = 1) => {
      if (!oriented) return;
      const O = oriented;
      const sx = area.x * O.width, sy = area.y * O.height, sw = area.w * O.width, sh = area.h * O.height;
      g.clearRect(0, 0, outW, outH);
      g.drawImage(O, sx, sy, sw, sh, 0, 0, outW, outH);
      applyMatrix(g, outW, outH, matrix);
      const k = outW / sw; // output px per photo px
      const short = Math.min(O.width, O.height) * k;
      const map = (p: Pt) => ({ x: (p.x * O.width - sx) * k, y: (p.y * O.height - sy) * k });
      g.lineCap = "round";
      g.lineJoin = "round";
      for (const s of strokes) {
        if (!s.pts.length) continue;
        g.strokeStyle = s.color;
        g.lineWidth = s.width * short;
        g.beginPath();
        const p0 = map(s.pts[0]);
        g.moveTo(p0.x, p0.y);
        if (s.pts.length === 1) g.lineTo(p0.x + 0.01, p0.y);
        for (let i = 1; i < s.pts.length; i++) {
          const p = map(s.pts[i]);
          g.lineTo(p.x, p.y);
        }
        g.stroke();
      }
      if (boxes) boxes.length = 0;
      for (const t of texts) {
        if (editing?.id === t.id) continue;
        const fs = t.size * short;
        g.font = `800 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        const lines = t.text.split("\n");
        const w = Math.max(...lines.map((l) => g.measureText(l).width)) + fs * 0.7;
        const h = lines.length * fs * 1.2 + fs * 0.35;
        const c = map(t);
        if (t.bg) {
          g.fillStyle = t.color === "#FFFFFF" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.92)";
          const r = fs * 0.35;
          g.beginPath();
          g.roundRect?.(c.x - w / 2, c.y - h / 2, w, h, r);
          if (!g.roundRect) g.rect(c.x - w / 2, c.y - h / 2, w, h);
          g.fill();
        } else {
          g.shadowColor = "rgba(0,0,0,.55)";
          g.shadowBlur = fs * 0.12;
        }
        g.fillStyle = t.color;
        lines.forEach((l, i) => g.fillText(l, c.x, c.y + (i - (lines.length - 1) / 2) * fs * 1.2));
        g.shadowBlur = 0;
        g.shadowColor = "transparent";
        boxes?.push({ id: t.id, x: (c.x - w / 2) / scaleCss, y: (c.y - h / 2) / scaleCss, w: w / scaleCss, h: h / scaleCss });
      }
    },
    [oriented, matrix, strokes, texts, editing]
  );

  // preview
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv || !oriented) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(shown.w * dpr);
    cv.height = Math.round(shown.h * dpr);
    const g = cv.getContext("2d", { willReadFrequently: true })!;
    paint(g, view, cv.width, cv.height, textBoxes.current, dpr);
    if (cropping) {
      // dim outside the crop, frame, thirds, corner handles
      const W = cv.width, H = cv.height;
      const r = { x: crop.x * W, y: crop.y * H, w: crop.w * W, h: crop.h * H };
      g.fillStyle = "rgba(0,0,0,.55)";
      g.fillRect(0, 0, W, r.y);
      g.fillRect(0, r.y + r.h, W, H - r.y - r.h);
      g.fillRect(0, r.y, r.x, r.h);
      g.fillRect(r.x + r.w, r.y, W - r.x - r.w, r.h);
      g.strokeStyle = "rgba(255,255,255,.95)";
      g.lineWidth = 2 * dpr;
      g.strokeRect(r.x, r.y, r.w, r.h);
      g.strokeStyle = "rgba(255,255,255,.45)";
      g.lineWidth = 1 * dpr;
      g.beginPath();
      for (const f of [1 / 3, 2 / 3]) {
        g.moveTo(r.x + r.w * f, r.y);
        g.lineTo(r.x + r.w * f, r.y + r.h);
        g.moveTo(r.x, r.y + r.h * f);
        g.lineTo(r.x + r.w, r.y + r.h * f);
      }
      g.stroke();
      g.strokeStyle = "#fff";
      g.lineWidth = 4 * dpr;
      const L = 18 * dpr;
      for (const [cx, cy, dx, dy] of [
        [r.x, r.y, 1, 1],
        [r.x + r.w, r.y, -1, 1],
        [r.x, r.y + r.h, 1, -1],
        [r.x + r.w, r.y + r.h, -1, -1],
      ]) {
        g.beginPath();
        g.moveTo(cx, cy + dy * L);
        g.lineTo(cx, cy);
        g.lineTo(cx + dx * L, cy);
        g.stroke();
      }
    }
  }, [oriented, shown, view, paint, cropping, crop]);

  // filter thumbnails
  const thumbs = useMemo(() => {
    if (!oriented || tool !== "filter") return {} as Record<string, string>;
    const c = document.createElement("canvas");
    const pw = crop.w * oriented.width, ph = crop.h * oriented.height;
    const s = 120 / Math.max(pw, ph);
    c.width = Math.max(1, Math.round(pw * s));
    c.height = Math.max(1, Math.round(ph * s));
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const out: Record<string, string> = {};
    for (const f of FILTERS) {
      g.drawImage(oriented, crop.x * oriented.width, crop.y * oriented.height, pw, ph, 0, 0, c.width, c.height);
      applyMatrix(g, c.width, c.height, f.m);
      out[f.key] = c.toDataURL("image/jpeg", 0.8);
    }
    return out;
  }, [oriented, crop, tool]);

  const edited =
    quarter !== 0 || flip || filter !== "none" || adj.b || adj.c || adj.s || strokes.length || texts.length ||
    crop.x > 0.001 || crop.y > 0.001 || crop.w < 0.999 || crop.h < 0.999;

  // ---------- turning / aspect ----------
  const turn = () => {
    // the picture is mirror(turn(photo)): a clockwise turn of a mirrored one is
    // the mirror of the photo turned the other way
    setQuarter((q) => (flip ? q + 3 : q + 1) % 4);
    setCrop((r) => turnRect(r));
    setStrokes((ss) => ss.map((s) => ({ ...s, pts: s.pts.map(turnPt) })));
    setTexts((ts) => ts.map((t) => ({ ...t, ...turnPt(t) })));
    if (aspect !== "free") setAspect("free");
  };
  const mirror = () => {
    setFlip((f) => !f);
    setCrop((r) => flipRect(r));
    setStrokes((ss) => ss.map((s) => ({ ...s, pts: s.pts.map(flipPt) })));
    setTexts((ts) => ts.map((t) => ({ ...t, ...flipPt(t) })));
  };
  const ratioOf = (key: string): number | null => {
    if (!oriented) return null;
    if (key === "orig") return oriented.width / oriented.height;
    const m = key.match(/^(\d+):(\d+)$/);
    return m ? Number(m[1]) / Number(m[2]) : null;
  };
  const pickAspect = (key: string) => {
    setAspect(key);
    const a = ratioOf(key);
    if (!a || !oriented) return;
    // biggest centred box of that shape (a = width / height in pixels)
    const imgA = oriented.width / oriented.height;
    let w = 1, h = 1;
    if (a > imgA) h = imgA / a;
    else w = a / imgA;
    setCrop({ x: (1 - w) / 2, y: (1 - h) / 2, w, h });
  };

  // ---------- pointer ----------
  const at = (e: React.PointerEvent): Pt => {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const toPhoto = (p: Pt): Pt => ({ x: view.x + p.x * view.w, y: view.y + p.y * view.h });

  const down = (e: React.PointerEvent) => {
    if (!oriented || editing) return;
    const p = at(e);
    if (cropping) {
      const tol = 26 / shown.w, tolY = 26 / shown.h;
      const near = (x: number, y: number) => Math.abs(p.x - x) < tol && Math.abs(p.y - y) < tolY;
      const r = crop;
      const handle = near(r.x, r.y) ? "tl" : near(r.x + r.w, r.y) ? "tr" : near(r.x, r.y + r.h) ? "bl" : near(r.x + r.w, r.y + r.h) ? "br"
        : p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h ? "move" : null;
      if (!handle) return;
      (e.target as Element).setPointerCapture(e.pointerId);
      drag.current = { kind: "crop", handle, start: p, rect: r };
      return;
    }
    if (tool === "draw") {
      (e.target as Element).setPointerCapture(e.pointerId);
      const id = nextId.current++;
      setStrokes((ss) => [...ss, { id, color, width: BRUSH[brush], pts: [toPhoto(p)] }]);
      setUndo((u) => [...u, { kind: "stroke", id }]);
      drag.current = { kind: "draw", id };
      return;
    }
    if (tool === "text" || tool === null) {
      const cx = p.x * shown.w, cy = p.y * shown.h;
      const hit = [...textBoxes.current].reverse().find((b) => cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h);
      if (hit) {
        const t = texts.find((x) => x.id === hit.id)!;
        const tp = toPhoto(p);
        (e.target as Element).setPointerCapture(e.pointerId);
        drag.current = { kind: "text", id: t.id, dx: t.x - tp.x, dy: t.y - tp.y, moved: false, start: p };
        return;
      }
      if (tool === "text") {
        const tp = toPhoto(p);
        setEditing({ id: nextId.current++, text: "", color, x: tp.x, y: tp.y, size: 0.07, bg: false });
      }
    }
  };
  const move = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !oriented) return;
    const p = at(e);
    if (d.kind === "draw") {
      const tp = toPhoto(p);
      setStrokes((ss) => ss.map((s) => (s.id === d.id ? { ...s, pts: [...s.pts, tp] } : s)));
    } else if (d.kind === "text") {
      if (Math.hypot((p.x - d.start.x) * shown.w, (p.y - d.start.y) * shown.h) > 6) d.moved = true;
      const tp = toPhoto(p);
      setTexts((ts) => ts.map((t) => (t.id === d.id ? { ...t, x: clamp(tp.x + d.dx, 0, 1), y: clamp(tp.y + d.dy, 0, 1) } : t)));
    } else if (d.kind === "crop") {
      const dx = p.x - d.start.x, dy = p.y - d.start.y;
      const r0 = d.rect;
      const MIN = 0.08;
      if (d.handle === "move") {
        setCrop({ ...r0, x: clamp(r0.x + dx, 0, 1 - r0.w), y: clamp(r0.y + dy, 0, 1 - r0.h) });
        return;
      }
      const left = d.handle === "tl" || d.handle === "bl";
      const top = d.handle === "tl" || d.handle === "tr";
      // the opposite corner stays put
      const ax = left ? r0.x + r0.w : r0.x;
      const ay = top ? r0.y + r0.h : r0.y;
      let w = clamp(left ? ax - (r0.x + dx) : r0.x + r0.w + dx - ax, MIN, left ? ax : 1 - ax);
      let h = clamp(top ? ay - (r0.y + dy) : r0.y + r0.h + dy - ay, MIN, top ? ay : 1 - ay);
      const a = ratioOf(aspect);
      if (a) {
        const k = oriented.width / oriented.height; // h (share) = w (share) · k / a
        const maxW = left ? ax : 1 - ax, maxH = top ? ay : 1 - ay;
        h = (w * k) / a;
        if (h > maxH) {
          h = maxH;
          w = (h * a) / k;
        }
        if (w > maxW) {
          w = maxW;
          h = (w * k) / a;
        }
      }
      setCrop({ x: left ? ax - w : ax, y: top ? ay - h : ay, w, h });
    }
  };
  const up = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === "text" && !d.moved) {
      // a tap on a word opens it again
      const t = texts.find((x) => x.id === d.id);
      if (t) setEditing({ ...t });
    }
  };

  // ---------- text ----------
  const finishText = () => {
    const t = editing;
    setEditing(null);
    if (!t) return;
    const clean = t.text.trim();
    const had = texts.find((x) => x.id === t.id);
    if (!clean) {
      if (had) setTexts((ts) => ts.filter((x) => x.id !== t.id));
      return;
    }
    const next = { ...t, text: clean };
    if (had) {
      setTexts((ts) => ts.map((x) => (x.id === t.id ? next : x)));
      setUndo((u) => [...u, { kind: "text", id: t.id, prev: had }]);
    } else {
      setTexts((ts) => [...ts, next]);
      setUndo((u) => [...u, { kind: "text", id: t.id }]);
    }
  };
  const undoLast = () => {
    const last = undo[undo.length - 1];
    if (!last) return;
    setUndo((u) => u.slice(0, -1));
    if (last.kind === "stroke") setStrokes((ss) => ss.filter((s) => s.id !== last.id));
    else if (last.prev) setTexts((ts) => ts.map((t) => (t.id === last.id ? last.prev! : t)));
    else setTexts((ts) => ts.filter((t) => t.id !== last.id));
  };

  // ---------- send ----------
  const send = async () => {
    if (saving) return;
    if (!oriented || !edited) return onSend(file);
    setSaving(true);
    try {
      const pw = crop.w * oriented.width, ph = crop.h * oriented.height;
      const s = Math.min(1, MAX_SIDE / Math.max(pw, ph));
      const c = document.createElement("canvas");
      c.width = Math.max(1, Math.round(pw * s));
      c.height = Math.max(1, Math.round(ph * s));
      const g = c.getContext("2d", { willReadFrequently: true })!;
      g.fillStyle = "#fff";
      g.fillRect(0, 0, c.width, c.height);
      paint(g, crop, c.width, c.height);
      const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.9));
      if (!blob) throw new Error("no blob");
      onSend(new File([blob], "photo.jpg", { type: "image/jpeg" }));
    } catch {
      onSend(file);
    } finally {
      setSaving(false);
    }
  };

  const toolBtn = (key: Tool, icon: string, label: string) => (
    <button
      key={key}
      type="button"
      onClick={() => {
        if (editing) finishText();
        setTool((t) => (t === key ? null : key));
      }}
      className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl py-1.5 text-[11px] font-bold ${
        tool === key ? "bg-white/15 text-white" : "text-white/75"
      }`}
    >
      <span className="text-[19px] leading-none">{icon}</span>
      {label}
    </button>
  );
  const swatches = (value: string, set: (c: string) => void) => (
    <div className="flex items-center justify-center gap-2">
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={`Colour ${c}`}
          onClick={() => set(c)}
          className={`h-7 w-7 shrink-0 rounded-full border-2 ${value === c ? "scale-110 border-white" : "border-white/30"}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
  const slider = (label: string, key: "b" | "c" | "s") => (
    <label className="flex items-center gap-3 text-[12px] font-bold text-white/85">
      <span className="w-[74px] shrink-0">{label}</span>
      <input
        type="range"
        min={-50}
        max={50}
        value={adj[key]}
        onChange={(e) => setAdj((a) => ({ ...a, [key]: Number(e.target.value) }))}
        className="min-w-0 flex-1 accent-[#5B8DEF]"
      />
      <span className="w-8 shrink-0 text-right tabular-nums">{adj[key] > 0 ? `+${adj[key]}` : adj[key]}</span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-[#0B0F1A] text-white">
      {/* top bar */}
      <div className="flex shrink-0 items-center gap-2 px-3 pb-2 pt-[calc(env(safe-area-inset-top)+10px)]">
        <button type="button" onClick={onCancel} aria-label="Cancel" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[18px]">
          ✕
        </button>
        <p className="min-w-0 flex-1 truncate text-center text-[15px] font-extrabold">✏️ Edit photo</p>
        <button
          type="button"
          onClick={undoLast}
          disabled={!undo.length}
          aria-label="Undo"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-[18px] disabled:opacity-30"
        >
          ↶
        </button>
      </div>

      {/* the photo */}
      <div ref={areaRef} className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {failed ? (
          <p className="px-6 text-center text-sm text-white/70">This photo can&apos;t be edited here — you can still send it as it is.</p>
        ) : !oriented ? (
          <p className="text-sm text-white/60">Loading…</p>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerCancel={up}
            style={{ width: shown.w, height: shown.h, touchAction: "none" }}
            className={`block rounded-sm ${tool === "draw" ? "cursor-crosshair" : tool === "text" ? "cursor-text" : ""}`}
          />
        )}
        {/* typing a word */}
        {editing && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/55 px-5" onClick={finishText}>
            <textarea
              autoFocus
              value={editing.text}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditing({ ...editing, text: e.target.value.slice(0, 120) })}
              placeholder="Type here…"
              rows={2}
              className="w-full max-w-md resize-none bg-transparent text-center text-[28px] font-extrabold outline-none placeholder:text-white/40"
              style={{ color: editing.color, textShadow: editing.bg ? "none" : "0 1px 6px rgba(0,0,0,.6)" }}
            />
            <div className="flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
              {swatches(editing.color, (c) => (setColor(c), setEditing({ ...editing, color: c })))}
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setEditing({ ...editing, size: Math.max(0.035, editing.size - 0.012) })} className="h-9 rounded-full bg-white/15 px-3 text-[13px] font-bold">
                  A−
                </button>
                <button type="button" onClick={() => setEditing({ ...editing, size: Math.min(0.16, editing.size + 0.012) })} className="h-9 rounded-full bg-white/15 px-3 text-[15px] font-bold">
                  A+
                </button>
                <button
                  type="button"
                  onClick={() => setEditing({ ...editing, bg: !editing.bg })}
                  className={`h-9 rounded-full px-3 text-[13px] font-bold ${editing.bg ? "bg-white text-[#111]" : "bg-white/15"}`}
                >
                  ▣ Box
                </button>
                {texts.some((t) => t.id === editing.id) && (
                  <button type="button" onClick={() => setEditing({ ...editing, text: "" })} className="h-9 rounded-full bg-[#E53935] px-3 text-[13px] font-bold">
                    🗑 Delete
                  </button>
                )}
                <button type="button" onClick={finishText} className="h-9 rounded-full bg-[#2F80ED] px-4 text-[13px] font-extrabold">
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* tool options */}
      <div className="shrink-0 px-3">
        {tool === "crop" && (
          <div className="space-y-2.5 pb-2">
            <div className="flex items-center justify-center gap-1.5 overflow-x-auto">
              {[
                ["free", "Free"],
                ["orig", "Original"],
                ["1:1", "1:1"],
                ["4:5", "4:5"],
                ["16:9", "16:9"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => pickAspect(k)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-bold ${aspect === k ? "bg-white text-[#111]" : "bg-white/12 text-white/85"}`}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-2">
              <button type="button" onClick={turn} className="rounded-full bg-white/12 px-4 py-1.5 text-[13px] font-bold">
                ⟳ Turn
              </button>
              <button type="button" onClick={mirror} className="rounded-full bg-white/12 px-4 py-1.5 text-[13px] font-bold">
                ⇋ Mirror
              </button>
              <button type="button" onClick={() => (setAspect("free"), setCrop(FULL))} className="rounded-full bg-white/12 px-4 py-1.5 text-[13px] font-bold">
                ↺ Reset
              </button>
            </div>
          </div>
        )}
        {tool === "filter" && (
          <div className="flex gap-2 overflow-x-auto pb-2">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" onClick={() => setFilter(f.key)} className="flex w-[64px] shrink-0 flex-col items-center gap-1">
                <span className={`block h-[64px] w-[64px] overflow-hidden rounded-xl border-2 ${filter === f.key ? "border-[#5B8DEF]" : "border-transparent"}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {thumbs[f.key] && <img src={thumbs[f.key]} alt="" className="h-full w-full object-cover" />}
                </span>
                <span className={`text-[11px] font-bold ${filter === f.key ? "text-white" : "text-white/65"}`}>{f.label}</span>
              </button>
            ))}
          </div>
        )}
        {tool === "adjust" && (
          <div className="mx-auto max-w-md space-y-1.5 pb-2">
            {slider("☀️ Light", "b")}
            {slider("◐ Contrast", "c")}
            {slider("🎨 Colour", "s")}
          </div>
        )}
        {tool === "draw" && (
          <div className="space-y-2 pb-2">
            {swatches(color, setColor)}
            <div className="flex items-center justify-center gap-3">
              {BRUSH.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Brush ${i + 1}`}
                  onClick={() => setBrush(i)}
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${brush === i ? "bg-white/20" : ""}`}
                >
                  <span className="block rounded-full" style={{ width: 6 + i * 6, height: 6 + i * 6, background: color }} />
                </button>
              ))}
            </div>
          </div>
        )}
        {tool === "text" && !editing && <p className="pb-2 text-center text-[12px] text-white/70">Tap the photo to write · drag words to move · tap a word to change it</p>}
      </div>

      {/* tools + send */}
      <div className="flex shrink-0 items-center gap-2 border-t border-white/10 px-2 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2">
        <div className="flex min-w-0 flex-1">
          {toolBtn("crop", "✂️", "Crop")}
          {toolBtn("filter", "🎨", "Filters")}
          {toolBtn("adjust", "☀️", "Adjust")}
          {toolBtn("draw", "✏️", "Draw")}
          {toolBtn("text", "🅣", "Text")}
        </div>
        <button
          type="button"
          onClick={send}
          disabled={!oriented && !failed}
          className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#8B5CF6] px-4 text-[14px] font-extrabold disabled:opacity-50"
        >
          {saving ? "…" : `${sendLabel} ➤`}
        </button>
      </div>
    </div>
  );
}
