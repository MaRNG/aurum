import {
  ArrowLeftRight,
  BarChart3,
  CalendarDays,
  Database,
  LayoutDashboard,
  Lightbulb,
  Landmark,
  ListOrdered,
  PieChart,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Fáze, ve které se sekce implementuje; `undefined` = hotovo. */
  phase?: number;
  /** Začíná novou skupinu v navigaci. */
  group?: boolean;
}

export const NAV: NavItem[] = [
  { to: "/", label: "Přehled", icon: LayoutDashboard },
  { to: "/mesice", label: "Měsíce", icon: CalendarDays },
  { to: "/transakce", label: "Transakce", icon: ListOrdered },
  { to: "/ucty", label: "Účty", icon: Landmark },
  { to: "/cashflow", label: "Cashflow", icon: ArrowLeftRight, group: true },
  { to: "/statistiky", label: "Statistiky", icon: BarChart3 },
  { to: "/analyza", label: "Analýza", icon: PieChart },
  { to: "/predikce", label: "Predikce", icon: TrendingUp },
  { to: "/insights", label: "Insights", icon: Lightbulb },
  { to: "/data", label: "Data", icon: Database, group: true },
  { to: "/nastaveni", label: "Nastavení", icon: Settings },
];
