// A small playing card face ("10♥", "A♠"), shared by the card games.
export function MiniCard({ card, size = "sm" }: { card: string; size?: "sm" | "md" }) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  const red = suit === "♥" || suit === "♦";
  const box = size === "md" ? "h-12 w-9 text-sm" : "h-9 w-7 text-[11px]";
  return (
    <span
      className={`inline-flex flex-col items-center justify-center rounded-md border border-black/10 bg-white font-black leading-none shadow ${box} ${
        red ? "text-red-600" : "text-neutral-900"
      }`}
    >
      <span>{rank}</span>
      <span className={size === "md" ? "text-xs" : "text-[10px]"}>{suit}</span>
    </span>
  );
}

// Face-down card.
export function CardBack({ size = "sm" }: { size?: "sm" | "md" }) {
  const box = size === "md" ? "h-12 w-9" : "h-9 w-7";
  return (
    <span
      className={`inline-block rounded-md border border-amber-300/60 bg-gradient-to-br from-rose-800 to-purple-900 shadow ${box}`}
    />
  );
}
