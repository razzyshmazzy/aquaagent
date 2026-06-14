"use client";

import { useEffect, useId, useRef, useState } from "react";

// ── Types ──────────────────────────────────────────────────────────────────
type UsageEvent = {
  cacheHit: boolean; tokens: number; model: string; author: string; ts: number;
  promptTokensSaved?: number;
};
type MetricsPayload = {
  requests: number; promptsAvoided: number; cacheHitRate: number;
  tokensSaved: number; tokensSpent: number;
  energySavedKwh: number; energySpentKwh: number;
  waterSavedL: number; waterSpentL: number;
  co2SavedG: number;
  promptTokensSaved: number; waterSavedFromShorteningL: number;
  ecoScore: number; latest: UsageEvent | null;
};
type HistoryPoint = { month: string; waterSavedL: number; energySavedKwh: number };
type DashboardData = { metrics: MetricsPayload; history: HistoryPoint[]; weeklyGainL: number };

// ── Sustainability constants (for last-prompt footer display) ──────────────
// Energy per token: 1.0 Wh/1K tokens for frontier models.
// Source: Luccioni et al., "Power Hungry Processing" (NeurIPS 2023).
const WH_PER_1K = 1.0;
const WATER_L_PER_KWH = 1.8; // LBNL 2016

// Energy per Claude request: 0.3–10 Wh depending on model and context.
// Source: Luccioni et al. NeurIPS 2023; range represents Haiku → Opus.
const ELC_LOW_WH = 0.3;
const ELC_HIGH_WH = 10;
const ELC_AVG_WH = (ELC_LOW_WH + ELC_HIGH_WH) / 2;

// ── Colour helpers ─────────────────────────────────────────────────────────
type RGB = [number, number, number];
const ECO_STOPS: [number, RGB][] = [
  [0,   [226, 75,  58 ]],
  [40,  [232, 146, 58 ]],
  [70,  [127, 194, 63 ]],
  [100, [31,  157, 82 ]],
];

function ecoRgb(score: number): RGB {
  let lo = ECO_STOPS[0], hi = ECO_STOPS[ECO_STOPS.length - 1];
  for (let i = 0; i < ECO_STOPS.length - 1; i++) {
    if (score >= ECO_STOPS[i][0] && score <= ECO_STOPS[i + 1][0]) {
      [lo, hi] = [ECO_STOPS[i], ECO_STOPS[i + 1]];
      break;
    }
  }
  const t = lo[0] === hi[0] ? 0 : (score - lo[0]) / (hi[0] - lo[0]);
  return [0, 1, 2].map(j => Math.round(lo[1][j] + t * (hi[1][j] - lo[1][j]))) as RGB;
}
const rgb = ([r, g, b]: RGB) => `rgb(${r},${g},${b})`;
const rgba = ([r, g, b]: RGB, a: number) => `rgba(${r},${g},${b},${a})`;

// ── Formatters ─────────────────────────────────────────────────────────────
function fmtWater(L: number): { value: string; unit: string } {
  if (L <= 0)    return { value: "0", unit: "mL" };
  if (L < 0.001) return { value: (L * 1e6).toFixed(1), unit: "µL" };
  if (L < 1)     return { value: (L * 1000).toFixed(2), unit: "mL" };
  if (L < 3.785) return { value: L.toFixed(3), unit: "L" };
  return { value: fmtCompact(L / 3.785), unit: "gal" };
}
function fmtCompact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(1);
}
function fmtMoney(n: number): string {
  if (n < 0.01) return `${(n * 100).toFixed(2)}¢`;
  if (n < 1) return `${(n * 100).toFixed(1)}¢`;
  return `$${n.toFixed(2)}`;
}
function ecoBand(s: number) {
  if (s >= 85) return "Excellent";
  if (s >= 65) return "Good";
  if (s >= 40) return "OK";
  return "Poor";
}

// ── Animated counter ───────────────────────────────────────────────────────
function useCountUp(target: number, ms = 600): number {
  const [val, setVal] = useState(target);
  const prev = useRef(target);
  const raf = useRef(0);
  useEffect(() => {
    const from = prev.current;
    const diff = target - from;
    if (Math.abs(diff) < 1e-12) return;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - t0) / ms, 1);
      setVal(from + diff * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return val;
}

// ── Wave SVG path ──────────────────────────────────────────────────────────
function wavePath(y: number, amp: number, width: number): string {
  const hw = width / 2;
  const qw = width / 4;
  return `M ${-hw} ${y} Q ${-hw + qw * .5} ${y - amp} ${-hw + qw} ${y} T ${-hw + qw * 2} ${y} T ${-hw + qw * 3} ${y} T ${-hw + qw * 4} ${y} L ${hw + qw * 4} ${y + amp + 200} L ${-hw} ${y + amp + 200} Z`;
}

// ── Eco liquid gauge ───────────────────────────────────────────────────────
function EcoGauge({ score }: { score: number }) {
  const uid = useId().replace(/:/g, "");
  const S = 172, cx = S / 2, cy = S / 2, r = S / 2 - 2;
  const col = ecoRgb(score);
  const fillY = S * (1 - score / 100);
  const W = S * 2;

  return (
    <div style={{ position: "relative", width: S, height: S, filter: `drop-shadow(0 0 18px ${rgba(col, 0.5)})` }}>
      <svg width={S} height={S} style={{ overflow: "hidden" }}>
        <defs>
          <clipPath id={`c-${uid}`}><circle cx={cx} cy={cy} r={r} /></clipPath>
          <style>{`
            @keyframes wF${uid}{from{transform:translateX(0)}to{transform:translateX(-${S}px)}}
            @keyframes wB${uid}{from{transform:translateX(-${S}px)}to{transform:translateX(0)}}
          `}</style>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill="rgba(0,0,0,0.28)" />
        <g clipPath={`url(#c-${uid})`}>
          <rect x={0} y={fillY} width={S} height={S} fill={rgb(col)} fillOpacity={0.5} />
          <g style={{ animation: `wF${uid} 7s linear infinite` }}>
            <path d={wavePath(fillY, 7, W)} fill={rgb(col)} fillOpacity={0.85} />
          </g>
          <g style={{ animation: `wB${uid} 11s linear infinite` }}>
            <path d={wavePath(fillY - 4, 5, W)} fill={rgb(col)} fillOpacity={0.45} />
          </g>
        </g>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={rgb(col)} strokeWidth={1.5} opacity={0.3} />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 44, fontWeight: 900, color: rgb(col), lineHeight: 1, fontFamily: "var(--font-dm-mono, monospace)" }}>
          {score}
        </span>
      </div>
    </div>
  );
}

// ── Savings graph ──────────────────────────────────────────────────────────
const GW = 1120, GH = 150, GX0 = 40, GX1 = 1080, GY0 = 22, GY1 = 128;

function graphPts(values: number[], maxVal: number) {
  const n = values.length;
  return values.map((v, i) => ({
    x: GX0 + (GX1 - GX0) * i / Math.max(n - 1, 1),
    y: maxVal > 0 ? GY1 - (GY1 - GY0) * (v / maxVal) : GY1,
  }));
}
function linePath(ps: { x: number; y: number }[]) {
  return ps.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
}
function areaPath(ps: { x: number; y: number }[]) {
  if (!ps.length) return "";
  return `${linePath(ps)} L ${ps[ps.length - 1].x.toFixed(1)} ${GY1} L ${ps[0].x.toFixed(1)} ${GY1} Z`;
}

function SavingsGraph({ history }: { history: HistoryPoint[] }) {
  const uid = useId().replace(/:/g, "");
  // Cumulative monthly water saved in mL
  const mL = history.map(h => h.waterSavedL * 1000);
  const cumulative = mL.reduce<number[]>((acc, v) => {
    acc.push((acc[acc.length - 1] ?? 0) + v);
    return acc;
  }, []);
  const maxVal = Math.max(...cumulative, 0.001);
  const ps = graphPts(cumulative, maxVal);
  const last = ps[ps.length - 1];
  const lastVal = cumulative[cumulative.length - 1];

  return (
    <svg viewBox={`0 0 ${GW} ${GH}`} style={{ width: "100%", overflow: "visible" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={`ga-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#5fe7da" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#5fe7da" stopOpacity="0" />
        </linearGradient>
        <style>{`@keyframes gPulse${uid}{0%,100%{r:5;opacity:1}50%{r:9;opacity:.4}}`}</style>
      </defs>

      <path d={areaPath(ps)} fill={`url(#ga-${uid})`} />
      <path d={linePath(ps)} fill="none" stroke="#5fe7da" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />

      {ps.slice(0, -1).map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={4} fill="#5fe7da" opacity={0.65} />
      ))}

      {last && (
        <>
          <circle cx={last.x} cy={last.y} r={11} fill="#5fe7da" opacity={0.18}
            style={{ animation: `gPulse${uid} 2.4s ease-in-out infinite` }} />
          <circle cx={last.x} cy={last.y} r={5} fill="#5fe7da" />
        </>
      )}

      {last && lastVal > 0.001 && (
        <text x={last.x} y={last.y - 16} textAnchor="middle" fill="#5fe7da"
          fontSize="13" fontFamily="var(--font-dm-mono, monospace)" opacity={0.9}>
          {lastVal < 1 ? `${(lastVal * 1000).toFixed(1)} µL` : `${lastVal.toFixed(2)} mL`}
        </text>
      )}

      {history.map((h, i) => {
        const x = GX0 + (GX1 - GX0) * i / Math.max(history.length - 1, 1);
        return (
          <text key={i} x={x} y={GH - 2} textAnchor="middle"
            fill="rgba(255,255,255,0.32)" fontSize="12"
            fontFamily="var(--font-dm-mono, monospace)" letterSpacing="0.08em">
            {h.month}
          </text>
        );
      })}
    </svg>
  );
}

// ── Background bubbles ─────────────────────────────────────────────────────
const BUBBLES = [
  { x: 7,  s: 6,  d: 14, delay: 0   },
  { x: 14, s: 4,  d: 18, delay: 2.1 },
  { x: 24, s: 8,  d: 16, delay: 0.7 },
  { x: 36, s: 5,  d: 20, delay: 3.4 },
  { x: 54, s: 9,  d: 13, delay: 1.2 },
  { x: 64, s: 4,  d: 17, delay: 4.1 },
  { x: 74, s: 7,  d: 19, delay: 0.4 },
  { x: 83, s: 5,  d: 15, delay: 2.8 },
  { x: 91, s: 6,  d: 21, delay: 1.6 },
  { x: 96, s: 4,  d: 14, delay: 3.9 },
  { x: 47, s: 3,  d: 22, delay: 5.2 },
  { x: 41, s: 10, d: 12, delay: 0.9 },
];

// ── Card style ─────────────────────────────────────────────────────────────
const CARD: React.CSSProperties = {
  background: "rgba(255,255,255,0.075)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.11)",
};

// ── Dashboard ──────────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data, setData]       = useState<DashboardData | null>(null);
  const [error, setError]     = useState(false);
  const [lastOk, setLastOk]   = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/dashboard", { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status}`);
        const json = (await r.json()) as DashboardData;
        if (alive) { setData(json); setError(false); setLastOk(new Date()); }
      } catch {
        if (alive) setError(true);
      }
    };
    poll();
    const id = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(id); };
  }, []);

  // Derived values
  const m = data?.metrics;
  const animWaterL   = useCountUp(m?.waterSavedL ?? 0);
  const waterFmt     = fmtWater(animWaterL);
  const weeklyFmt    = fmtWater(data?.weeklyGainL ?? 0);
  const ecoScore     = m?.ecoScore ?? 0;
  const ecoCol       = ecoRgb(ecoScore);
  const whTotal      = (m?.energySavedKwh ?? 0) * 1000;
  const queriesAvg   = Math.round(whTotal / ELC_AVG_WH);
  const queriesMin   = Math.round(whTotal / ELC_HIGH_WH);
  const queriesMax   = Math.round(whTotal / ELC_LOW_WH);
  const markerPct    = queriesMin === queriesMax ? 50 : Math.round(((queriesAvg - queriesMin) / (queriesMax - queriesMin)) * 100);
  // $15/1M output tokens (Claude Sonnet pricing) — source: anthropic.com/pricing
  const moneySaved   = ((m?.tokensSaved ?? 0) * 15) / 1_000_000;
  const cacheHitPct  = Math.round((m?.cacheHitRate ?? 0) * 100);
  // WHO: 2 L/day drinking water per person → 730 L/year
  const peopleYears  = (m?.waterSavedL ?? 0) / 730;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(177deg, #0b2234 0%, #03121a 55%, #020f18 100%)",
      color: "#eef8f8",
      fontFamily: "var(--font-space-grotesk, system-ui, sans-serif)",
      position: "relative",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      padding: "26px 30px 20px",
      gap: 0,
    }}>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes aqBubble{0%{transform:translateY(0) scale(1);opacity:.14}100%{transform:translateY(-105vh) scale(1.4);opacity:0}}
        @keyframes aqPulse{0%,100%{opacity:.7}50%{opacity:1}}
        @keyframes liveDot{0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,.5)}50%{box-shadow:0 0 0 5px rgba(52,211,153,0)}}
      `}</style>

      {/* Bubble particles */}
      {BUBBLES.map((b, i) => (
        <div key={i} style={{
          position: "fixed",
          left: `${b.x}%`, bottom: -b.s * 2,
          width: b.s, height: b.s, borderRadius: "50%",
          background: "rgba(95,231,218,.55)",
          animation: `aqBubble ${b.d}s ${b.delay}s linear infinite`,
          pointerEvents: "none", zIndex: 0,
        }} />
      ))}
      {/* Vignette */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", zIndex: 0,
        background: "radial-gradient(ellipse at 50% 50%, transparent 38%, rgba(2,10,18,.75) 100%)",
      }} />

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingBottom: 22, position: "relative", zIndex: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em", color: "#5fe7da" }}>
            AquaAgent
          </span>
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 18 }}>·</span>
          <span style={{
            fontSize: 13, color: "rgba(255,255,255,0.42)",
            fontFamily: "var(--font-dm-mono, monospace)", letterSpacing: "0.09em",
          }}>
            SUSTAINABILITY DASHBOARD
          </span>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: 9,
          fontSize: 12, color: "rgba(255,255,255,0.38)",
          fontFamily: "var(--font-dm-mono, monospace)",
        }}>
          {error ? (
            <span style={{ color: "#f87171" }}>
              ⚠ API unreachable — {lastOk ? `last ok ${lastOk.toLocaleTimeString()}` : "never connected"}
            </span>
          ) : !data ? (
            <span style={{ animation: "aqPulse 1.4s ease-in-out infinite" }}>Connecting…</span>
          ) : (
            <>
              <span style={{
                width: 7, height: 7, borderRadius: "50%", background: "#34d399", display: "inline-block",
                animation: "liveDot 2s ease-in-out infinite",
              }} />
              Live · {lastOk?.toLocaleTimeString()}
            </>
          )}
        </div>
      </header>

      {/* ── Main grid ── */}
      <div style={{
        position: "relative", zIndex: 2, flex: 1,
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gridTemplateRows: "290px 254px 254px",
        gap: 22,
      }}>

        {/* ─── ROW 1 · HERO ─── */}
        <div style={{
          gridColumn: "1 / 9", ...CARD,
          padding: "40px 52px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{
              fontSize: 108, fontWeight: 800, lineHeight: 1,
              fontFamily: "var(--font-instrument-serif, Georgia, serif)",
              fontStyle: "italic",
              textShadow: "0 0 80px rgba(95,231,218,.4)",
            }}>
              {waterFmt.value}
            </span>
            <span style={{
              fontSize: 40, color: "rgba(255,255,255,.55)",
              fontFamily: "var(--font-instrument-serif, Georgia, serif)",
              fontStyle: "italic",
            }}>
              {waterFmt.unit}
            </span>
          </div>

          <div style={{
            fontFamily: "var(--font-instrument-serif, Georgia, serif)",
            fontStyle: "italic", fontSize: 20, color: "rgba(255,255,255,.48)", marginTop: -4,
          }}>
            water saved by caching AI responses
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <span style={{
              background: "rgba(95,231,218,.1)", border: "1px solid rgba(95,231,218,.22)",
              borderRadius: 100, padding: "6px 16px",
              fontSize: 13, fontFamily: "var(--font-dm-mono, monospace)", color: "#5fe7da",
            }}>
              ▲ {weeklyFmt.value} {weeklyFmt.unit} this week
            </span>
            {m && m.promptTokensSaved > 0 && (() => {
              const f = fmtWater(m.waterSavedFromShorteningL);
              return (
                <span style={{
                  background: "rgba(95,231,218,.1)", border: "1px solid rgba(95,231,218,.22)",
                  borderRadius: 100, padding: "6px 16px",
                  fontSize: 13, fontFamily: "var(--font-dm-mono, monospace)", color: "#5fe7da",
                }}>
                  ✂ {f.value} {f.unit} from shortening prompts
                </span>
              );
            })()}
            {peopleYears >= 0.0001 && (
              <span style={{
                background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.1)",
                borderRadius: 100, padding: "6px 16px",
                fontSize: 13, fontFamily: "var(--font-dm-mono, monospace)",
                color: "rgba(255,255,255,.45)",
              }}>
                {peopleYears < 1
                  ? `${(peopleYears * 365).toFixed(1)} person-days of drinking H₂O`
                  : `${fmtCompact(peopleYears)} person-years of drinking H₂O`}
              </span>
            )}
          </div>
        </div>

        {/* ─── ROW 1 · ECO GAUGE ─── */}
        <div style={{
          gridColumn: "9 / 13", ...CARD,
          padding: "30px 32px",
          display: "flex", gap: 24, alignItems: "center",
        }}>
          {data
            ? <EcoGauge score={ecoScore} />
            : <div style={{ width: 172, height: 172, borderRadius: "50%", background: "rgba(255,255,255,.05)" }} />
          }
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{
              fontFamily: "var(--font-dm-mono, monospace)",
              fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,.38)",
            }}>ECO SCORE</span>
            <span style={{
              fontSize: 58, fontWeight: 900, color: rgb(ecoCol), lineHeight: 1,
              fontFamily: "var(--font-dm-mono, monospace)",
            }}>
              {ecoScore}
            </span>
            <span style={{ fontSize: 15, color: rgb(ecoCol), fontWeight: 600 }}>
              {ecoBand(ecoScore)}
            </span>
            <span style={{ fontFamily: "var(--font-dm-mono, monospace)", fontSize: 12, color: "rgba(255,255,255,.35)" }}>
              {cacheHitPct}% cache hit rate
            </span>
            {m && m.requests > 0 && (
              <span style={{ fontFamily: "var(--font-dm-mono, monospace)", fontSize: 11, color: "rgba(255,255,255,.28)" }}>
                {m.promptsAvoided} / {m.requests} prompts cached
              </span>
            )}
          </div>
        </div>

        {/* ─── ROW 2 · CLAUDE COMPARISON ─── */}
        <div style={{
          gridColumn: "1 / 9", ...CARD,
          padding: "34px 44px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
          background: "rgba(255,155,120,.08)",
          borderColor: "rgba(255,155,120,.2)",
        }}>
          <span style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,155,120,.65)",
          }}>
            CLAUDE REQUEST EQUIVALENT
          </span>

          <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
            <span style={{
              fontSize: 84, fontWeight: 900, color: "#ff9b78", lineHeight: 1,
              fontFamily: "var(--font-dm-mono, monospace)",
              textShadow: "0 0 50px rgba(255,155,120,.45)",
            }}>
              {fmtCompact(queriesAvg)}
            </span>
            <span style={{ fontSize: 20, color: "rgba(255,155,120,.55)" }}>requests</span>
          </div>

          <div style={{ fontSize: 14, color: "rgba(255,255,255,.42)", maxWidth: 560, lineHeight: 1.6 }}>
            The energy avoided could power {fmtCompact(queriesAvg)} average Claude API calls
            (range: {fmtCompact(queriesMin)}–{fmtCompact(queriesMax)} depending on model and context length).
          </div>

          {/* Range track */}
          <div style={{ position: "relative", height: 3, background: "rgba(255,155,120,.14)", borderRadius: 2 }}>
            <div style={{
              position: "absolute", top: -4, left: `${Math.max(0, Math.min(100, markerPct))}%`,
              transform: "translateX(-50%)",
              width: 11, height: 11, borderRadius: "50%", background: "#ff9b78",
            }} />
          </div>

          <div style={{
            display: "flex", justifyContent: "space-between",
            fontFamily: "var(--font-dm-mono, monospace)", fontSize: 11, color: "rgba(255,255,255,.28)",
          }}>
            <span>{ELC_LOW_WH} Wh / request (small)</span>
            <span style={{ color: "rgba(255,155,120,.55)" }}>{ELC_AVG_WH.toFixed(1)} Wh avg</span>
            <span>{ELC_HIGH_WH} Wh / request (large)</span>
          </div>

          <div style={{
            fontFamily: "var(--font-dm-mono, monospace)", fontSize: 11,
            color: "rgba(255,255,255,.22)", marginTop: 2,
          }}>
            Total energy saved: {whTotal < 1 ? `${(whTotal * 1000).toFixed(2)} mWh` : `${whTotal.toFixed(3)} Wh`}
            {" · "}Source: Luccioni et al., NeurIPS 2023
          </div>
        </div>

        {/* ─── ROW 2 · MONEY SAVED ─── */}
        <div style={{
          gridColumn: "9 / 13", ...CARD,
          padding: "34px 38px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,.38)",
          }}>API COST SAVED</span>

          <div>
            <div style={{
              fontSize: 68, fontWeight: 900, color: "#5fe7da", lineHeight: 1,
              fontFamily: "var(--font-dm-mono, monospace)",
              textShadow: "0 0 35px rgba(95,231,218,.35)",
            }}>
              {fmtMoney(moneySaved)}
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,.38)", marginTop: 10 }}>
              ≈ {fmtMoney(moneySaved / 12)} / month
            </div>
          </div>

          <div style={{ fontFamily: "var(--font-dm-mono, monospace)", fontSize: 11, color: "rgba(255,255,255,.28)", lineHeight: 1.8 }}>
            {(m?.tokensSaved ?? 0).toLocaleString()} tokens avoided
            <br />at $15 / 1M output tokens
            <br />(Claude Sonnet · anthropic.com/pricing)
          </div>
        </div>

        {/* ─── ROW 3 · SAVINGS GRAPH ─── */}
        <div style={{
          gridColumn: "1 / 9", ...CARD,
          padding: "28px 38px 20px",
          display: "flex", flexDirection: "column", gap: 14,
        }}>
          <span style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,.38)",
          }}>
            CUMULATIVE WATER SAVED · LAST 6 MONTHS
          </span>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            {data
              ? <SavingsGraph history={data.history} />
              : <div style={{ flex: 1, height: 100, background: "rgba(255,255,255,.03)", borderRadius: 8 }} />
            }
          </div>
        </div>

        {/* ─── ROW 3 · CACHE HIT RATE ─── */}
        <div style={{
          gridColumn: "9 / 13", ...CARD,
          padding: "34px 38px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,255,255,.38)",
          }}>CACHE HIT RATE</span>

          <div>
            <div style={{
              fontSize: 80, fontWeight: 900, color: "#5fe7da", lineHeight: 1,
              fontFamily: "var(--font-dm-mono, monospace)",
              textShadow: "0 0 35px rgba(95,231,218,.35)",
            }}>
              {cacheHitPct}%
            </div>
            <div style={{ fontSize: 14, color: "rgba(255,255,255,.38)", marginTop: 10 }}>
              of prompts served from cache
            </div>
          </div>

          <div style={{ fontFamily: "var(--font-dm-mono, monospace)", fontSize: 11, color: "rgba(255,255,255,.28)", lineHeight: 1.8 }}>
            CO₂ avoided:{" "}
            {m
              ? m.co2SavedG < 0.001
                ? `${(m.co2SavedG * 1e6).toFixed(2)} µg`
                : m.co2SavedG < 1
                ? `${(m.co2SavedG * 1000).toFixed(2)} mg`
                : `${m.co2SavedG.toFixed(3)} g`
              : "—"}
            <br />
            {(m?.tokensSaved ?? 0).toLocaleString()} tokens saved
            <br />US grid: 400 gCO₂/kWh · EPA eGRID2022
          </div>
        </div>
      </div>

      {/* ── Latest prompt footer ── */}
      {m?.latest && (
        <div style={{
          ...CARD, padding: "13px 26px", marginTop: 18,
          display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap",
          fontSize: 12, fontFamily: "var(--font-dm-mono, monospace)",
          position: "relative", zIndex: 2,
        }}>
          <span style={{ letterSpacing: "0.08em", color: "rgba(255,255,255,.3)" }}>LATEST</span>
          <span style={{
            padding: "3px 11px", borderRadius: 100,
            fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
            background: m.latest.cacheHit ? "rgba(52,211,153,.13)" : "rgba(248,113,113,.13)",
            color: m.latest.cacheHit ? "#34d399" : "#f87171",
            border: `1px solid ${m.latest.cacheHit ? "rgba(52,211,153,.3)" : "rgba(248,113,113,.3)"}`,
          }}>
            {m.latest.cacheHit ? "HIT" : "MISS"}
          </span>
          <span style={{ color: "rgba(255,255,255,.58)" }}>{m.latest.author}</span>
          <span style={{ color: "rgba(255,255,255,.2)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,.45)" }}>{m.latest.model}</span>
          <span style={{ color: "rgba(255,255,255,.2)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,.42)" }}>{m.latest.tokens.toLocaleString()} tokens</span>
          <span style={{ color: "rgba(255,255,255,.2)" }}>·</span>
          <span style={{ color: "rgba(255,255,255,.32)" }}>{new Date(m.latest.ts).toLocaleTimeString()}</span>
          {m.latest.cacheHit && (() => {
            const savedL = (m.latest.tokens / 1000) * WH_PER_1K / 1000 * WATER_L_PER_KWH;
            const f = fmtWater(savedL);
            return (
              <span style={{ marginLeft: "auto", color: "rgba(95,231,218,.5)" }}>
                +{f.value} {f.unit} avoided this request
              </span>
            );
          })()}
          {!m.latest.cacheHit && (m.latest.promptTokensSaved ?? 0) > 0 && (() => {
            const savedL = ((m.latest.promptTokensSaved ?? 0) / 1000) * WH_PER_1K / 1000 * WATER_L_PER_KWH;
            const f = fmtWater(savedL);
            return (
              <span style={{ marginLeft: "auto", color: "rgba(95,231,218,.5)" }}>
                ✂ {f.value} {f.unit} saved by shortening
              </span>
            );
          })()}
        </div>
      )}
    </div>
  );
}
