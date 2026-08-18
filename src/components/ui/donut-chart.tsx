import type { CSSProperties } from "react";

export interface DonutSegment {
  value: number;
  color: string;
}

export interface DonutChartProps {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerValue?: string;
  centerLabel?: string;
  style?: CSSProperties;
}

export function DonutChart({
  segments = [],
  size = 210,
  thickness = 26,
  centerValue,
  centerLabel,
  style,
}: DonutChartProps) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  // Each arc starts where the previous ones ended, so lay the offsets out first.
  const arcs = segments.reduce<{ length: number; offset: number; color: string }[]>(
    (acc, segment) => {
      const previous = acc.at(-1);
      const offset = previous ? previous.offset + previous.length : 0;
      acc.push({
        length: (segment.value / total) * circumference,
        offset,
        color: segment.color,
      });
      return acc;
    },
    [],
  );

  return (
    <div style={{ position: "relative", width: size, height: size, ...style }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        {arcs.map((arc, i) => (
          <circle
            key={i}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={arc.color}
            strokeWidth={thickness}
            strokeDasharray={`${arc.length - 2} ${circumference - arc.length + 2}`}
            strokeDashoffset={-arc.offset}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {(centerValue || centerLabel) && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "2px",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontSize: "20px",
              fontWeight: 700,
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-primary)",
            }}
          >
            {centerValue}
          </span>
          <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
            {centerLabel}
          </span>
        </div>
      )}
    </div>
  );
}
