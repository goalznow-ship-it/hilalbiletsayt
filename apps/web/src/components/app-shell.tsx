"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment, useState } from "react";
import { ChevronDown, LogIn, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { navigation } from "@/lib/navigation";
import { ProfileMenu } from "@/components/profile-menu";
import { useSession } from "@/components/session-provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { user, selectedBranch, selectBranch } = useSession();
  if (pathname === "/login" || pathname.startsWith("/auth/"))
    return <>{children}</>;
  const current =
    navigation.find((item) => pathname === item.href) ?? navigation[0];
  const central = ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(user?.role ?? "");
  const sidebar = (
    <>
      <Link
        href="/dashboard"
        className="brand-lockup"
        aria-label="Hilal Bilet Sistemi — idarə paneli"
      >
        <Image
          src="/branding/hilal-logo.png"
          alt="Hilal Kursları"
          width={46}
          height={46}
          priority
        />
        <span>
          Hilal<span>Bilet Sistemi</span>
        </span>
      </Link>
      <div className="sidebar-caption">İDARƏETMƏ</div>
      <nav className="main-nav" aria-label="Əsas naviqasiya">
        {navigation.map(({ href, label, icon: Icon }, index) => (
          <Fragment key={href}>
            {index === 3 && (
              <div className="sidebar-caption nav-group-heading">
                İMTAHAN PROSESLƏRİ
              </div>
            )}
            {index === 8 && (
              <div className="sidebar-caption nav-group-heading">SİSTEM</div>
            )}
            <Link
              href={href}
              key={href}
              onClick={() => setOpen(false)}
              className={`nav-link ${index > 1 ? "is-upcoming" : ""} ${pathname === href ? "is-active" : ""}`}
              aria-current={pathname === href ? "page" : undefined}
            >
              <Icon aria-hidden="true" />
              <span>{label}</span>
              {index > 1 && (
                <>
                  <span className="nav-dot" aria-hidden="true" />
                  <span className="sr-only"> — Tezliklə</span>
                </>
              )}
            </Link>
          </Fragment>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <div className="sidebar-note">
          <strong>Hər şey bir yerdə.</strong>
          <p>İmtahandan nəticəyə qədər vahid iş sahəsi.</p>
        </div>
        <div className="sidebar-signature">
          <span>HİLAL KURSLARI</span>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-layout">
      <a href="#main-content" className="skip-link">
        Məzmuna keç
      </a>
      <aside className="desktop-sidebar">{sidebar}</aside>
      <div className="workspace">
        <header className="app-header">
          <div className="header-leading">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="mobile-menu"
                    aria-label="Menyunu aç"
                  />
                }
              >
                <Menu aria-hidden="true" />
              </SheetTrigger>
              <SheetContent side="left" className="mobile-sidebar">
                <SheetTitle className="sr-only">Əsas menyu</SheetTitle>
                <SheetDescription className="sr-only">
                  Hilal Bilet Sistemi bölmələri
                </SheetDescription>
                {sidebar}
              </SheetContent>
            </Sheet>
            <nav className="breadcrumb" aria-label="Səhifə yolu">
              <span>İş sahəsi</span>
              <span aria-hidden="true">/</span>
              <strong aria-current="page">{current.label}</strong>
            </nav>
          </div>
          <div className="header-trailing">
            {user && user.branches.length > 0 && (
              <div className="branch-picker">
                <label className="sr-only" htmlFor="branch-picker">
                  İşlədiyiniz filial
                </label>
                <select
                  id="branch-picker"
                  value={selectedBranch}
                  onChange={(e) => selectBranch(e.target.value)}
                >
                  {central && <option value="">Bütün filiallar</option>}
                  {user.branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} aria-hidden="true" />
              </div>
            )}
            {user ? (
              <ProfileMenu />
            ) : (
              <Link className="login-link" href="/login">
                <LogIn size={16} aria-hidden="true" /> Hesaba daxil ol
              </Link>
            )}
          </div>
        </header>
        <main id="main-content" className="page-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Hilal Kursları</span>
          <span>İmtahan və bilet idarəetmə platforması</span>
        </footer>
      </div>
    </div>
  );
}
