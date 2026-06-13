"use client";

import { useEffect, useRef, useState } from "react";
// Inline the shape here so the client bundle never touches server-only Redis imports.
type UsageEvent = { cacheHit: boolean; tokens: number; model: string; author: string; ts: number };
type Metrics = {
  requests: number; promptsAvoided: number; cacheHitRate: number;
  tokensSaved: number; tokensSpent: number;
  energySavedKwh: number; energySpentKwh: number;
  waterSavedL: number; waterSpentL: number;
  co2SavedG: number; ecoScore: number;
  latest: UsageEvent | null;
};

const POLL_MS = 2000;

// ── Animated counter hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 700): number {
  const [val, setVal] = useState(target);
  const from = useRef(target);
  const raf  = useRef<number>(0);

  useEffect(() => {
    const start = from.current;
    const diff  = target - start;
    if (diff === 0) return;
    const t0 = performance.now();

    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(start + diff * eased);
      if (p < 1) { raf.current = requestAnimationFrame(tick); }
      else        { from.current = target; }
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return val;
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtWater(L: number): string {
  if (L < 0.001) return `${(L * 1e6).toFixed(1)} µL`;
  if (L < 1)     return `${(L * 1000).toFixed(2)} mL`;
  return `${L.toFixed(3)} L`;
}
function fmtEnergy(kwh: number): string {
  if (kwh < 0.001) return `${(kwh * 1e6).toFixed(1)} µWh`;
  if (kwh < 1)     return `${(kwh * 1000).toFixed(2)} mWh`;
  return `${kwh.toFixed(4)} kWh`;
}
function fmtCO2(g: number): string {
  if (g < 1) return `${(g * 1000).toFixed(1)} µg`;
  if (g < 1000) return `${g.toFixed(2)} g`;
  return `${(g / 1000).toFixed(3)} kg`;
}
function pct(n: number) { return `${(n * 100).toFixed(1)}%`; }
function ts(ms: number) { return new Date(ms).toLocaleTimeString(); }

// ── Sub-components ───────────────────────────────────────────────────────────
function HeadlineCard({
  label, value, sub, accent,
}: { label: string; value: string; sub: string; accent: string }) {
  return (
    <div className={`flex flex-col justify-between rounded-2xl border p-10 ${accent}`}>
      <span className="text-2xl font-semibold tracking-widest uppercase opacity-70">{label}</span>
      <span className="text-8xl font-black tabular-nums leading-none">{value}</span>
      <span className="text-lg opacity-50">{sub}</span>
    </div>
  );
}

function StatCard({ label, value, dim }: { label: string; value: string; dim?: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-6">
      <span className="text-sm font-semibold uppercase tracking-widest opacity-50">{label}</span>
      <span className="text-5xl font-black tabular-nums leading-none">{value}</span>
      {dim && <span className="text-sm opacity-40">{dim}</span>}
    </div>
  );
}

function EcoMeter({ score }: { score: number }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 75 ? "#34d399" : score >= 40 ? "#fbbf24" : "#f87171";
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-6 items-center justify-center">
      <span className="text-sm font-semibold uppercase tracking-widest opacity-50">Eco Score</span>
      <div className="relative">
        <svg width="130" height="130" className="-rotate-90">
          <circle cx="65" cy="65" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
          <circle
            cx="65" cy="65" r={r} fill="none" stroke={color} strokeWidth="10"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ transition: "stroke-dasharray 0.7s cubic-bezier(0.33,1,0.68,1)" }}
          />
        </svg>
        <span
          className="absolute inset-0 flex items-center justify-center text-4xl font-black"
          style={{ color }}
        >
          {score}
        </span>
      </div>
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────────────────
export default function Dashboard() {
  const [data,    setData]    = useState<Metrics | null>(null);
  const [error,   setError]   = useState(false);
  const [lastOk,  setLastOk]  = useState<Date | null>(null);

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const r = await fetch("/api/metrics", { cache: "no-store" });
        if (!r.ok) throw new Error(`${r.status}`);
        const json = (await r.json()) as Metrics;
        if (alive) { setData(json); setError(false); setLastOk(new Date()); }
      } catch {
        if (alive) setError(true);
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const waterSaved  = useCountUp(data?.waterSavedL    ?? 0);
  const energySaved = useCountUp(data?.energySavedKwh ?? 0);

  return (
    <div className="min-h-screen w-full bg-[#050508] text-white flex flex-col p-8 gap-6 select-none">

      {/* ── Header ── */}
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="text-3xl font-black tracking-tight">CARBO</span>
          <span className="text-white/30 text-xl">·</span>
          <span className="text-xl text-white/50 font-light">Sustainability Dashboard</span>
        </div>
        <div className="flex items-center gap-3 text-sm text-white/40">
          {error
            ? <span className="text-red-400">⚠ API unreachable — last data from {lastOk?.toLocaleTimeString() ?? "—"}</span>
            : !data
            ? <span className="animate-pulse">Connecting…</span>
            : <>
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live · {lastOk?.toLocaleTimeString()}</span>
              </>
          }
        </div>
      </header>

      {/* ── Skeleton while loading ── */}
      {!data && !error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-white/20 text-2xl animate-pulse">Loading metrics…</div>
        </div>
      )}

      {/* ── Error state ── */}
      {error && !data && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-red-400/60 text-2xl">Could not reach /api/metrics</div>
        </div>
      )}

      {/* ── Live data ── */}
      {data && (
        <>
          {/* Headline cards */}
          <div className="grid grid-cols-2 gap-6 flex-1">
            <HeadlineCard
              label="Water Saved"
              value={fmtWater(waterSaved)}
              sub={`vs ${fmtWater(data.waterSpentL)} spent`}
              accent="border-sky-500/30 bg-sky-950/40 text-sky-100"
            />
            <HeadlineCard
              label="Energy Saved"
              value={fmtEnergy(energySaved)}
              sub={`vs ${fmtEnergy(data.energySpentKwh)} spent`}
              accent="border-amber-500/30 bg-amber-950/40 text-amber-100"
            />
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-5 gap-4">
            <StatCard
              label="Cache Hit Rate"
              value={pct(data.cacheHitRate)}
              dim={`${data.promptsAvoided} of ${data.requests} requests`}
            />
            <StatCard
              label="Prompts Avoided"
              value={String(data.promptsAvoided)}
              dim="cache hits"
            />
            <StatCard
              label="CO₂ Avoided"
              value={fmtCO2(data.co2SavedG)}
              dim="vs baseline"
            />
            <StatCard
              label="Tokens Saved"
              value={data.tokensSaved.toLocaleString()}
              dim={`${data.tokensSpent.toLocaleString()} spent`}
            />
            <EcoMeter score={data.ecoScore} />
          </div>

          {/* Last prompt footer */}
          {data.latest && (
            <footer className="rounded-xl border border-white/10 bg-white/5 px-8 py-4 flex items-center gap-6 text-sm">
              <span className="font-semibold uppercase tracking-widest opacity-40">Last Prompt</span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold uppercase ${
                  data.latest.cacheHit
                    ? "bg-emerald-500/20 text-emerald-300"
                    : "bg-red-500/20 text-red-300"
                }`}
              >
                {data.latest.cacheHit ? "HIT" : "MISS"}
              </span>
              <span className="text-white/70">{data.latest.author}</span>
              <span className="text-white/30">·</span>
              <span className="text-white/50">{data.latest.model}</span>
              <span className="text-white/30">·</span>
              <span className="text-white/50">{data.latest.tokens.toLocaleString()} tokens</span>
              <span className="text-white/30">·</span>
              <span className="text-white/40">{ts(data.latest.ts)}</span>
              {data.latest.cacheHit && (
                <span className="ml-auto text-sky-400/40">
                  {fmtWater((data.latest.tokens / 1e6) * 0.3 * 1.8)} saved by cache
                </span>
              )}
            </footer>
          )}
        </>
      )}
    </div>
  );
}
