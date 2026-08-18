import { useId } from "react";
import type { CSSProperties } from "react";

function buildPath(points: number[], width: number, height: number, pad = 2) {
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const step = (width - pad * 2) / (points.length - 1);

  return points
    .map((point, i) => {
      const x = (pad + i * step).toFixed(1);
      const y = (height - pad - ((point - min) / span) * (height - pad * 2)).toFixed(1);
      return `${i ? "L" : "M"}${x},${y}`;
    })
    .join(" ");
}

export interface SparklineProps {
  points: number[];
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
  style?: CSSProperties;
}

export function Sparkline({
  points = [],
  color = "var(--accent-primary)",
  width = 180,
  height = 56,
  fill = true,
  style,
}: SparklineProps) {
  const gradientId = useId();
  const d = buildPath(points, width, height);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      style={{ display: "block", ...style }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity=".35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && (
        <path
          d={`${d} L${width - 2},${height} L2,${height} Z`}
          fill={`url(#${gradientId})`}
        />
      )}
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
