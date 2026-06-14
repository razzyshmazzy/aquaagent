"use client";

import { useEffect, useRef, useState } from "react";
import EcoScoreGauge from "@/components/EcoScoreGauge";
import OceanBackground from "@/components/OceanBackground";

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
// Claude-request estimate: show fractional savings so the card tracks small
// amounts (a handful of saved tokens) instead of rounding to a frozen 0.
function fmtQueries(n: number): string {
  if (n <= 0)   return "0";
  if (n < 0.1)  return n.toFixed(3);
  if (n < 1)    return n.toFixed(2);
  if (n < 100)  return n.toFixed(1);
  return fmtCompact(n);
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
  const ecoScore     = m?.ecoScore ?? 0;
  const ecoCol       = ecoRgb(ecoScore);
  const whTotal      = (m?.energySavedKwh ?? 0) * 1000;
  // Estimate — keep fractional so small savings still register. Integer rounding
  // here pinned the card to 0 until ~5K tokens were saved (whTotal / 5.15 Wh ≥ 1),
  // making it look frozen while water/eco moved off the same underlying number.
  const queriesAvg   = whTotal / ELC_AVG_WH;
  // Electricity saved per token avoided — the energy-intensity metric the whole
  // model rests on: WH_PER_1K Wh / 1,000 tokens === WH_PER_1K mWh per token.
  // (Luccioni et al., NeurIPS 2023.) Constant rate.
  const mWhPerToken  = WH_PER_1K; // 1.0 Wh/1K tokens === 1.0 mWh/token
  // $15/1M output tokens (Claude Sonnet pricing) — source: anthropic.com/pricing
  const moneySaved   = ((m?.tokensSaved ?? 0) * 15) / 1_000_000;
  const cacheHitPct  = Math.round((m?.cacheHitRate ?? 0) * 100);
  // WHO: 2 L/day drinking water per person → 730 L/year
  const peopleYears  = (m?.waterSavedL ?? 0) / 730;

  return (
    <main style={{ position: "fixed", inset: 0 }}>
      <OceanBackground>
        <div style={{
          width: "100%",
          height: "100%",
          boxSizing: "border-box",
          color: "#eef8f8",
          fontFamily: "var(--font-space-grotesk, system-ui, sans-serif)",
          display: "flex",
          flexDirection: "column",
          padding: "26px 30px 20px",
          overflowY: "auto",
        }}>

      {/* ── Global keyframes ── */}
      <style>{`
        @keyframes aqPulse{0%,100%{opacity:.7}50%{opacity:1}}
        @keyframes liveDot{0%,100%{box-shadow:0 0 0 0 rgba(52,211,153,.5)}50%{box-shadow:0 0 0 5px rgba(52,211,153,0)}}
      `}</style>

      {/* ── Header ── */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        paddingBottom: 22, position: "relative", zIndex: 2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <img
            src="/agentwithtext.png"
            alt="AquaAgent"
            style={{ height: 50, width: "auto", display: "block", flexShrink: 0, transform: "scale(3.5)", transformOrigin: "left center" }}
          />
          <span style={{ color: "rgba(255,255,255,0.18)", fontSize: 18, marginLeft: 180 }}>·</span>
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
        gridTemplateRows: "290px 254px",
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
            water saved with AquaAgent
          </div>

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
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
            ? <EcoScoreGauge score={ecoScore} />
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
          gridColumn: "1 / 4", ...CARD,
          padding: "34px 44px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,155,120,.65)",
          }}>
            CLAUDE REQUEST EQUIVALENT
          </span>

          <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: -10 }}>
            <span style={{
              fontSize: 84, fontWeight: 900, color: "#ff9b78", lineHeight: 1,
              fontFamily: "var(--font-dm-mono, monospace)",
            }}>
              {fmtQueries(queriesAvg)}
            </span>
          </div>
        </div>

        {/* ─── ROW 2 · ELECTRICITY PER TOKEN ─── */}
        <div style={{
          gridColumn: "4 / 7", ...CARD,
          padding: "34px 38px",
          display: "flex", flexDirection: "column", justifyContent: "space-between",
        }}>
          <span style={{
            fontFamily: "var(--font-dm-mono, monospace)",
            fontSize: 11, letterSpacing: "0.1em", color: "rgba(255,155,120,.65)",
          }}>
            ELECTRICITY / TOKEN SAVED
          </span>

          <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginTop: -10 }}>
            <span style={{
              fontSize: 64, fontWeight: 900, color: "#ff9b78", lineHeight: 1,
              fontFamily: "var(--font-dm-mono, monospace)",
            }}>
              {mWhPerToken.toFixed(1)}
            </span>
            <span style={{ fontSize: 18, color: "rgba(255,155,120,.55)" }}>mWh / token</span>
          </div>
        </div>

        {/* ─── ROW 2 · CACHE HIT RATE ─── */}
        <div style={{
          gridColumn: "7 / 10", ...CARD,
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
            }}>
              {cacheHitPct}%
            </div>
          </div>
        </div>

        {/* ─── ROW 2 · MONEY SAVED ─── */}
        <div style={{
          gridColumn: "10 / 13", ...CARD,
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
            }}>
              {fmtMoney(moneySaved)}
            </div>
            <div style={{ fontSize: 15, color: "rgba(255,255,255,.38)", marginTop: 10 }}>
              ≈ {fmtMoney(moneySaved / 12)} / month
            </div>
          </div>

          <div style={{ fontFamily: "var(--font-dm-mono, monospace)", fontSize: 11, color: "rgba(255,255,255,.28)", lineHeight: 1.8 }}>
            {(m?.tokensSaved ?? 0).toLocaleString()} tokens avoided
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
      </OceanBackground>
    </main>
  );
}
