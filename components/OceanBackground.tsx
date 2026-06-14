// components/OceanBackground.tsx
"use client";

import { ReactNode } from "react";

// Bubble field — [leftPercent, sizePx, durationSec, delaySec] (from the dashboard)
const BUBBLES: [number, number, number, number][] = [
  [8, 7, 14, -2],
  [13, 11, 18, -7],
  [21, 5, 11, -4],
  [29, 9, 16, -9],
  [37, 6, 13, -1],
  [46, 12, 20, -12],
  [54, 5, 12, -6],
  [63, 8, 15, -3],
  [71, 6, 17, -10],
  [79, 10, 19, -5],
  [88, 7, 14, -8],
  [94, 5, 12, -11],
];

// Light rays — [leftPercent, widthPx, blurPx, rotateDeg, durationSec, delaySec, topAlpha]
const RAYS: [number, number, number, number, number, number, number][] = [
  [14, 180, 34, 9, 13, 0, 0.32],
  [42, 240, 42, 7, 17, 2, 0.26],
  [72, 200, 38, 10, 15, 1, 0.22],
];

export default function OceanBackground({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background:
          "linear-gradient(177deg,#1a5562 0%,#103f4c 20%,#0a2f3b 44%,#062330 68%,#04161f 88%,#030f16 100%)",
      }}
    >
      {/* surface light wash */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 420,
          background:
            "linear-gradient(180deg,rgba(140,225,220,.20),rgba(140,225,220,0) 100%)",
          zIndex: 1,
        }}
      />

      {/* animated light rays */}
      {RAYS.map(([left, width, blur, rot, dur, delay, alpha], i) => (
        <div
          key={`ray-${i}`}
          className="ocean-ray"
          style={{
            position: "absolute",
            top: -220,
            left: `${left}%`,
            width,
            height: 1500,
            background: `linear-gradient(180deg,rgba(165,242,236,${alpha}),rgba(165,242,236,0))`,
            filter: `blur(${blur}px)`,
            // animation drives rotation; seed the base angle via a CSS var
            ["--ray-rot" as string]: `${rot}deg`,
            animation: `oceanRay ${dur}s ease-in-out infinite`,
            animationDelay: `${delay}s`,
            zIndex: 1,
          }}
        />
      ))}

      {/* rising bubbles */}
      <div style={{ position: "absolute", inset: 0, zIndex: 2, pointerEvents: "none" }}>
        {BUBBLES.map(([left, size, dur, delay], i) => (
          <div
            key={`bubble-${i}`}
            style={{
              position: "absolute",
              bottom: -30,
              left: `${left}%`,
              width: size,
              height: size,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 32% 30%,rgba(255,255,255,.85),rgba(150,240,235,.15))",
              animation: `oceanBubble ${dur}s linear infinite`,
              animationDelay: `${delay}s`,
            }}
          />
        ))}
      </div>

      {/* vignette */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          zIndex: 3,
          pointerEvents: "none",
          background:
            "radial-gradient(ellipse 90% 80% at 38% 32%,transparent 42%,rgba(2,12,18,.55) 100%)",
        }}
      />

      {/* foreground content */}
      <div style={{ position: "relative", zIndex: 4, width: "100%", height: "100%" }}>
        {children}
      </div>

      <style jsx>{`
        @keyframes oceanBubble {
          0% {
            transform: translateY(0) translateX(0);
            opacity: 0;
          }
          10% {
            opacity: 0.55;
          }
          85% {
            opacity: 0.4;
          }
          100% {
            transform: translateY(-1180px) translateX(34px);
            opacity: 0;
          }
        }
        .ocean-ray {
          transform: rotate(var(--ray-rot));
        }
        @keyframes oceanRay {
          0%,
          100% {
            transform: translateX(0) rotate(var(--ray-rot));
            opacity: 0.16;
          }
          50% {
            transform: translateX(48px) rotate(calc(var(--ray-rot) + 2deg));
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}