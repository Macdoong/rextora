import type { SVGProps } from "react";
import {
  BarChart3,
  Gauge,
  LineChart,
  Menu,
  Search,
  Settings,
  Shield,
  Target,
  Users,
} from "lucide-react";

const SIZE = 18;

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function wrap(
  Icon: typeof Gauge,
  { size = SIZE, ...props }: IconProps,
) {
  return (
    <Icon
      size={size}
      strokeWidth={1.75}
      aria-hidden="true"
      {...props}
    />
  );
}

export function NavIcon({
  id,
  className,
  size,
}: {
  id: string;
  className?: string;
  size?: number;
}) {
  const props = { className, size };
  switch (id) {
    case "dashboard":
      return wrap(Gauge, props);
    case "strategy-search":
    case "research":
      return wrap(Search, props);
    case "results":
    case "strategy":
      return wrap(BarChart3, props);
    case "backtest":
      return wrap(LineChart, props);
    case "paper-trading":
    case "paper":
      return wrap(BarChart3, props);
    case "live-trading":
    case "live-gate":
    case "approval":
    case "live":
      return wrap(Target, props);
    case "risk":
      return wrap(Shield, props);
    case "settings":
      return wrap(Settings, props);
    case "admin-users":
      return wrap(Users, props);
    case "menu":
    case "full-menu":
      return wrap(Menu, props);
    default:
      return wrap(Gauge, props);
  }
}
