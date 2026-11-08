import {
  LayoutDashboard,
  Building2,
  UsersRound,
  GraduationCap,
  Ticket,
  ScanLine,
  ScanQrCode,
  ListChecks,
  ChartNoAxesCombined,
  Settings2,
  FileText,
  LockKeyhole,
} from "lucide-react";

const CENTRAL = ["SUPER_ADMIN", "CENTRAL_ADMIN"];
const SALES = [...CENTRAL, "BRANCH_MANAGER", "SELLER"];

export type NavGroup = "manage" | "exam" | "system";

/** `roles` lists who sees the item; the API enforces the same rules. */
export const navigation = [
  { href: "/dashboard", label: "İdarə paneli", icon: LayoutDashboard, group: "manage" as NavGroup },
  { href: "/dashboard/branches", label: "Filiallar", icon: Building2, group: "manage" as NavGroup, roles: CENTRAL },
  { href: "/dashboard/users", label: "İşçilər və satıcılar", icon: UsersRound, group: "manage" as NavGroup, roles: CENTRAL },
  { href: "/dashboard/exams", label: "İmtahanlar", icon: GraduationCap, group: "exam" as NavGroup, roles: [...CENTRAL, "BRANCH_MANAGER"] },
  { href: "/dashboard/questions", label: "Sual bankı", icon: FileText, group: "exam" as NavGroup, roles: CENTRAL },
  { href: "/examinations", label: "Bilet kassası", icon: Ticket, group: "exam" as NavGroup, roles: SALES },
  { href: "/dashboard/tickets", label: "Bilet satışı", icon: Ticket, group: "exam" as NavGroup, roles: SALES },
  { href: "/dashboard/scan", label: "Girişdə yoxlama", icon: ScanQrCode, group: "exam" as NavGroup, roles: SALES },
  { href: "/dashboard/day-closure", label: "Günün bağlanması", icon: LockKeyhole, group: "exam" as NavGroup, roles: SALES },
  { href: "/dashboard/omr", label: "OMR skan", icon: ScanLine, group: "exam" as NavGroup, roles: [...CENTRAL, "BRANCH_MANAGER", "OMR_OPERATOR"] },
  { href: "/dashboard/results", label: "Nəticələr", icon: ListChecks, group: "exam" as NavGroup, roles: [...CENTRAL, "OMR_OPERATOR"] },
  { href: "/dashboard/reports", label: "Hesabatlar", icon: ChartNoAxesCombined, group: "system" as NavGroup, roles: SALES },
  { href: "/dashboard/settings", label: "Tənzimləmələr", icon: Settings2, group: "system" as NavGroup, roles: CENTRAL, upcoming: false },
];

export function visibleNavigation(roles: string[]) {
  return navigation.filter((item) => !item.roles || item.roles.some((role) => roles.includes(role)));
}

export const roleLabels: Record<string, string> = {
  SUPER_ADMIN: "Super administrator",
  CENTRAL_ADMIN: "Mərkəzi administrator",
  BRANCH_MANAGER: "Filial rəhbəri",
  SELLER: "Satıcı",
  OMR_OPERATOR: "OMR operatoru",
};
