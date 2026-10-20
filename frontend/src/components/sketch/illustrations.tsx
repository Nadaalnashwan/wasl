/* Hand-drawn workflow illustrations (ink outlines, sky fills). The global SVG filter #rough
   (defined in the root layout) adds a subtle pen wobble so lines look sketched. */
import * as React from "react";

const INK = "var(--ink)";
const SKY = "var(--sky)";
const SKY2 = "var(--sky-2)";
const PAPER = "var(--paper)";
const BRAND = "var(--brand)";
const HAND = { fontFamily: "var(--font-hand)" } as const;

function gearPath(cx: number, cy: number, r: number, teeth: number, depth: number) {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const a1 = a + step * 0.12;
    const a2 = a + step * 0.38;
    const a3 = a + step * 0.62;
    const a4 = a + step * 0.88;
    const p = (ang: number, rad: number) => `${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`;
    pts.push(p(a1, r), p(a2, r + depth), p(a3, r + depth), p(a4, r));
  }
  return `M${pts.join(" L")} Z`;
}

export function Gear({ className, teeth = 8, fill = SKY }: { className?: string; teeth?: number; fill?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d={gearPath(24, 24, 15, teeth, 6)} fill={fill} stroke="currentColor" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="5.5" fill={PAPER} stroke="currentColor" strokeWidth="3" />
    </svg>
  );
}

function GearSvg({ cx, cy, r, teeth, cls, fill = SKY }: { cx: number; cy: number; r: number; teeth: number; cls: string; fill?: string }) {
  return (
    <g className={cls}>
      <path d={gearPath(cx, cy, r, teeth, r * 0.32)} fill={fill} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r * 0.62} fill="none" stroke={INK} strokeWidth="2.5" />
      <circle cx={cx} cy={cy} r={r * 0.22} fill={PAPER} stroke={INK} strokeWidth="3" />
    </g>
  );
}

/* ------------------------------------------------------------------ hero scene */
export function MachineScene({ className, screenText = "wasl", outLabel = "CV ✓" }: { className?: string; screenText?: string; outLabel?: string }) {
  return (
    <svg viewBox="0 0 660 420" className={className} role="img" aria-label="A hand-drawn machine turning achievements into a CV and LinkedIn posts">
      {/* no displacement filter here: it would re-run every animation frame */}
      <g strokeLinecap="round" strokeLinejoin="round">
        {/* input pipe from top-left */}
        <path d="M40 20 L40 120 Q40 150 70 150 L110 150" fill="none" stroke={INK} strokeWidth="26" />
        <path d="M40 20 L40 120 Q40 150 70 150 L110 150" fill="none" stroke={SKY} strokeWidth="19" />
        {[40, 70, 100].map((y) => (
          <rect key={y} x="30" y={y} width="20" height="8" rx="2" fill={INK} />
        ))}
        {/* hopper */}
        <path d="M96 140 L150 140 L142 200 L104 200 Z" fill={SKY2} stroke={INK} strokeWidth="3.5" />
        <path d="M108 160 L138 160 M110 175 L136 175" stroke={INK} strokeWidth="3" />

        {/* conveyor belt */}
        <rect x="20" y="320" width="620" height="34" rx="17" fill={PAPER} stroke={INK} strokeWidth="4" />
        <g clipPath="url(#beltclip)">
          <g className="belt-move">
            {Array.from({ length: 16 }).map((_, i) => (
              <line key={i} x1={i * 60 - 40} y1="326" x2={i * 60 - 25} y2="348" stroke={INK} strokeWidth="3" />
            ))}
          </g>
        </g>
        {Array.from({ length: 10 }).map((_, i) => (
          <circle key={i} cx={46 + i * 63} cy="337" r="7" fill={INK} />
        ))}
        <path d="M60 354 L60 400 M600 354 L600 400" stroke={INK} strokeWidth="5" />

        {/* items riding the belt */}
        <g className="bob">
          <rect x="70" y="276" width="40" height="44" rx="4" fill={PAPER} stroke={INK} strokeWidth="3" />
          <path d="M78 288 h24 M78 297 h24 M78 306 h14" stroke={INK} strokeWidth="2.5" />
        </g>
        <g className="bob" style={{ animationDelay: "-1s" }}>
          <path d="M150 318 L168 284 L186 318 Z" fill={SKY} stroke={INK} strokeWidth="3" />
        </g>
        <g className="bob" style={{ animationDelay: "-2s" }}>
          <rect x="200" y="288" width="34" height="30" rx="3" fill={SKY2} stroke={INK} strokeWidth="3" />
          <path d="M209 297 l6 6 l-6 6 M225 297 l-6 6 l6 6" fill="none" stroke={INK} strokeWidth="2.5" />
        </g>

        {/* machine tower */}
        <rect x="262" y="170" width="150" height="150" rx="10" fill={PAPER} stroke={INK} strokeWidth="4" />
        <rect x="282" y="232" width="110" height="70" rx="8" fill={SKY} stroke={INK} strokeWidth="3.5" />
        <path d="M300 285 l14 -22 l14 22 Z M340 285 h22 v-16 h-22 Z" fill={PAPER} stroke={INK} strokeWidth="2.5" />
        <path d="M296 252 q10 -12 20 0 q10 12 20 0 q10 -12 20 0 q10 12 20 0" fill="none" stroke={BRAND} strokeWidth="3" />
        <circle cx="290" cy="196" r="9" fill={SKY2} stroke={INK} strokeWidth="3" />
        <circle cx="318" cy="196" r="9" fill={PAPER} stroke={INK} strokeWidth="3" />
        <rect x="340" y="188" width="18" height="18" rx="3" fill={INK} />
        <circle cx="384" cy="196" r="10" fill={PAPER} stroke={INK} strokeWidth="3" />
        <path d="M384 196 l5 -6" stroke={INK} strokeWidth="3" />

        {/* neck + monitor */}
        <rect x="324" y="130" width="26" height="40" fill={SKY} stroke={INK} strokeWidth="3.5" />
        <rect x="240" y="14" width="196" height="122" rx="14" fill={PAPER} stroke={INK} strokeWidth="4" />
        <rect x="256" y="28" width="164" height="78" rx="8" fill={SKY} stroke={INK} strokeWidth="3.5" />
        <text x="338" y="80" textAnchor="middle" fontSize="34" fill={INK} style={HAND}>
          {screenText}
        </text>
        <rect x="406" y="54" width="4" height="26" fill={INK} className="blink" />
        <circle cx="272" cy="120" r="5" fill={INK} />
        <circle cx="292" cy="120" r="5" fill={PAPER} stroke={INK} strokeWidth="2.5" />
        <rect x="384" y="114" width="36" height="10" rx="5" fill={SKY2} stroke={INK} strokeWidth="2.5" />

        {/* robot arm with claw holding a certificate */}
        <path d="M262 214 L214 214 L196 160" fill="none" stroke={INK} strokeWidth="14" />
        <path d="M262 214 L214 214 L196 160" fill="none" stroke={PAPER} strokeWidth="7" />
        <circle cx="214" cy="214" r="9" fill={SKY2} stroke={INK} strokeWidth="3" />
        <circle cx="196" cy="160" r="8" fill={PAPER} stroke={INK} strokeWidth="3" />
        <path d="M188 154 q-14 4 -14 22 M204 154 q14 4 14 22" fill="none" stroke={INK} strokeWidth="5" />
        <g transform="rotate(-8 196 196)">
          <rect x="172" y="178" width="48" height="36" rx="3" fill={PAPER} stroke={INK} strokeWidth="3" />
          <circle cx="208" cy="204" r="6" fill={SKY2} stroke={INK} strokeWidth="2.5" />
          <path d="M178 188 h22 M178 196 h16" stroke={INK} strokeWidth="2.5" />
        </g>

        {/* gears */}
        <GearSvg cx={520} cy={78} r={42} teeth={10} cls="gear-spin" />
        <GearSvg cx={600} cy={150} r={28} teeth={8} cls="gear-spin-rev" fill={SKY2} />
        <path d="M436 76 L470 76" stroke={INK} strokeWidth="5" />

        {/* output: CV box + post card */}
        <rect x="462" y="232" width="150" height="88" rx="8" fill={SKY} stroke={INK} strokeWidth="4" />
        <path d="M462 232 l18 -20 h150 l-18 20" fill={PAPER} stroke={INK} strokeWidth="3.5" />
        <path d="M612 232 l18 -20 v86 l-18 22" fill={SKY2} stroke={INK} strokeWidth="3.5" />
        <text x="537" y="290" textAnchor="middle" fontSize="34" fill={INK} style={HAND}>
          {outLabel}
        </text>
        <g className="bob" style={{ animationDelay: "-0.5s" }}>
          <rect x="420" y="268" width="36" height="46" rx="5" fill={PAPER} stroke={INK} strokeWidth="3" />
          <rect x="427" y="276" width="10" height="10" rx="2" fill={BRAND} />
          <path d="M427 294 h22 M427 302 h16" stroke={INK} strokeWidth="2.5" />
        </g>
      </g>
      <defs>
        <clipPath id="beltclip">
          <rect x="24" y="324" width="612" height="26" rx="13" />
        </clipPath>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------------ spot illustrations */
export function MonitorArt({ className, text }: { className?: string; text: string }) {
  return (
    <svg viewBox="0 0 200 150" className={className} aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <rect x="20" y="10" width="160" height="104" rx="12" fill={PAPER} stroke={INK} strokeWidth="4" />
        <rect x="34" y="22" width="132" height="66" rx="8" fill={SKY} stroke={INK} strokeWidth="3.5" />
        <text x="100" y="64" textAnchor="middle" fontSize="24" fill={INK} style={HAND}>
          {text}
        </text>
        <circle cx="44" cy="101" r="5" fill={INK} />
        <circle cx="62" cy="101" r="5" fill={PAPER} stroke={INK} strokeWidth="2.5" />
        <rect x="140" y="96" width="26" height="9" rx="4" fill={SKY2} stroke={INK} strokeWidth="2.5" />
        <rect x="88" y="114" width="24" height="22" fill={SKY} stroke={INK} strokeWidth="3.5" />
        <path d="M66 140 h68" stroke={INK} strokeWidth="5" />
      </g>
    </svg>
  );
}

export function EmptyBoxArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <path d="M10 120 h180" stroke={INK} strokeWidth="4" />
        {[30, 70, 110, 150].map((x) => (
          <circle key={x} cx={x} cy="128" r="5" fill={INK} />
        ))}
        <rect x="52" y="58" width="96" height="62" rx="5" fill={SKY} stroke={INK} strokeWidth="4" />
        <path d="M52 58 l-16 -22 h96 l16 22" fill={PAPER} stroke={INK} strokeWidth="3.5" />
        <path d="M148 58 l18 -20 l-16 -2" fill={SKY2} stroke={INK} strokeWidth="3.5" />
        <path d="M82 84 q18 14 36 0" fill="none" stroke={INK} strokeWidth="3.5" />
        <circle cx="84" cy="76" r="3.5" fill={INK} />
        <circle cx="116" cy="76" r="3.5" fill={INK} />
        <path d="M150 20 q8 -10 16 0 M164 34 q8 -10 16 0" fill="none" stroke={BRAND} strokeWidth="3" />
      </g>
    </svg>
  );
}

export function ClawArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 160" className={className} aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <rect x="64" y="0" width="32" height="14" fill={INK} />
        <path d="M80 14 L80 52 L50 82 L80 108" fill="none" stroke={INK} strokeWidth="14" />
        <path d="M80 14 L80 52 L50 82 L80 108" fill="none" stroke={PAPER} strokeWidth="7" />
        <circle cx="80" cy="52" r="8" fill={SKY2} stroke={INK} strokeWidth="3" />
        <circle cx="50" cy="82" r="8" fill={PAPER} stroke={INK} strokeWidth="3" />
        <rect x="64" y="104" width="32" height="20" rx="4" fill={SKY} stroke={INK} strokeWidth="3.5" />
        <path d="M66 124 q-16 10 -6 30 M94 124 q16 10 6 30" fill="none" stroke={INK} strokeWidth="5" />
      </g>
    </svg>
  );
}

export function ChartArt({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 140" className={className} aria-hidden="true">
      <g filter="url(#rough)" strokeLinejoin="round" strokeLinecap="round">
        <rect x="14" y="10" width="172" height="118" rx="12" fill={PAPER} stroke={INK} strokeWidth="4" />
        <path d="M34 108 V30 M34 108 H170" stroke={INK} strokeWidth="3.5" />
        <rect x="48" y="78" width="18" height="30" fill={SKY} stroke={INK} strokeWidth="3" />
        <rect x="76" y="58" width="18" height="50" fill={SKY2} stroke={INK} strokeWidth="3" />
        <rect x="104" y="68" width="18" height="40" fill={SKY} stroke={INK} strokeWidth="3" />
        <rect x="132" y="40" width="18" height="68" fill={SKY2} stroke={INK} strokeWidth="3" />
        <path d="M46 60 L84 44 L112 52 L150 26" fill="none" stroke={BRAND} strokeWidth="3.5" />
      </g>
    </svg>
  );
}

export function RoughFilterDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true" focusable="false">
      <filter id="rough" x="-5%" y="-5%" width="110%" height="110%">
        <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
      </filter>
    </svg>
  );
}
