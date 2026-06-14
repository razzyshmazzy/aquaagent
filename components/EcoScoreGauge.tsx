// components/EcoScoreGauge.tsx
"use client";

import { useId } from "react";

type Props = {
  /** 0–100 */
  score?: number;
  /** pixel diameter of the gauge */
  size?: number;
};

// ── helpers (ported 1:1 from the dashboard) ──────────────────────────────
function hexToRgb(h: string): [number, number, number] {
  h = h.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Continuous colour ramp: red (low) → amber → lime → green (high)
function ecoRgb(score: number): [number, number, number] {
  const stops: [number, string][] = [
    [0, "#e24b3a"],
    [40, "#e8923a"],
    [70, "#7fc23f"],
    [100, "#1f9d52"],
  ];
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (score >= stops[i][0] && score <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }
  const t = hi[0] === lo[0] ? 0 : (score - lo[0]) / (hi[0] - lo[0]);
  const a = hexToRgb(lo[1]);
  const b = hexToRgb(hi[1]);
  return a.map((c, i) => Math.round(c + (b[i] - c) * t)) as [number, number, number];
}

// Wavy water-surface path. Surface sits at y `level`, waves with amplitude
// `amp`. Drawn twice as wide as the circle (0→344) so the CSS scroll can shift
// it left by one tile (172) seamlessly. Q+T mirrors each crest/trough (a sine).
function ecoWave(level: number, amp: number): string {
  const W = 172;
  const H = 172;
  const q = W / 4;
  return (
    `M0,${level.toFixed(1)} ` +
    `Q${q},${(level - amp).toFixed(1)} ${W / 2},${level.toFixed(1)} ` +
    `T${W},${level.toFixed(1)} T${W * 1.5},${level.toFixed(1)} T${2 * W},${level.toFixed(1)} ` +
    `L${2 * W},${H} L0,${H} Z`
  );
}

export default function EcoScoreGauge({ score = 87, size = 172 }: Props) {
  const uid = useId().replace(/:/g, ""); // unique, SSR-safe ids for defs
  const clipId = `ecoClip-${uid}`;
  const gradId = `ecoWater-${uid}`;

  const ecoScore = Math.max(0, Math.min(100, score)); // clamp 0–100
  const ecoY = (1 - ecoScore / 100) * 172; // surface height (smaller y = fuller)
  const ecoWaveFront = ecoWave(ecoY, 7);
  const ecoWaveBack = ecoWave(ecoY - 4, 5);

  const [er, eg, eb] = ecoRgb(ecoScore);
  const ecoColor = `rgb(${er},${eg},${eb})`;
  const ecoColorText = `rgb(${Math.round(er + (255 - er) * 0.35)},${Math.round(
    eg + (255 - eg) * 0.35
  )},${Math.round(eb + (255 - eb) * 0.35)})`;
  const ecoGlow = `rgba(${er},${eg},${eb},0.45)`;

  return (
    <div
      style={{
        position: "relative",
        width: size,
        height: size,
        flex: "none",
        filter: `drop-shadow(0 0 16px ${ecoGlow})`,
      }}
    >
      <svg viewBox="0 0 172 172" style={{ width: "100%", height: "100%" }}>
        <defs>
          <clipPath id={clipId}>
            <circle cx="86" cy="86" r="78" />
          </clipPath>
          <linearGradient id={gradId} x1="1" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor={ecoColor} stopOpacity={0.5} />
            <stop offset="1" stopColor={ecoColor} stopOpacity={0.08} />
          </linearGradient>
        </defs>

        <circle cx="86" cy="86" r="78" fill="rgba(6,33,40,0.35)" />

        <g clipPath={`url(#${clipId})`}>
          <path
            d={ecoWaveBack}
            fill={`url(#${gradId})`}
            opacity={0.55}
            className="ecoWaveBack"
          />
          <path d={ecoWaveFront} fill={`url(#${gradId})`} className="ecoWaveFront" />
        </g>

        <circle
          cx="86"
          cy="86"
          r="78"
          fill="none"
          stroke={ecoColor}
          strokeWidth={3}
          strokeOpacity={0.5}
        />
      </svg>

      {/* center readout */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: "'Instrument Serif',serif", fontSize: 62, lineHeight: 0.9, color: ecoColorText }}>
          {ecoScore}
        </div>
        <div style={{ fontFamily: "'DM Mono',monospace", fontSize: 11, color: "#6fcfd0", letterSpacing: 1 }}>
          / 100
        </div>
      </div>

      <style jsx>{`
        .ecoWaveFront {
          animation: ecoWaveScroll 7s linear infinite;
        }
        .ecoWaveBack {
          animation: ecoWaveScroll 11s linear infinite reverse;
        }
        @keyframes ecoWaveScroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-172px);
          }
        }
      `}</style>
    </div>
  );
}
