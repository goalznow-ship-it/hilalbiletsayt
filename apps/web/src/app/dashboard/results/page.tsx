"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Button } from "@/components/ui/button";

type ExamResults = {
  examId: string;
  code: string;
  title: string;
  publishedAt: string | null;
  completed: number;
  review: number;
  duplicate: number;
  processing: number;
};

export default function ResultsPage() {
  const { user, initializing, request } = useSession();
  const [rows, setRows] = useState<ExamResults[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const central = (user?.roles ?? []).some((role) =>
    ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role),
  );

  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!user) return;
    let active = true;
    request<ExamResults[]>("/results/exams")
      .then((data) => {
        if (!active) return;
        setRows(data);
        setError("");
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : "Məlumat alınmadı.");
      });
    return () => {
      active = false;
    };
  }, [user, request, reload]);

  async function toggle(row: ExamResults) {
    const publish = !row.publishedAt;
    if (!window.confirm(publish
      ? `${row.code}: ${row.completed} nəticə namizədlər üçün açılsın?`
      : `${row.code}: nəticələr ictimai baxışdan gizlədilsin?`)) return;
    setBusy(row.examId);
    try {
      await request(`/results/exams/${row.examId}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
      setReload((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Əməliyyat tamamlanmadı.");
    } finally {
      setBusy("");
    }
  }

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return (
    <>
      <PageHeader
        title="Nəticələr"
        description="Nəticələr dərc edilənə qədər namizədlərə göstərilmir. Yoxlama növbəsi boş olmalıdır."
      />
      {error && <p role="alert" className="mb-4 text-destructive">{error}</p>}
      {!rows ? (
        <p role="status">Yüklənir…</p>
      ) : rows.length === 0 ? (
        <p>İmtahan yoxdur.</p>
      ) : (
        <div className="data-table-wrap">
          <table className="data-table">
            <caption className="sr-only">İmtahanlar üzrə nəticələrin vəziyyəti</caption>
            <thead>
              <tr>
                <th scope="col">İmtahan</th>
                <th scope="col">Hazır</th>
                <th scope="col">Yoxlamada</th>
                <th scope="col">Təkrar</th>
                <th scope="col">Vəziyyət</th>
                {central && <th scope="col"><span className="sr-only">Əməliyyat</span></th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.examId}>
                  <td>
                    <strong>{row.code}</strong>
                    <br />
                    {row.title}
                  </td>
                  <td>{row.completed}</td>
                  <td>
                    {row.review > 0 ? (
                      <Link href="/dashboard/omr">{row.review} vərəq</Link>
                    ) : 0}
                  </td>
                  <td>{row.duplicate}</td>
                  <td>
                    {row.publishedAt
                      ? `Dərc edilib (${new Date(row.publishedAt).toLocaleDateString("az-AZ")})`
                      : row.processing > 0 ? "Emal olunur" : "Dərc edilməyib"}
                  </td>
                  {central && (
                    <td>
                      <Button
                        variant={row.publishedAt ? "outline" : "default"}
                        className="min-h-[44px]"
                        disabled={!!busy || (!row.publishedAt && (row.review > 0 || row.processing > 0 || row.completed === 0))}
                        onClick={() => toggle(row)}
                        aria-label={`${row.code} nəticələrini ${row.publishedAt ? "gizlət" : "dərc et"}`}
                      >
                        {row.publishedAt ? "Gizlət" : "Dərc et"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-6 text-sm text-muted-foreground">
        Namizədlər nəticəni <Link href="/results">ictimai yoxlama səhifəsində</Link> bilet
        QR kodu və ya kodu, həmçinin namizəd nömrəsi ilə görür.
      </p>
    </>
  );
}
