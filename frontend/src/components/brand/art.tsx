/* Wasl illustration set (v2.3 "Evolved Original").
   The v1 "machine" motifs — intake arm, verifying monitor, gears, conveyor, outputs — redrawn with precise
   geometry: one stroke weight, straight edges, consistent radii, no wobble and no faces.
   Colours come from CSS variables (see globals.css: --art-*), so every piece follows light/dark and can be
   re-tinted by a parent. All pieces are decorative (aria-hidden) unless a label is passed. */
import * as React from "react";

const INK = "var(--art-ink)";
const FILL = "var(--art-fill)";
const PAPER = "var(--art-paper)";
const BRAND = "var(--art-brand)";
const SKY = "var(--art-sky)";
const WARM = "var(--art-warm)";
const OK = "var(--art-ok)";
const S = { stroke: INK, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

function gearPath(cx: number, cy: number, r: number, teeth: number, depth: number) {
  const pts: string[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    const p = (ang: number, rad: number) => `${(cx + Math.cos(ang) * rad).toFixed(1)},${(cy + Math.sin(ang) * rad).toFixed(1)}`;
    pts.push(p(a + step * 0.1, r), p(a + step * 0.3, r + depth), p(a + step * 0.6, r + depth), p(a + step * 0.8, r));
  }
  return `M${pts.join(" L")} Z`;
}

function Gear({ cx, cy, r, teeth = 9, fill = FILL, className }: { cx: number; cy: number; r: number; teeth?: number; fill?: string; className?: string }) {
  return (
    <g className={className} style={{ transformOrigin: `${cx}px ${cy}px` }}>
      <path d={gearPath(cx, cy, r, teeth, r * 0.28)} fill={fill} {...S} />
      <circle cx={cx} cy={cy} r={r * 0.34} fill={PAPER} {...S} />
    </g>
  );
}

function Svg({ viewBox, className, label, children }: { viewBox: string; className?: string; label?: string; children: React.ReactNode }) {
  return (
    <svg viewBox={viewBox} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} fill="none">
      {children}
    </svg>
  );
}

/* ------------------------------------------------------------------ hero: the Wasl machine */
export function WaslMachine({ className, label }: { className?: string; label?: string }) {
  return (
    <Svg viewBox="0 0 640 420" className={className} label={label}>
      {/* intake chute with an achievement card dropping in */}
      <path d="M58 40 H150 V112 L128 140 H80 L58 112 Z" fill={FILL} {...S} />
      <path d="M78 68 H130 M78 84 H118" {...S} />
      <g className="art-float">
        <rect x="70" y="-6" width="68" height="40" rx="5" fill={PAPER} {...S} />
        <path d="M82 8 H126 M82 20 H112" {...S} />
        <circle cx="128" cy="20" r="5" fill={WARM} {...S} />
      </g>
      <path d="M104 140 V176 H176" {...S} strokeDasharray="2 7" />

      {/* the engine */}
      <rect x="176" y="96" width="232" height="176" rx="14" fill={PAPER} {...S} />
      <rect x="196" y="116" width="192" height="104" rx="8" fill={FILL} {...S} />
      {/* screen: a claim being checked line by line */}
      <g>
        <circle cx="216" cy="140" r="7" fill={OK} {...S} />
        <path d="M212.5 140 l2.5 2.6 4.5-5" stroke={PAPER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M232 140 H330" {...S} />
        <circle cx="216" cy="166" r="7" fill={OK} {...S} />
        <path d="M212.5 166 l2.5 2.6 4.5-5" stroke={PAPER} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M232 166 H306" {...S} />
        <circle cx="216" cy="192" r="7" fill={WARM} {...S} />
        <path d="M216 188 v4.5 M216 195.6 v.2" stroke={PAPER} strokeWidth="2" strokeLinecap="round" />
        <path d="M232 192 H350" {...S} strokeDasharray="1 6" />
        <rect className="art-scan" x="200" y="128" width="184" height="3" rx="1.5" fill={BRAND} stroke="none" opacity=".55" />
      </g>
      {/* control strip */}
      <circle cx="206" cy="246" r="7" fill={BRAND} {...S} />
      <circle cx="230" cy="246" r="7" fill={PAPER} {...S} />
      <rect x="252" y="239" width="64" height="14" rx="7" fill={FILL} {...S} />
      <rect x="330" y="239" width="58" height="14" rx="7" fill={SKY} {...S} />
      {/* gears on top */}
      <Gear cx={360} cy={66} r={24} className="art-spin" />
      <Gear cx={404} cy={42} r={15} teeth={8} fill={SKY} className="art-spin-rev" />
      <path d="M232 96 V70 H300 V96" {...S} />
      <rect x="252" y="56" width="28" height="14" rx="3" fill={FILL} {...S} />

      {/* conveyor */}
      <rect x="40" y="306" width="560" height="26" rx="13" fill={PAPER} {...S} />
      {[66, 130, 194, 258, 322, 386, 450, 514, 578].map((x) => (
        <circle key={x} cx={x} cy="319" r="5" fill={FILL} {...S} />
      ))}
      <path d="M96 332 V384 M544 332 V384" {...S} />
      <path d="M408 220 H448 V250" {...S} strokeDasharray="2 7" />

      {/* outputs riding the belt */}
      {/* LinkedIn post */}
      <g className="art-rise">
        <rect x="430" y="212" width="78" height="92" rx="7" fill={PAPER} {...S} />
        <rect x="442" y="224" width="18" height="18" rx="4" fill={BRAND} {...S} />
        <path d="M446.5 236.5 V231 M446.5 228 v.2 M451 236.5 V231 m0 2.4 c0-2.4 5-2.4 5 0 V236.5" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M442 254 H496 M442 266 H488 M442 278 H494 M442 290 H476" {...S} />
      </g>
      {/* CV with approval */}
      <g className="art-rise" style={{ animationDelay: "0.6s" }}>
        <rect x="520" y="196" width="70" height="108" rx="7" fill={PAPER} {...S} />
        <path d="M520 196 h52 l18 18" {...S} />
        <path d="M532 222 H566 M532 236 H578 M532 250 H572 M532 264 H560" {...S} />
        <text x="532" y="292" fill={INK} style={{ font: "800 15px var(--font-nunito), sans-serif" }}>CV</text>
        <circle cx="584" cy="290" r="13" fill={OK} {...S} />
        <path d="M578 290 l4 4 7-8" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* target / roadmap */}
      <g>
        <circle cx="236" cy="290" r="15" fill={PAPER} {...S} />
        <circle cx="236" cy="290" r="8" fill={SKY} {...S} />
        <circle cx="236" cy="290" r="2.5" fill={INK} />
      </g>
      <rect x="282" y="282" width="56" height="24" rx="6" fill={WARM} {...S} />
      <path d="M294 294 H326" stroke={PAPER} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ workflow stations */
export type Station = "document" | "check" | "approve" | "reuse";

export function StationArt({ kind, className }: { kind: Station; className?: string }) {
  return (
    <Svg viewBox="0 0 160 120" className={className}>
      {kind === "document" && (
        <>
          {/* robotic intake arm placing a card */}
          <rect x="56" y="6" width="48" height="10" rx="3" fill={INK} stroke="none" />
          <path d="M80 16 V40 L104 62" {...S} strokeWidth="5" />
          <path d="M80 16 V40 L104 62" stroke={FILL} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="80" cy="40" r="6" fill={SKY} {...S} />
          <circle cx="104" cy="62" r="5" fill={PAPER} {...S} />
          <path d="M96 70 l-6 10 M112 70 l6 10" {...S} />
          <rect x="68" y="84" width="72" height="30" rx="5" fill={PAPER} {...S} />
          <path d="M78 95 H118 M78 104 H106" {...S} />
          <circle cx="128" cy="104" r="4" fill={WARM} {...S} />
        </>
      )}
      {kind === "check" && (
        <>
          <rect x="24" y="10" width="112" height="76" rx="8" fill={PAPER} {...S} />
          <rect x="34" y="20" width="92" height="56" rx="5" fill={FILL} {...S} />
          <circle cx="46" cy="36" r="5" fill={OK} {...S} />
          <path d="M57 36 H112" {...S} />
          <circle cx="46" cy="52" r="5" fill={OK} {...S} />
          <path d="M57 52 H100" {...S} />
          <circle cx="46" cy="66" r="5" fill={WARM} {...S} />
          <path d="M57 66 H116" {...S} strokeDasharray="1 5" />
          <path d="M70 86 V100 M90 86 V100 M58 104 H102" {...S} />
          {/* magnifier */}
          <circle cx="122" cy="88" r="13" fill={SKY} {...S} />
          <path d="M131 97 L144 110" {...S} strokeWidth="4" />
        </>
      )}
      {kind === "approve" && (
        <>
          <rect x="30" y="8" width="64" height="88" rx="6" fill={PAPER} {...S} />
          <path d="M42 26 H82 M42 40 H78 M42 54 H84 M42 68 H70" {...S} />
          <rect x="74" y="44" width="60" height="62" rx="8" fill={FILL} {...S} />
          <circle cx="104" cy="66" r="10" fill={PAPER} {...S} />
          <path d="M86 98 c3-12 33-12 36 0" fill={PAPER} {...S} />
          <circle cx="128" cy="40" r="13" fill={OK} {...S} />
          <path d="M122 40 l4 4 7-8" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === "reuse" && (
        <>
          <rect x="52" y="40" width="56" height="40" rx="6" fill={FILL} {...S} />
          <path d="M66 54 H94 M66 66 H86" {...S} />
          <path d="M52 60 H30 M108 60 H130 M80 40 V22 M80 80 V98" {...S} strokeDasharray="2 5" />
          <rect x="4" y="46" width="26" height="28" rx="4" fill={BRAND} {...S} />
          <path d="M11 56 V66 M11 53 v.2 M16 66 V58 m0 2 c0-3 6-3 6 0 V66" stroke={PAPER} strokeWidth="1.8" strokeLinecap="round" />
          <rect x="130" y="44" width="26" height="32" rx="4" fill={PAPER} {...S} />
          <path d="M136 54 H150 M136 62 H148" {...S} />
          <circle cx="80" cy="12" r="10" fill={PAPER} {...S} />
          <circle cx="80" cy="12" r="4" fill={WARM} {...S} />
          <rect x="66" y="98" width="28" height="18" rx="4" fill={SKY} {...S} />
          <path d="M72 107 H88" {...S} />
        </>
      )}
    </Svg>
  );
}

/* ------------------------------------------------------------------ closing band: measured outcomes */
export function ChartArt({ className }: { className?: string }) {
  return (
    <Svg viewBox="0 0 220 150" className={className}>
      <rect x="6" y="6" width="208" height="138" rx="12" fill={PAPER} {...S} />
      <path d="M30 120 H194 M30 28 V120" {...S} />
      {[
        [44, 92],
        [80, 70],
        [116, 82],
        [152, 48],
      ].map(([x, y], i) => (
        <rect key={x} x={x} y={y} width="24" height={120 - y} rx="3" fill={i === 3 ? BRAND : FILL} {...S} />
      ))}
      <path d="M44 78 L80 56 L116 66 L164 30" stroke={WARM} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="164" cy="30" r="5" fill={WARM} {...S} />
    </Svg>
  );
}

/* ------------------------------------------------------------------ in-app spot illustrations (page banners) */
export type SpotKind = "dashboard" | "achievements" | "cv" | "studio" | "jobs" | "tailor" | "gap" | "settings" | "admin";

export function SpotArt({ kind, className }: { kind: SpotKind; className?: string }) {
  return (
    <Svg viewBox="0 0 120 96" className={className}>
      {kind === "dashboard" && (
        <>
          <rect x="26" y="28" width="68" height="50" rx="8" fill={PAPER} {...S} />
          <rect x="35" y="37" width="50" height="26" rx="4" fill={FILL} {...S} />
          <circle cx="44" cy="50" r="4" fill={OK} {...S} />
          <path d="M52 50 H76" {...S} />
          <Gear cx={92} cy={22} r={12} teeth={8} fill={SKY} />
          <path d="M8 86 H112" {...S} />
          <rect x="6" y="56" width="20" height="24" rx="3" fill={PAPER} {...S} />
          <rect x="96" y="58" width="18" height="22" rx="3" fill={WARM} {...S} />
        </>
      )}
      {kind === "achievements" && (
        <>
          <path d="M44 8 L56 40 M76 8 L64 40" {...S} strokeWidth="7" stroke={BRAND} />
          <path d="M44 8 L56 40 M76 8 L64 40" {...S} />
          <circle cx="60" cy="58" r="26" fill={WARM} {...S} />
          <circle cx="60" cy="58" r="17" fill={PAPER} {...S} />
          <path d="M60 47 l3.4 7 7.6 1-5.5 5.3 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.3 7.6-1z" fill={WARM} {...S} strokeWidth="1.6" />
        </>
      )}
      {kind === "cv" && (
        <>
          <rect x="40" y="14" width="50" height="66" rx="5" fill={FILL} {...S} />
          <rect x="30" y="20" width="50" height="66" rx="5" fill={PAPER} {...S} />
          <circle cx="44" cy="36" r="6" fill={SKY} {...S} />
          <path d="M56 33 H72 M56 41 H68 M40 54 H72 M40 64 H66 M40 74 H70" {...S} />
          <circle cx="86" cy="78" r="11" fill={OK} {...S} />
          <path d="M81 78 l3.5 3.5 6-7" stroke={PAPER} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
      {kind === "studio" && (
        <>
          <rect x="22" y="14" width="64" height="70" rx="7" fill={PAPER} {...S} />
          <rect x="32" y="24" width="14" height="14" rx="3" fill={BRAND} {...S} />
          <path d="M52 27 H74 M52 35 H66 M32 50 H76 M32 60 H70 M32 70 H58" {...S} />
          <path d="M82 70 L104 26 L112 30 L90 74 L80 78 Z" fill={WARM} {...S} />
          <path d="M100 34 L108 38" {...S} />
        </>
      )}
      {kind === "jobs" && (
        <>
          <rect x="20" y="34" width="72" height="48" rx="7" fill={FILL} {...S} />
          <path d="M44 34 V26 a4 4 0 0 1 4-4 h16 a4 4 0 0 1 4 4 V34 M20 54 H92" {...S} />
          <rect x="50" y="49" width="12" height="10" rx="2" fill={PAPER} {...S} />
          <path d="M98 8 c-8.5 0-14 6-14 13.5 0 9.5 14 22.5 14 22.5 s14-13 14-22.5 C112 14 106.5 8 98 8z" fill={OK} {...S} />
          <circle cx="98" cy="21" r="4.5" fill={PAPER} {...S} />
        </>
      )}
      {kind === "tailor" && (
        <>
          <rect x="18" y="14" width="52" height="70" rx="5" fill={PAPER} {...S} />
          <path d="M28 30 H58 M28 42 H52 M28 54 H60 M28 66 H46" {...S} />
          <path d="M18 48 H70" {...S} strokeDasharray="3 4" stroke={BRAND} />
          <circle cx="86" cy="70" r="8" fill={SKY} {...S} />
          <circle cx="104" cy="70" r="8" fill={SKY} {...S} />
          <path d="M90 63 L108 28 M100 63 L82 28" {...S} />
        </>
      )}
      {kind === "gap" && (
        <>
          <circle cx="56" cy="50" r="34" fill={PAPER} {...S} />
          <circle cx="56" cy="50" r="22" fill={FILL} {...S} />
          <circle cx="56" cy="50" r="10" fill={PAPER} {...S} />
          <circle cx="56" cy="50" r="3.5" fill={INK} />
          <path d="M60 46 L104 12" {...S} strokeWidth="2.5" />
          <path d="M96 10 L106 10 L106 20" fill={WARM} {...S} />
          <path d="M14 90 H34 V80 H54 V70" {...S} stroke={BRAND} strokeWidth="2.5" />
        </>
      )}
      {kind === "settings" && (
        <>
          <path d="M24 26 H96 M24 50 H96 M24 74 H96" {...S} />
          <circle cx="44" cy="26" r="8" fill={BRAND} {...S} />
          <circle cx="76" cy="50" r="8" fill={WARM} {...S} />
          <circle cx="54" cy="74" r="8" fill={SKY} {...S} />
        </>
      )}
      {kind === "admin" && (
        <>
          <rect x="14" y="14" width="92" height="66" rx="8" fill={PAPER} {...S} />
          <path d="M26 66 H94 M26 24 V66" {...S} />
          <rect x="34" y="46" width="12" height="20" rx="2" fill={FILL} {...S} />
          <rect x="54" y="36" width="12" height="30" rx="2" fill={FILL} {...S} />
          <rect x="74" y="28" width="12" height="38" rx="2" fill={BRAND} {...S} />
          <path d="M32 40 L52 30 L72 34 L92 20" stroke={WARM} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </Svg>
  );
}
