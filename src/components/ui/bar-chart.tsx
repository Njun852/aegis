import type { CSSProperties } from "react";

export interface BarChartDatum {
  label: string;
  value: number;
}

export interface BarChartProps {
  data: BarChartDatum[];
  height?: number;
  highlight?: string;
  yTicks?: number;
  formatY?: (value: number) => string;
  style?: CSSProperties;
}

export function BarChart({
  data = [],
  height = 230,
  highlight,
  yTicks = 5,
  formatY = (value) => `$${Math.round(value / 1000)}K`,
  style,
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const top = Math.ceil(max / 10000) * 10000 || max;
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round((top * (yTicks - i)) / yTicks),
  );

  return (
    <div style={{ display: "flex", gap: "12px", ...style }}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          height,
          fontSize: "10px",
          color: "var(--text-muted)",
          fontVariantNumeric: "tabular-nums",
          paddingBottom: "18px",
        }}
      >
        {ticks.map((tick) => (
          <span key={tick}>{tick === 0 ? "$0" : formatY(tick)}</span>
        ))}
      </div>
      <div
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-end",
          gap: "2%",
          height,
        }}
      >
        {data.map((d) => {
          const on = d.label === highlight;
          return (
            <div
              key={d.label}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "6px",
                height: "100%",
              }}
            >
              <div
                style={{
                  flex: 1,
                  width: "100%",
                  display: "flex",
                  alignItems: "flex-end",
                }}
              >
                <div
                  title={d.label}
                  style={{
                    width: "100%",
                    height: `${(d.value / top) * 100}%`,
                    borderRadius: "4px 4px 2px 2px",
                    background: on
                      ? "linear-gradient(180deg,#2C6EF2 0%,#1543A3 100%)"
                      : "var(--grad-bar)",
                    boxShadow: on ? "0 0 0 3px rgba(44,110,242,.16)" : "none",
                    transition: "height var(--dur-slow) var(--ease-standard)",
                  }}
                />
              </div>
              <span
                style={{
                  fontSize: "10px",
                  color: on ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                {d.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
