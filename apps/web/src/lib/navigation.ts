import {
  LayoutDashboard,
  Building2,
  UsersRound,
  GraduationCap,
  Ticket,
  ScanLine,
  ListChecks,
  ChartNoAxesCombined,
  Settings2,
} from "lucide-react";

export const navigation = [
  { href: "/dashboard", label: "İdarə paneli", icon: LayoutDashboard },
  { href: "/dashboard/branches", label: "Filiallar", icon: Building2 },
  { href: "/dashboard/users", label: "İşçilər və satıcılar", icon: UsersRound },
  { href: "/dashboard/exams", label: "İmtahanlar", icon: GraduationCap },
  { href: "/dashboard/tickets", label: "Bilet satışı", icon: Ticket },
  { href: "/dashboard/omr", label: "OMR skan", icon: ScanLine },
  { href: "/dashboard/results", label: "Nəticələr", icon: ListChecks },
  {
    href: "/dashboard/reports",
    label: "Hesabatlar",
    icon: ChartNoAxesCombined,
  },
  { href: "/dashboard/settings", label: "Tənzimləmələr", icon: Settings2 },
];

export const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super administrator",
  CENTRAL_ADMIN: "Mərkəzi administrator",
  BRANCH_MANAGER: "Filial rəhbəri",
  SELLER: "Satıcı",
  OMR_OPERATOR: "OMR operatoru",
};
