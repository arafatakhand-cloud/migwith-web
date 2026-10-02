// 😀 Reaction emoji that shakes (like the app): a quick wiggle (left-right
// tilt + a small pop) every ~2.6 s, and an extra wiggle whenever the count
// changes, so a new reaction catches the eye. Used by the room chat and the
// private chat; the count next to it stays still.
export function ReactionShakeEmoji({ emoji, count }: { emoji: string; count: number }) {
  return (
    <span key={count} className="reaction-kick inline-block">
      <span className="reaction-shake inline-block">{emoji}</span>
    </span>
  );
}
