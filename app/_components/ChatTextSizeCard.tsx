"use client";

import { CHAT_TEXT_MAX, CHAT_TEXT_MIN, chatPx, setChatTextSize, useChatTextSize } from "../../lib/chatTextSize";

// 🔠 Room text size, like the app's Settings → Chat: A− / A+ for small steps,
// quick picks, and a live preview line. Saved in this browser.
const PICKS: [number, string][] = [
  [12, "Small"],
  [14, "Normal"],
  [16, "Medium"],
  [18, "Large"],
  [20, "Extra large"],
];

export function ChatTextSizeCard() {
  const size = useChatTextSize();
  return (
    <div className="rounded-2xl bg-white p-3.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <span className="text-xl">🔠</span>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-[#0B1F3A]">Room text size</p>
          <p className="text-xs text-gray-500">Now: {size}</p>
        </div>
        {[-1, 1].map((step) => {
          const can = step < 0 ? size > CHAT_TEXT_MIN : size < CHAT_TEXT_MAX;
          return (
            <button
              key={step}
              type="button"
              disabled={!can}
              onClick={() => setChatTextSize(size + step)}
              className={`flex h-[34px] w-[34px] items-center justify-center rounded-full font-extrabold ${
                can ? "bg-[#174EA6]/10 text-[#174EA6]" : "bg-gray-100 text-gray-400"
              } ${step < 0 ? "text-xs" : "text-[15px]"}`}
            >
              {step < 0 ? "A−" : "A+"}
            </button>
          );
        })}
      </div>
      <div className="no-scrollbar mt-2.5 flex gap-1.5 overflow-x-auto">
        {PICKS.map(([v, label]) => (
          <button
            key={v}
            type="button"
            onClick={() => setChatTextSize(v)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
              size === v ? "bg-[#174EA6] text-white" : "bg-gray-100 text-[#0B1F3A]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2.5 rounded-[10px] bg-[#174EA6]/5 px-2.5 py-2 text-[#0B1F3A]" style={{ fontSize: chatPx(size), lineHeight: `${chatPx(size) + 5}px` }}>
        <span className="font-bold text-[#D2691E]">miglife</span>: Hello everyone! 👋
      </p>
    </div>
  );
}
