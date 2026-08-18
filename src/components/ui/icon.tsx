import type { CSSProperties } from "react";

/**
 * Lucide is the design system's icon set. Glyphs are masked rather than inlined
 * so every icon inherits the current text color — see the design system readme.
 */
const LUCIDE_CDN = "https://unpkg.com/lucide-static@0.451.0/icons/";

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({
  name,
  size = 18,
  color = "currentColor",
  className,
  style,
}: IconProps) {
  const url = `url("${LUCIDE_CDN}${name}.svg")`;
  return (
    <span
      aria-hidden="true"
      className={className}
      style={{
        display: "inline-block",
        width: size,
        height: size,
        flex: "0 0 auto",
        background: color,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskPosition: "center",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        ...style,
      }}
    />
  );
}
