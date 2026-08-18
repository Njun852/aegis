import type { CSSProperties } from "react";

export interface AvatarProps {
  src?: string;
  name?: string;
  size?: number;
  square?: boolean;
  ring?: boolean;
  style?: CSSProperties;
}

export function Avatar({
  src,
  name = "",
  size = 36,
  square,
  ring,
  style,
}: AvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();

  return (
    <span
      style={{
        width: size,
        height: size,
        flex: "0 0 auto",
        borderRadius: square ? "var(--radius-sm)" : "50%",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--surface-inset)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-display)",
        fontWeight: 700,
        fontSize: Math.round(size * 0.36),
        letterSpacing: ".01em",
        boxShadow: ring ? "0 0 0 2px var(--accent-primary)" : "none",
        ...style,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials
      )}
    </span>
  );
}
