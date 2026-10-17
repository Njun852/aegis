import { Icon } from "@/components/ui";

export interface StatTile {
  label: string;
  value: string;
  icon: string;
  /** "accent" for the headline figure, "alert" when it needs attention. */
  tone?: "accent" | "alert" | "plain";
}

const TONES = {
  accent: { bg: "var(--accent-soft)", fg: "var(--accent-primary)" },
  alert: { bg: "var(--status-negative-soft)", fg: "var(--status-negative)" },
  plain: { bg: "var(--surface-inset)", fg: "var(--text-secondary)" },
};

/** The row of four figures each Finance tab opens with. */
export function StatTiles({ tiles }: { tiles: StatTile[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 wide:grid-cols-4">
      {tiles.map((tile) => {
        const tone = TONES[tile.tone ?? "plain"];
        return (
          <div
            key={tile.label}
            style={{
              background: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-md)",
              boxShadow: "var(--shadow-card)",
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: "11px",
              minWidth: 0,
            }}
          >
            <span style={{ width: 32, height: 32, flex: "0 0 auto", borderRadius: "9px", background: tone.bg, color: tone.fg, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name={tile.icon} size={15} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2, minWidth: 0 }}>
              <span style={{ fontFamily: "var(--font-display)", fontSize: "19px", fontWeight: 700, letterSpacing: "-.02em", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tile.value}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {tile.label}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
