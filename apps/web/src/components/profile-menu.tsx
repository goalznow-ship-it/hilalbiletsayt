"use client";

import { Menu } from "@base-ui/react/menu";
import { ChevronDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useSession } from "@/components/session-provider";
import { roleLabels } from "@/lib/navigation";

export function ProfileMenu() {
  const { user, clearSession } = useSession();
  const router = useRouter();
  if (!user) return null;
  const initials = user.fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("");
  return (
    <Menu.Root>
      <Menu.Trigger
        render={
          <Button
            variant="ghost"
            className="profile-trigger"
            aria-label="Hesab menyusu"
          />
        }
      >
        <span className="user-summary">
          <span className="avatar">{initials}</span>
          <span className="user-summary-copy">
            <strong>{user.fullName}</strong>
            <span>{roleLabels[user.role ?? ""] ?? "İstifadəçi"}</span>
          </span>
        </span>
        <ChevronDown size={13} aria-hidden="true" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner
          sideOffset={10}
          align="end"
          className="profile-menu-positioner"
        >
          <Menu.Popup className="profile-menu">
            <div className="profile-menu-heading">
              <strong>{user.fullName}</strong>
              <span>{user.email}</span>
              <span>{roleLabels[user.role ?? ""] ?? "İstifadəçi"}</span>
            </div>
            <Menu.Item
              className="profile-menu-item"
              onClick={() => {
                clearSession();
                router.replace("/login");
              }}
            >
              <LogOut size={16} aria-hidden="true" /> Bu brauzerdə sessiyanı
              bağla
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
