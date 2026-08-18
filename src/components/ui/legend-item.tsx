import type { CSSProperties } from "react";

export interface LegendItemProps {
  color: string;
  label: string;
  percent?: string;
  detail?: { left: string; right: string };
  style?: CSSProperties;
}

export function LegendItem({
  color,
  label,
  percent,
  detail,
  style,
}: LegendItemProps) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", ...style }}>
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          marginTop: "5px",
          flex: "0 0 auto",
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            fontSize: "12px",
          }}
        >
          <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
            {label}
          </span>
          <span
            style={{
              color: "var(--text-primary)",
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {percent}
          </span>
        </div>
        {detail && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              fontSize: "10px",
              color: "var(--text-muted)",
              marginTop: "2px",
            }}
          >
            <span>{detail.left}</span>
            <span>{detail.right}</span>
          </div>
        )}
      </div>
    </div>
  );
}
