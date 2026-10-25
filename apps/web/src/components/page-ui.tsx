import type { LucideIcon } from "lucide-react";
import { CircleAlert, ArrowRight, Clock3 } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action && <div className="page-action">{action}</div>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Icon aria-hidden="true" />
      </div>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
    </div>
  );
}

export function ErrorMessage({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div className="error-message" role="alert">
      <CircleAlert aria-hidden="true" />
      <div>
        <strong>Məlumat alınmadı</strong>
        <p>{message}</p>
      </div>
      {retry && (
        <Button variant="outline" onClick={retry}>
          Yenidən cəhd et
        </Button>
      )}
    </div>
  );
}

export function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={`status-badge ${active ? "status-success" : "status-neutral"}`}
    >
      <span aria-hidden="true" />
      {active ? "Aktiv" : "Deaktiv"}
    </span>
  );
}

export function ModulePlaceholder({
  title,
  description,
  icon,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
}) {
  return (
    <>
      <PageHeader eyebrow="İŞ SAHƏSİ" title={title} description={description} />
      <section className="surface module-placeholder">
        <span className="soon-badge">
          <Clock3 size={14} aria-hidden="true" /> Tezliklə
        </span>
        <EmptyState
          icon={icon}
          title="Daha səliqəli iş axını hazırlanır"
          description="Bu modul hələ istifadəyə verilməyib. Hazır olduqda bütün əməliyyatları buradan idarə edə biləcəksiniz."
        >
          <Link className="text-link" href="/dashboard">
            İdarə panelinə qayıt <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </EmptyState>
      </section>
    </>
  );
}
