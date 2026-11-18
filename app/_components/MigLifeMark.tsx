// 💬 miGlife's mark for the Feed's "What's on your mind?" box (miglife, Nov 2026):
// the logo's blue and orange chat bubbles with "miG" and "life" inside, on a
// raised white 6D button with the rainbow ring. The same for everyone (not the
// account's profile photo). Same as the app (MigLifeMark in Blog.kt).

const BUBBLE = "M30 4h40q26 0 26 26v20q0 26-26 26H46L26 93l4-17Q4 75 4 50V30Q4 4 30 4z";

export function MigLifeMark({ size = 40 }: { size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full"
      style={{ width: size + 5, height: size + 5, background: "conic-gradient(#38BDF8,#6366F1,#A855F7,#EC4899,#38BDF8)" }}
      aria-label="miGlife"
    >
      <span className="flex rounded-full bg-[#EEF0FF] p-[2.5px]" style={{ width: size, height: size }}>
        <span
          className="flex flex-1 items-center justify-center rounded-full"
          style={{ background: "linear-gradient(#FFFFFF,#E8EEFF)", boxShadow: "inset 0 -4px 0 #B9C6F0, inset 0 2px 0 #FFFFFF" }}
        >
          <svg width={size * 0.9} height={size * 0.85} viewBox="0 0 120 112" aria-hidden="true">
            <defs>
              <linearGradient id="mlmBlue" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4FB3FF" /><stop offset="1" stopColor="#1C5FC0" /></linearGradient>
              <linearGradient id="mlmOrange" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#FFB45C" /><stop offset="1" stopColor="#E8561C" /></linearGradient>
            </defs>
            <path transform="translate(1,2) scale(.82)" d={BUBBLE} fill="url(#mlmBlue)" stroke="#fff" strokeWidth="6" />
            <text x="42" y="40" textAnchor="middle" fontWeight="900" fontSize="30" fill="#fff">miG</text>
            <path transform="translate(119,44) scale(-.7,.68)" d={BUBBLE} fill="url(#mlmOrange)" stroke="#fff" strokeWidth="7" />
            <text x="84" y="79" textAnchor="middle" fontWeight="900" fontSize="25" fill="#fff">life</text>
          </svg>
        </span>
      </span>
    </span>
  );
}
