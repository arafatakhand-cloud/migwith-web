// A short toast at the bottom of the screen that stays while the page changes
// (like an Android Toast) — e.g. "This room is locked by an admin/mod." shown
// while the room sends you back to the rooms list, the same as the app.
export function flashToast(text: string, ms = 3500) {
  if (typeof document === "undefined") return;
  document.querySelectorAll("[data-flash-toast]").forEach((el) => el.remove());
  const el = document.createElement("div");
  el.setAttribute("data-flash-toast", "");
  el.textContent = text;
  el.style.cssText =
    "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 36px);transform:translateX(-50%);" +
    "z-index:9999;max-width:calc(100vw - 32px);padding:9px 16px;border-radius:14px;background:rgba(51,51,51,.92);" +
    "color:#fff;font-size:13.5px;line-height:1.35;text-align:center;box-shadow:0 6px 18px rgba(0,0,0,.25);" +
    "pointer-events:none;transition:opacity .3s";
  document.body.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    setTimeout(() => el.remove(), 300);
  }, ms);
}
