"use client";

import { useState } from "react";
import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from "react";
import { Icon } from "./icon";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "ghost"
  | "outline"
  | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const BASE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  fontFamily: "var(--font-body)",
  fontWeight: 600,
  borderRadius: "var(--radius-sm)",
  border: "1px solid transparent",
  cursor: "pointer",
  whiteSpace: "nowrap",
  transition:
    "background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), transform var(--dur-instant) var(--ease-standard)",
};

const SIZES: Record<ButtonSize, CSSProperties> = {
  sm: { height: "var(--control-height-sm)", padding: "0 12px", fontSize: "12px" },
  md: { height: "var(--control-height)", padding: "0 16px", fontSize: "13px" },
  lg: { height: "44px", padding: "0 22px", fontSize: "14px" },
};

const VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--accent-primary)", color: "#fff" },
  secondary: {
    background: "var(--gray-0)",
    color: "var(--text-primary)",
    borderColor: "var(--border-default)",
    boxShadow: "var(--shadow-card)",
  },
  ghost: { background: "transparent", color: "var(--text-secondary)" },
  outline: {
    background: "transparent",
    color: "var(--text-primary)",
    borderColor: "var(--border-strong)",
  },
  danger: { background: "var(--status-negative)", color: "#fff" },
};

const HOVER: Record<ButtonVariant, CSSProperties> = {
  primary: { background: "var(--accent-primary-hover)" },
  secondary: { background: "var(--gray-50)" },
  ghost: { background: "var(--gray-100)", color: "var(--text-primary)" },
  outline: { background: "var(--surface-hover)" },
  danger: { background: "var(--red-400)" },
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: string;
  iconRight?: string;
  fullWidth?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth,
  disabled,
  children,
  style,
  type = "button",
  ...rest
}: ButtonProps) {
  const [hover, setHover] = useState(false);
  const [press, setPress] = useState(false);

  return (
    <button
      type={type}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => {
        setHover(false);
        setPress(false);
      }}
      onMouseDown={() => setPress(true)}
      onMouseUp={() => setPress(false)}
      {...rest}
      style={{
        ...BASE,
        ...SIZES[size],
        ...VARIANTS[variant],
        ...(hover && !disabled ? HOVER[variant] : null),
        width: fullWidth ? "100%" : undefined,
        transform: press && !disabled ? "scale(var(--press-scale))" : "none",
        opacity: disabled ? 0.45 : 1,
        pointerEvents: disabled ? "none" : undefined,
        ...style,
      }}
    >
      {icon && <Icon name={icon} size={size === "sm" ? 14 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 14 : 16} />}
    </button>
  );
}
