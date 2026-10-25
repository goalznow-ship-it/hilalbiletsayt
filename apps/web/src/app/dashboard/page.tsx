"use client";

import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  GraduationCap,
  LogIn,
  ScanLine,
  Ticket,
  UsersRound,
} from "lucide-react";
import {
  PageHeader,
  EmptyState,
  ErrorMessage,
  StatusBadge,
} from "@/components/page-ui";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/components/session-provider";
import { useBranches } from "@/hooks/use-branches";

export default function DashboardPage() {
  const { user, selectedBranch } = useSession();
  const { branches, loading, error, reload } = useBranches();
  const visible = selectedBranch
    ? branches.filter((b) => b.id === selectedBranch)
    : branches;
  const available = !!user && !error && !loading;
  const firstName = user?.fullName.split(" ")[0];
  const metrics = [
    {
      title: "Aktiv filiallar",
      value: available ? String(visible.length).padStart(2, "0") : "—",
      note: available
        ? "Cari iş sahəsində"
        : loading
          ? "Məlumat yüklənir…"
          : error
            ? "Məlumat alınmadı"
            : "Hesabınıza daxil olun",
      icon: Building2,
      available,
    },
    {
      title: "İşçilər və satıcılar",
      value: "—",
      note: "İstifadəçi modulu hazırlanır",
      icon: UsersRound,
    },
    {
      title: "Satılmış biletlər",
      value: "—",
      note: "Satış modulu hazırlanır",
      icon: Ticket,
    },
    {
      title: "OMR nəticələri",
      value: "—",
      note: "Skan modulu hazırlanır",
      icon: ScanLine,
    },
  ];
  return (
    <>
      <PageHeader
        eyebrow="ÜMUMİ BAXIŞ"
        title={firstName ? `Xoş gördük, ${firstName}.` : "İdarə paneli"}
        description="Filiallarınız və gündəlik işləriniz bir baxışda."
      />
      <section className="overview-banner">
        <div>
          <span className="banner-eyebrow">SİZİN İŞ SAHƏNİZ</span>
          <h2>Diqqətiniz təhsildə qalsın.</h2>
          <p>İmtahan və bilet prosesləri üçün aydın, vahid idarəetmə.</p>
          <Link
            href={user ? "/dashboard/branches" : "/login"}
            className="banner-link"
          >
            {user ? "Filiallara bax" : "İş sahəsinə daxil ol"}
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <div className="banner-art" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
        <span className="banner-signature">Hilal Kursları</span>
      </section>
      <section
        className="metrics-grid"
        aria-label="Əsas göstəricilər"
        aria-busy={loading}
      >
        {metrics.map(({ title, value, note, icon: Icon, available: ready }) => (
          <article
            className={`metric ${ready ? "is-ready" : "is-unavailable"}`}
            key={title}
          >
            <div className="metric-top">
              <span>{title}</span>
              <Icon aria-hidden="true" />
            </div>
            {loading && title === "Aktiv filiallar" ? (
              <Skeleton className="metric-skeleton" />
            ) : (
              <strong className="metric-value">{value}</strong>
            )}
            <div className="metric-note">
              {ready && <span className="tiny-dot" aria-hidden="true" />}
              {note}
            </div>
          </article>
        ))}
      </section>
      <div className="dashboard-columns">
        <section className="surface branch-overview">
          <div className="section-heading">
            <div>
              <h2>Filiallara baxış</h2>
              <p>Aktiv filiallar və əlaqə məlumatları</p>
            </div>
            <Link href="/dashboard/branches" className="text-link">
              Hamısı <ArrowUpRight size={16} aria-hidden="true" />
            </Link>
          </div>
          {!user ? (
            <EmptyState
              icon={Building2}
              title="İş sahəniz sizi gözləyir"
              description="Filiallarınızı və sizə aid məlumatları görmək üçün hesabınıza daxil olun."
            >
              <Link href="/login" className="text-link">
                <LogIn size={16} aria-hidden="true" /> Hesaba daxil ol
              </Link>
            </EmptyState>
          ) : error ? (
            <ErrorMessage message={error} retry={reload} />
          ) : loading ? (
            <div
              className="loading-rows"
              aria-label="Filiallar yüklənir"
              aria-busy="true"
            >
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="row-skeleton" />
              ))}
            </div>
          ) : visible.length ? (
            <div className="branch-preview-list">
              {visible.slice(0, 4).map((branch) => (
                <div className="branch-preview" key={branch.id}>
                  <span className="branch-monogram">
                    {branch.code.slice(0, 2)}
                  </span>
                  <div>
                    <strong>{branch.name}</strong>
                    <span>{branch.address || "Ünvan əlavə edilməyib"}</span>
                  </div>
                  <StatusBadge active={branch.isActive} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Building2}
              title="Hələ aktiv filial yoxdur"
              description="Filial yaratmaq və ya mövcud siyahını yoxlamaq üçün Filiallar bölməsinə keçin."
            >
              <Link href="/dashboard/branches" className="text-link">
                Filiallara keç <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </EmptyState>
          )}
        </section>
        <section className="surface quick-actions">
          <div className="section-heading">
            <div>
              <h2>İş axını</h2>
              <p>Lazım olan bölməyə birbaşa keçid</p>
            </div>
          </div>
          <Link href="/dashboard/branches" className="workflow-link">
            <span className="workflow-icon">
              <Building2 aria-hidden="true" />
            </span>
            <div>
              <strong>Filialların idarə edilməsi</strong>
              <span>Filial və əlaqə məlumatları</span>
            </div>
            <ArrowUpRight aria-hidden="true" />
          </Link>
          <Link href="/dashboard/exams" className="workflow-link">
            <span className="workflow-icon">
              <GraduationCap aria-hidden="true" />
            </span>
            <div>
              <strong>İmtahanların təşkili</strong>
              <span>Tezliklə istifadəyə veriləcək</span>
            </div>
            <ArrowUpRight aria-hidden="true" />
          </Link>
          <Link href="/dashboard/tickets" className="workflow-link">
            <span className="workflow-icon">
              <Ticket aria-hidden="true" />
            </span>
            <div>
              <strong>Bilet satışı</strong>
              <span>Tezliklə istifadəyə veriləcək</span>
            </div>
            <ArrowUpRight aria-hidden="true" />
          </Link>
          <div className="insight-note">
            <p>
              Satış və nəticə göstəriciləri modullar istifadəyə verildikdə
              burada görünəcək.
            </p>
          </div>
        </section>
      </div>
      <div className="dashboard-footnote">
        <span className="tiny-dot" aria-hidden="true" />
        <span>Göstəricilər yalnız mövcud API məlumatlarına əsaslanır.</span>
      </div>
    </>
  );
}
