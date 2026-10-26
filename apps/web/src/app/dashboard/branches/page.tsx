"use client";

import { useEffect, useRef, useState } from "react";
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  LoaderCircle,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PageHeader,
  EmptyState,
  ErrorMessage,
  StatusBadge,
} from "@/components/page-ui";
import { type Branch, useSession } from "@/components/session-provider";
import { useBranches } from "@/hooks/use-branches";

type BranchValues = {
  name: string;
  code: string;
  address: string;
  phone: string;
  isActive: boolean;
};
const emptyValues: BranchValues = {
  name: "",
  code: "",
  address: "",
  phone: "",
  isActive: true,
};
const PAGE_SIZE = 8;

export default function BranchesPage() {
  const { user, request, selectedBranch } = useSession();
  const { branches, loading, error, reload } = useBranches();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<Branch | "new" | null>(null);
  const [values, setValues] = useState<BranchValues>(emptyValues);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const confirmation = useRef<HTMLDialogElement>(null);
  const canManage = (user?.roles ?? [user?.role]).some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role ?? ""),
  );
  useEffect(() => {
    if (editor && user) dialog.current?.showModal();
    else dialog.current?.close();
  }, [editor, user]);
  useEffect(() => {
    if (confirming && user) confirmation.current?.showModal();
    else confirmation.current?.close();
  }, [confirming, user]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5500);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const matches = branches.filter(
    (b) =>
      (!selectedBranch || b.id === selectedBranch) &&
      `${b.name} ${b.code} ${b.phone ?? ""} ${b.address ?? ""}`
        .toLocaleLowerCase("az")
        .includes(search.toLocaleLowerCase("az")) &&
      (filter === "all" || (filter === "phone" ? !!b.phone : !!b.address)),
  );
  const pageCount = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * PAGE_SIZE;
  const openEditor = (branch: Branch | "new") => {
    setFormError("");
    setValues(
      branch === "new"
        ? emptyValues
        : {
            name: branch.name,
            code: branch.code,
            address: branch.address ?? "",
            phone: branch.phone ?? "",
            isActive: branch.isActive,
          },
    );
    setEditor(branch);
  };
  const save = async () => {
    if (!canManage || !editor) return;
    setSaving(true);
    setFormError("");
    try {
      await request<Branch>(
        editor === "new"
          ? "/branches"
          : `/branches/${encodeURIComponent(editor.id)}`,
        {
          method: editor === "new" ? "POST" : "PATCH",
          body: JSON.stringify({
            name: values.name.trim(),
            code: values.code.trim(),
            address: values.address.trim(),
            phone: values.phone.trim(),
            isActive: values.isActive,
          }),
        },
      );
      setNotice(
        editor === "new"
          ? "Yeni filial yaradıldı."
          : "Filial məlumatları yeniləndi.",
      );
      setConfirming(false);
      setEditor(null);
      reload();
    } catch (cause) {
      setConfirming(false);
      setFormError(
        cause instanceof Error ? cause.message : "Filial yadda saxlanılmadı.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="STRUKTUR VƏ İDARƏETMƏ"
        title="Filiallar"
        description="Filiallarınızı və əlaqə məlumatlarını bir yerdən idarə edin."
        action={
          canManage ? (
            <Button onClick={() => openEditor("new")}>
              <Plus aria-hidden="true" /> Yeni filial
            </Button>
          ) : undefined
        }
      />
      <div className="branch-summary">
        <div className="summary-icon">
          <Building2 aria-hidden="true" />
        </div>
        <div>
          <strong>
            {user && !error && !loading ? matches.length : "—"}
            <span>aktiv filial</span>
          </strong>
          <p>Siyahıda yalnız aktiv filiallar göstərilir.</p>
        </div>
        <span className="quiet-label">Vahid filial şəbəkəsi</span>
      </div>
      <section
        className="surface branches-surface"
        aria-label="Filial siyahısı"
      >
        <div className="table-toolbar">
          <div className="search-input">
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="branch-search">
              Filial axtar
            </label>
            <Input
              id="branch-search"
              type="search"
              placeholder="Ad, kod və ya əlaqə məlumatı ilə axtar…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="table-filters">
            <SlidersHorizontal size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="branch-filter">
              Əlaqə məlumatına görə süz
            </label>
            <select
              id="branch-filter"
              value={filter}
              onChange={(e) => {
                setFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Bütün aktiv filiallar</option>
              <option value="phone">Telefonu olanlar</option>
              <option value="address">Ünvanı olanlar</option>
            </select>
          </div>
        </div>
        {!user ? (
          <EmptyState
            icon={Building2}
            title="Filiallarınıza giriş əldə edin"
            description="Sizə aid filialları görmək üçün hesabınıza daxil olun."
          >
            <Link href="/login" className="text-link">
              Hesaba daxil ol
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
            {[0, 1, 2, 3].map((i) => (
              <Skeleton className="row-skeleton" key={i} />
            ))}
          </div>
        ) : matches.length ? (
          <>
            <div
              className="table-scroll"
              role="region"
              aria-label="Filiallar cədvəli"
              tabIndex={0}
            >
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">Filial</th>
                    <th scope="col">Əlaqə məlumatları</th>
                    <th scope="col">Status</th>
                    {canManage && (
                      <th scope="col">
                        <span className="sr-only">Əməliyyatlar</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {matches.slice(start, start + PAGE_SIZE).map((branch) => (
                    <tr key={branch.id}>
                      <td>
                        <div className="table-branch">
                          <span className="branch-monogram">
                            {branch.code.slice(0, 2)}
                          </span>
                          <div>
                            <strong>{branch.name}</strong>
                            <span className="branch-code">{branch.code}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="contact-lines">
                          <span>
                            <Phone aria-hidden="true" />
                            {branch.phone || "Telefon əlavə edilməyib"}
                          </span>
                          <span>
                            <MapPin aria-hidden="true" />
                            {branch.address || "Ünvan əlavə edilməyib"}
                          </span>
                        </div>
                      </td>
                      <td>
                        <StatusBadge active={branch.isActive} />
                      </td>
                      {canManage && (
                        <td className="actions-cell">
                          <Button
                            size="icon"
                            variant="ghost"
                            aria-label={`${branch.name} filialını redaktə et`}
                            onClick={() => openEditor(branch)}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="table-pagination">
              <span>
                {matches.length} filialdan {start + 1}–
                {Math.min(start + PAGE_SIZE, matches.length)} göstərilir
              </span>
              <div>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Əvvəlki səhifə"
                  disabled={currentPage <= 1}
                  onClick={() => setPage(currentPage - 1)}
                >
                  <ChevronLeft aria-hidden="true" />
                </Button>
                <span>
                  {currentPage} / {pageCount}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  aria-label="Növbəti səhifə"
                  disabled={currentPage >= pageCount}
                  onClick={() => setPage(currentPage + 1)}
                >
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState
            icon={search || filter !== "all" ? Search : Building2}
            title={
              search || filter !== "all"
                ? "Uyğun filial tapılmadı"
                : "İlk filialınızdan başlayın"
            }
            description={
              search || filter !== "all"
                ? "Axtarış sözünü və ya filtri dəyişərək yenidən yoxlayın."
                : "Filial yaradıldıqda adı, kodu və əlaqə məlumatları burada görünəcək."
            }
          >
            {search || filter !== "all" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Filtrləri təmizlə
              </Button>
            ) : canManage ? (
              <Button onClick={() => openEditor("new")}>
                <Plus aria-hidden="true" /> Yeni filial
              </Button>
            ) : null}
          </EmptyState>
        )}
      </section>
      <p className="table-footnote">
        Siyahının səhifələnməsi yüklənmiş aktiv filiallar üzrə aparılır.
      </p>
      <dialog
        ref={dialog}
        className="app-dialog"
        aria-labelledby="branch-dialog-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!saving) setEditor(null);
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editor !== "new" && !values.isActive) setConfirming(true);
            else void save();
          }}
        >
          <div className="dialog-heading">
            <div>
              <span className="eyebrow">FİLİAL MƏLUMATLARI</span>
              <h2 id="branch-dialog-title">
                {editor === "new" ? "Yeni filial" : "Filialı redaktə et"}
              </h2>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={saving}
              onClick={() => setEditor(null)}
              aria-label="Pəncərəni bağla"
            >
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="dialog-body">
            {formError && (
              <div className="error-message" role="alert">
                <CircleAlert aria-hidden="true" />
                <p>{formError}</p>
              </div>
            )}
            <div className="field">
              <label htmlFor="branch-name">
                Filial adı <span aria-hidden="true">*</span>
              </label>
              <Input
                id="branch-name"
                autoFocus
                required
                maxLength={160}
                disabled={saving}
                value={values.name}
                onChange={(e) => setValues({ ...values, name: e.target.value })}
                placeholder="Filialın adı"
                pattern=".*\S.*"
              />
            </div>
            <div className="field">
              <label htmlFor="branch-code">
                Filial kodu <span aria-hidden="true">*</span>
              </label>
              <Input
                id="branch-code"
                required
                maxLength={40}
                disabled={saving}
                value={values.code}
                onChange={(e) => setValues({ ...values, code: e.target.value })}
                placeholder="Məsələn: BAK-01"
                pattern=".*\S.*"
                aria-describedby="code-help"
              />
              <p className="field-hint" id="code-help">
                Hər filial üçün unikal kod daxil edin.
              </p>
            </div>
            <div className="field">
              <label htmlFor="branch-phone">Telefon</label>
              <Input
                id="branch-phone"
                type="tel"
                maxLength={50}
                disabled={saving}
                value={values.phone}
                onChange={(e) =>
                  setValues({ ...values, phone: e.target.value })
                }
                placeholder="Əlaqə nömrəsi"
              />
            </div>
            <div className="field">
              <label htmlFor="branch-address">Ünvan</label>
              <Input
                id="branch-address"
                maxLength={300}
                disabled={saving}
                value={values.address}
                onChange={(e) =>
                  setValues({ ...values, address: e.target.value })
                }
                placeholder="Filialın ünvanı"
              />
            </div>
            {editor !== "new" && (
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={values.isActive}
                  disabled={saving}
                  onChange={(e) =>
                    setValues({ ...values, isActive: e.target.checked })
                  }
                />{" "}
                Filial aktivdir
              </label>
            )}
          </div>
          <div className="dialog-footer">
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => setEditor(null)}
            >
              Ləğv et
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <LoaderCircle className="spin" aria-hidden="true" />{" "}
                  Saxlanılır…
                </>
              ) : (
                "Yadda saxla"
              )}
            </Button>
          </div>
        </form>
      </dialog>
      <dialog
        ref={confirmation}
        className="app-dialog confirmation-dialog"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
        onCancel={(e) => {
          e.preventDefault();
          if (!saving) setConfirming(false);
        }}
      >
        <div className="dialog-body">
          <div className="confirmation-icon">
            <CircleAlert aria-hidden="true" />
          </div>
          <h2 id="confirmation-title">Filial deaktiv edilsin?</h2>
          <p id="confirmation-description">
            “{values.name}” aktiv filiallar siyahısından və yeni ictimai
            sifarişlərdə ödəniş seçimindən çıxarılacaq.
          </p>
        </div>
        <div className="dialog-footer">
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setConfirming(false)}
          >
            Geri qayıt
          </Button>
          <Button
            variant="destructive"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? "Saxlanılır…" : "Deaktiv et"}
          </Button>
        </div>
      </dialog>
      {notice && (
        <div className="toast" role="status">
          <span className="tiny-dot" aria-hidden="true" />
          {notice}
          <button aria-label="Bildirişi bağla" onClick={() => setNotice("")}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
