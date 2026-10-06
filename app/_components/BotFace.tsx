// A simple cartoon face (head and shoulders) for a bot player, picked from
// its name — the app's drawLudoBotFace (used by Ludo and 29).

const FEMALE = new Set([
  "rani", "zara", "mina", "luna", "nila", "sara", "riya", "tania", "mitu", "nidhi", "tuli",
  "mim", "jui", "priya", "lamia", "nusrat", "sumaiya", "tisha", "ritu", "anika", "sadia", "puja", "mou", "eva", "bristy",
  "sneha", "joya", "rupa", "sumi", "keya",
]);
const SKINS = ["#FFD9C0", "#F1C27D", "#D9A066", "#B57A4A"];
const HAIR = ["#2B1B14", "#4A2C1A", "#1A1A1A", "#7A4A22"];

export function BotFace({ name, size }: { name: string; size: number }) {
  const key = name.replace("🤖", "").trim().toLowerCase();
  let h = 0;
  for (const ch of key) h += ch.codePointAt(0) || 0;
  const female = FEMALE.has(key);
  const skin = SKINS[h % 4];
  const hair = HAIR[Math.floor(h / 4) % 4];
  // drawn on a 100×100 box
  const cx = 50;
  const fy = 54;
  const fr = 27;
  const top = female
    ? `M${cx - fr * 1.1},${fy + fr * 0.2} C${cx - fr * 1.2},${fy - fr * 1.6} ${cx + fr * 1.2},${fy - fr * 1.6} ${cx + fr * 1.1},${fy + fr * 0.2} C${cx + fr * 0.9},${fy - fr * 0.4} ${cx + fr * 0.2},${fy - fr * 0.75} ${cx - fr * 0.2},${fy - fr * 0.55} C${cx - fr * 0.6},${fy - fr * 0.4} ${cx - fr * 0.95},${fy - fr * 0.3} ${cx - fr * 1.1},${fy + fr * 0.2}Z`
    : `M${cx - fr * 1.08},${fy - fr * 0.05} C${cx - fr * 1.2},${fy - fr * 1.5} ${cx + fr * 1.2},${fy - fr * 1.5} ${cx + fr * 1.08},${fy - fr * 0.05} C${cx + fr * 0.95},${fy - fr * 0.6} ${cx + fr * 0.5},${fy - fr * 0.62} ${cx},${fy - fr * 0.6} C${cx - fr * 0.5},${fy - fr * 0.62} ${cx - fr * 0.95},${fy - fr * 0.6} ${cx - fr * 1.08},${fy - fr * 0.05}Z`;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      {female && <rect x={cx - fr * 1.25} y={fy - fr * 1.15} width={fr * 2.5} height={fr * 2.55} rx={fr} fill={hair} />}
      <rect x={cx - fr * 0.35} y={fy + fr * 0.7} width={fr * 0.7} height={fr * 0.6} fill={skin} />
      <ellipse cx={cx} cy={fy + fr * 1.15 + fr * 0.9} rx={fr * 1.6} ry={fr * 0.9} fill={female ? "#FFFFFF" : "#37474F"} />
      <ellipse cx={cx} cy={fy - fr * 1.1 + fr * 1.125} rx={fr * 1.05} ry={fr * 1.125} fill={skin} />
      <circle cx={cx - fr} cy={fy + fr * 0.05} r={fr * 0.2} fill={skin} />
      <circle cx={cx + fr} cy={fy + fr * 0.05} r={fr * 0.2} fill={skin} />
      <path d={top} fill={hair} />
      {[-1, 1].map((sgn) => (
        <g key={sgn}>
          <ellipse cx={cx + sgn * fr * 0.38} cy={fy + fr * 0.15} rx={fr * 0.13} ry={fr * 0.15} fill="#2B1B14" />
          <circle cx={cx + sgn * fr * 0.38 - fr * 0.04 + fr * 0.13 - fr * 0.13} cy={fy + fr * 0.07} r={fr * 0.05} fill="#FFFFFF" />
          <line
            x1={cx + sgn * fr * 0.22}
            y1={fy - fr * 0.18}
            x2={cx + sgn * fr * 0.55}
            y2={fy - fr * 0.2}
            stroke={hair}
            strokeWidth={fr * 0.08}
            strokeLinecap="round"
          />
          <circle cx={cx + sgn * fr * 0.6} cy={fy + fr * 0.42} r={fr * 0.13} fill="rgba(255,107,107,.25)" />
        </g>
      ))}
      <path
        d={`M${cx - fr * 0.25},${fy + fr * 0.5} Q${cx},${fy + fr * 0.75} ${cx + fr * 0.25},${fy + fr * 0.5}`}
        fill="none"
        stroke="#B23A48"
        strokeWidth={fr * 0.08}
        strokeLinecap="round"
      />
    </svg>
  );
}
