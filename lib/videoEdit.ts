"use client";

// ✂️ The web video editor's file maker (miglife, design V1). The browser plays the
// chosen part once on a hidden canvas — colour filter and words drawn on every
// frame, sound kept or left out — and records it (MediaRecorder). It takes as long
// as the part itself, so the tab must stay open. Same look as the app's editor
// (app/VideoEditor.kt): the same filters, text size (7.5 % of the width) and place.

export type VideoEdit = {
  startSec: number;
  endSec: number;
  durationSec: number;
  mute: boolean;
  filter: string;
  text: string;
  /** 0 = left / top edge, 1 = right / bottom edge */
  textX: number;
  textY: number;
  textColor: string;
  videoW: number;
  videoH: number;
  /** 🎵 a song mixed in (plays from its start, repeats if the video is longer) */
  music?: Blob | null;
};

export const editChanged = (e: VideoEdit) =>
  e.startSec > 0.3 || e.endSec < e.durationSec - 0.3 || e.mute || e.filter !== "normal" || e.text.trim() !== "" || !!e.music;

// key, label, 3×3 colour matrix (row-major) — the same numbers as the app
const sat = (s: number) => {
  const lr = 0.2126, lg = 0.7152, lb = 0.0722;
  return [(1 - s) * lr + s, (1 - s) * lg, (1 - s) * lb, (1 - s) * lr, (1 - s) * lg + s, (1 - s) * lb, (1 - s) * lr, (1 - s) * lg, (1 - s) * lb + s];
};
export const VIDEO_FILTERS: { key: string; label: string; m: number[] }[] = [
  { key: "normal", label: "Normal", m: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  { key: "bw", label: "B&W", m: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114] },
  { key: "warm", label: "Warm", m: [1.12, 0.02, 0, 0, 1.03, 0, 0, 0, 0.84] },
  { key: "cool", label: "Cool", m: [0.88, 0, 0, 0, 1.0, 0.02, 0, 0.03, 1.14] },
  { key: "vintage", label: "Vintage", m: [0.393, 0.769, 0.189, 0.349, 0.686, 0.168, 0.272, 0.534, 0.131] },
  { key: "vivid", label: "Vivid", m: sat(1.45) },
];
export const filterMatrix = (key: string) => VIDEO_FILTERS.find((f) => f.key === key && key !== "normal")?.m || null;
/** the <feColorMatrix values="…"> of a filter */
export const feValues = (m: number[]) =>
  [m[0], m[1], m[2], 0, 0, m[3], m[4], m[5], 0, 0, m[6], m[7], m[8], 0, 0, 0, 0, 0, 1, 0].map((n) => +n.toFixed(4)).join(" ");

export const TEXT_SIZE = 0.075;

/** draws the words at the editor's place (left = (W − width) × x, top = (H − height) × y) */
export function drawVideoText(ctx: CanvasRenderingContext2D, e: VideoEdit, w: number, h: number) {
  const text = e.text.trim();
  if (!text) return;
  let size = w * TEXT_SIZE;
  const padX = w * 0.02;
  ctx.save();
  const font = (s: number) => `900 ${s}px system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans Bengali", sans-serif`;
  ctx.font = font(size);
  while (ctx.measureText(text).width > w - 2 * padX && size > w * 0.035) {
    size *= 0.92;
    ctx.font = font(size);
  }
  const tw = ctx.measureText(text).width + 2 * padX;
  const th = size * 1.25;
  const left = (w - tw) * e.textX + padX;
  const top = (h - th) * e.textY;
  ctx.fillStyle = e.textColor;
  ctx.shadowColor = "rgba(0,0,0,.7)";
  ctx.shadowBlur = w * 0.012;
  ctx.shadowOffsetY = w * 0.004;
  ctx.textBaseline = "middle";
  ctx.fillText(text, left, top + th / 2, w - 2 * padX);
  ctx.restore();
}

function pickMime(): string {
  const options = [
    "video/mp4;codecs=avc1.42E01F,mp4a.40.2",
    "video/mp4;codecs=avc1,mp4a",
    // (a plain "video/mp4" may hold VP9 — some phones can't play that; WebM then)
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  for (const t of options) if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  return "";
}

const once = (el: HTMLMediaElement, ev: string) => new Promise<void>((res) => el.addEventListener(ev, () => res(), { once: true }));

/** Makes the edited file. onProgress gets 0…100. */
export async function renderEditedVideo(file: File, e: VideoEdit, onProgress: (pct: number) => void): Promise<File> {
  const mime = pickMime();
  if (!mime || typeof HTMLCanvasElement.prototype.captureStream !== "function") {
    throw new Error("This browser can't edit videos. Please use Chrome, Edge or Firefox — or the app.");
  }
  const url = URL.createObjectURL(file);
  const v = document.createElement("video");
  v.src = url;
  v.playsInline = true;
  v.preload = "auto";
  v.crossOrigin = "anonymous";
  let ac: AudioContext | null = null;
  let song: HTMLAudioElement | null = null;
  let songUrl = "";
  try {
    await once(v, "loadedmetadata");
    const vw = v.videoWidth || e.videoW || 1280;
    const vh = v.videoHeight || e.videoH || 720;
    // short side 720 (or 480 for long parts), even numbers
    const secs = Math.max(1, e.endSec - e.startSec);
    const bits = Math.min(4_000_000, Math.max(500_000, Math.floor((45 * 1024 * 1024 * 8) / secs) - 128_000));
    const short = Math.min(bits >= 1_400_000 ? 720 : 480, Math.min(vw, vh));
    const scale = short / Math.min(vw, vh);
    const W = Math.floor((vw * scale) / 2) * 2;
    const H = Math.floor((vh * scale) / 2) * 2;
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { willReadFrequently: false })!;
    const m = filterMatrix(e.filter);
    // the colour filter: the canvas's own SVG filter when it can, else pixel by pixel
    let cssFilter = "";
    if (m && "filter" in ctx) {
      const id = `ve-render-${Date.now()}`;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("width", "0");
      svg.setAttribute("height", "0");
      svg.style.position = "absolute";
      svg.innerHTML = `<filter id="${id}" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="${feValues(m)}"/></filter>`;
      document.body.appendChild(svg);
      cssFilter = `url(#${id})`;
      (v as any)._svg = svg;
    }
    const stream = canvas.captureStream(30);
    if (!e.mute || e.music) {
      ac = new AudioContext();
      await ac.resume().catch(() => {});
      const dest = ac.createMediaStreamDestination();
      if (!e.mute) ac.createMediaElementSource(v).connect(dest);
      else v.muted = true;
      if (e.music) {
        // 🎵 the song, mixed in
        songUrl = URL.createObjectURL(e.music);
        song = new Audio(songUrl);
        song.loop = true;
        song.preload = "auto";
        await new Promise<void>((res) => {
          song!.addEventListener("canplay", () => res(), { once: true });
          song!.addEventListener("error", () => res(), { once: true });
          window.setTimeout(res, 5000);
        });
        ac.createMediaElementSource(song).connect(dest);
      }
      dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    } else {
      v.muted = true;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bits, audioBitsPerSecond: 128_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    const stopped = new Promise<void>((res) => (rec.onstop = () => res()));

    v.currentTime = e.startSec;
    await once(v, "seeked");
    const draw = () => {
      ctx.filter = cssFilter || "none";
      ctx.drawImage(v, 0, 0, W, H);
      ctx.filter = "none";
      if (m && !cssFilter) {
        const img = ctx.getImageData(0, 0, W, H);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          d[i] = m[0] * r + m[1] * g + m[2] * b;
          d[i + 1] = m[3] * r + m[4] * g + m[5] * b;
          d[i + 2] = m[6] * r + m[7] * g + m[8] * b;
        }
        ctx.putImageData(img, 0, 0);
      }
      drawVideoText(ctx, e, W, H);
    };
    draw();
    rec.start(500);
    await v.play();
    if (song) await song.play().catch(() => {});
    await new Promise<void>((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        v.pause();
        song?.pause();
        resolve();
      };
      const tick = () => {
        if (done) return;
        draw();
        onProgress(Math.min(99, Math.round(((v.currentTime - e.startSec) / secs) * 100)));
        if (v.currentTime >= e.endSec || v.ended) return finish();
        if ("requestVideoFrameCallback" in v) (v as any).requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };
      v.addEventListener("ended", finish, { once: true });
      tick();
      // in case frames stop coming (a hidden tab): check the clock too
      const guard = window.setInterval(() => {
        if (done) return window.clearInterval(guard);
        if (v.currentTime >= e.endSec || v.ended) {
          window.clearInterval(guard);
          finish();
        }
      }, 250);
    });
    rec.stop();
    await stopped;
    stream.getTracks().forEach((t) => t.stop());
    onProgress(100);
    const type = mime.split(";")[0];
    const blob = new Blob(chunks, { type });
    if (!blob.size) throw new Error("The video could not be made. Please try again.");
    return new File([blob], `video.${type === "video/mp4" ? "mp4" : "webm"}`, { type });
  } finally {
    (v as any)._svg?.remove();
    song?.pause();
    if (songUrl) URL.revokeObjectURL(songUrl);
    v.pause();
    v.removeAttribute("src");
    v.load();
    URL.revokeObjectURL(url);
    ac?.close().catch(() => {});
  }
}
