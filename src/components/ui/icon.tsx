import {
  Archive,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BarChart2,
  Bell,
  Briefcase,
  Building2,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Circle,
  CircleAlert,
  CircleCheckBig,
  Clock,
  CreditCard,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gem,
  Inbox,
  Layers,
  LayoutDashboard,
  Lock,
  LogOut,
  Mail,
  Megaphone,
  Minus,
  Package,
  PanelLeft,
  Paperclip,
  PenLine,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  TriangleAlert,
  Truck,
  User,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Lucide is the design system's icon set. The published system masks SVGs from
 * a CDN; here they come from the `lucide-react` package instead, so icons are
 * self-hosted (no runtime CDN fetch, and no cross-origin mask failures) while
 * staying the same drawings. Names stay kebab-case to match the design system.
 */
const ICONS = {
  "alert-triangle": TriangleAlert,
  archive: Archive,
  "arrow-down": ArrowDown,
  "arrow-left": ArrowLeft,
  "arrow-right": ArrowRight,
  "arrow-up": ArrowUp,
  "bar-chart-2": BarChart2,
  bell: Bell,
  briefcase: Briefcase,
  "building-2": Building2,
  calendar: Calendar,
  check: Check,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  "chevrons-up-down": ChevronsUpDown,
  circle: Circle,
  "check-circle-2": CircleCheckBig,
  "circle-alert": CircleAlert,
  clock: Clock,
  "credit-card": CreditCard,
  "external-link": ExternalLink,
  eye: Eye,
  "eye-off": EyeOff,
  "file-text": FileText,
  gem: Gem,
  inbox: Inbox,
  layers: Layers,
  "layout-dashboard": LayoutDashboard,
  lock: Lock,
  "log-out": LogOut,
  mail: Mail,
  megaphone: Megaphone,
  minus: Minus,
  "more-horizontal": Ellipsis,
  package: Package,
  "panel-left": PanelLeft,
  paperclip: Paperclip,
  "pen-line": PenLine,
  plus: Plus,
  "refresh-cw": RefreshCw,
  search: Search,
  send: Send,
  settings: Settings,
  "shield-check": ShieldCheck,
  "sliders-horizontal": SlidersHorizontal,
  sparkles: Sparkles,
  "trash-2": Trash2,
  "trending-up": TrendingUp,
  truck: Truck,
  user: User,
  users: Users,
  wallet: Wallet,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

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
  const Glyph = ICONS[name as IconName] ?? Circle;

  return (
    <Glyph
      aria-hidden="true"
      size={size}
      color={color}
      className={className}
      style={{ flex: "0 0 auto", ...style }}
    />
  );
}
