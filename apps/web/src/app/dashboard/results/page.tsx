"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/session-provider";
import { PageHeader } from "@/components/page-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type ExamResults = {
  examId: string;
  code: string;
  title: string;
  publishedAt: string | null;
  completed: number;
  review: number;
  duplicate: number;
  processing: number;
  averagePercent: number | null;
};

function readiness(row: ExamResults) {
  if (row.publishedAt) return "Nəticələr namizədlərə açıqdır.";
  if (row.processing) return `${row.processing} skanın emalı davam edir. Tamamlanmasını gözləyin.`;
  if (row.review) return `${row.review} vərəq yoxlanmalıdır. Şübhəli cavabları təsdiqlədikdən sonra dərc edə bilərsiniz.`;
  if (!row.completed) return "Hələ hazır nəticə yoxdur. Cavab kartlarını skan etməklə başlayın.";
  return "Bütün yoxlamalar tamamlanıb. Nəticələr dərcə hazırdır.";
}

export default function ResultsPage() {
  const { user, initializing, request } = useSession();
  const [rows, setRows] = useState<ExamResults[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const central = (user?.roles ?? (user?.role ? [user.role] : [])).some(role => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role));

  useEffect(() => {
    if (!user) return;
    let active = true;
    request<ExamResults[]>("/results/exams")
      .then(data => { if (active) { setRows(data); setError(""); } })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : "Nəticələr alınmadı."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [user, request, reload]);

  async function toggle(row: ExamResults) {
    const publish = !row.publishedAt;
    if (!window.confirm(publish
      ? `${row.code}: ${row.completed} nəticə və sualların düzgün cavabları namizədlərə açılsın?`
      : `${row.code}: nəticələr namizədlərdən gizlədilsin?`)) return;
    setBusy(row.examId); setError(""); setNotice("");
    try {
      const response = await request<{ publishedAt: string | null }>(`/results/exams/${row.examId}/${publish ? "publish" : "unpublish"}`, { method: "POST" });
      setRows(previous => previous?.map(item => item.examId === row.examId ? { ...item, publishedAt: response.publishedAt } : item) ?? null);
      setNotice(publish ? `${row.code}: nəticələr və düzgün cavablar dərc edildi.` : `${row.code}: nəticələr gizlədildi.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Əməliyyat tamamlanmadı.");
    } finally { setBusy(""); }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/results`);
      setNotice("Nəticə səhifəsinin keçidi kopyalandı. Namizədlərlə paylaşa bilərsiniz.");
    } catch { setError("Keçid kopyalanmadı. “Namizəd səhifəsini aç” keçidini brauzerdən kopyalaya bilərsiniz."); }
  }

  const visible = (rows ?? []).filter(row => {
    const matches = `${row.code} ${row.title}`.toLocaleLowerCase("az").includes(search.toLocaleLowerCase("az"));
    return matches && (filter === "all" || (filter === "published" ? !!row.publishedAt : filter === "review"
      ? row.review > 0 || row.processing > 0 : !row.publishedAt && row.completed > 0 && !row.review && !row.processing));
  });

  if (initializing) return <p role="status">Yüklənir…</p>;
  if (!user) return <Link href="/login">İdarəetmə panelinə daxil olun</Link>;
  return <div className="omr-workspace space-y-6">
    <PageHeader title="Nəticələri açıqlayın" description="Skanları yoxlayın, nəticələri dərc edin və namizədlərlə keçidi paylaşın." />
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4">
      <div className="w-full min-w-0 sm:w-auto sm:flex-1"><h2 className="font-semibold">Namizədlər üçün nəticə səhifəsi</h2>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">Namizəd öz bilet kodu və namizəd nömrəsi ilə balını və düzgün cavabları görür.</p>
      </div>
      <Link href="/results" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium">Namizəd səhifəsini aç</Link>
      <Button onClick={() => void copyLink()} variant="outline" className="min-h-11">Keçidi kopyala</Button>
    </div>
    <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_auto]">
      <label className="space-y-2 text-sm font-medium">İmtahan axtar
        <Input value={search} onChange={event => setSearch(event.target.value)} placeholder="İmtahanın adı və ya kodu" className="mt-2 min-h-11" />
      </label>
      <label className="space-y-2 text-sm font-medium">Nəticələrin vəziyyəti
        <select value={filter} onChange={event => setFilter(event.target.value)} className="block min-h-11 w-full rounded-lg border border-border bg-card px-3">
          <option value="all">Bütün imtahanlar</option><option value="ready">Dərcə hazır</option>
          <option value="review">Yoxlama gözləyir</option><option value="published">Dərc edilib</option>
        </select>
      </label>
      <Button variant="outline" className="min-h-11" disabled={loading || !!busy} onClick={() => { setLoading(true); setReload(value => value + 1); }}>{loading ? "Yenilənir…" : "Yenilə"}</Button>
    </div>
    {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">{notice}</p>}
    {!rows && loading ? <div role="status" className="space-y-3"><span className="sr-only">Nəticələr yüklənir…</span>
      {[1, 2].map(item => <div key={item} className="h-44 rounded-xl border bg-muted" />)}</div>
    : !visible.length && !error ? <div className="rounded-xl border border-dashed p-8 text-center">
      <h2 className="font-semibold">{rows?.length ? "Axtarışa uyğun imtahan yoxdur" : "Hələ imtahan yoxdur"}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{rows?.length ? "Axtarışı və ya vəziyyət süzgəcini dəyişin." : "İmtahan yaratdıqdan sonra nəticələri burada idarə edə bilərsiniz."}</p>
    </div> : <div className="space-y-4">{visible.map(row => {
      const ready = row.completed > 0 && !row.review && !row.processing;
      return <article key={row.examId} className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <header className="flex flex-wrap justify-between gap-3">
          <div><p className="text-xs font-semibold tracking-wide text-primary">{row.code}</p><h2 className="mt-1 text-lg font-semibold">{row.title}</h2></div>
          <span className={`h-fit rounded-full px-3 py-1 text-xs font-semibold ${row.publishedAt ? "bg-emerald-50 text-emerald-800" : ready ? "bg-primary/10 text-primary" : "bg-amber-50 text-amber-900"}`}>
            {row.publishedAt ? "Dərc edilib" : ready ? "Dərcə hazır" : "Hazırlanır"}
          </span>
        </header>
        <dl className="my-5 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-border py-4 sm:grid-cols-4">
          <div><dt className="text-sm text-muted-foreground">Hazır nəticə</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{row.completed}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Yoxlamada</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{row.review}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Emal olunur</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{row.processing}</dd></div>
          <div><dt className="text-sm text-muted-foreground">Orta nəticə</dt><dd className="mt-1 text-2xl font-semibold tabular-nums">{row.averagePercent === null ? "—" : `${row.averagePercent.toFixed(1)}%`}</dd></div>
        </dl>
        <p className="text-sm text-muted-foreground">{readiness(row)}</p>
        {row.duplicate > 0 && <p className="mt-2 text-sm text-muted-foreground">{row.duplicate} təkrar skan nəticələri dəyişmir.</p>}
        {row.publishedAt && <p className="mt-2 text-sm text-muted-foreground">Dərc tarixi: {new Date(row.publishedAt).toLocaleString("az-AZ")}</p>}
        <div className="mt-5 flex flex-wrap gap-3">
          {central && <Button variant={row.publishedAt ? "outline" : "default"} className="min-h-11" disabled={!!busy || (!row.publishedAt && !ready)}
            onClick={() => void toggle(row)} aria-label={`${row.code} nəticələrini ${row.publishedAt ? "gizlət" : "dərc et"}`}>
            {busy === row.examId ? "Saxlanılır…" : row.publishedAt ? "Nəticələri gizlət" : "Nəticələri dərc et"}
          </Button>}
          <Link href={`/dashboard/omr/results?examId=${row.examId}${row.review ? "&status=REVIEW" : ""}`}
            className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-sm font-medium">{row.review ? "Yoxlanacaq skanlara bax" : "Skanlara və hesabata bax"}</Link>
          {!row.publishedAt && <Link href={`/dashboard/omr/upload?examId=${row.examId}`} className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary underline">Yeni kart skan et</Link>}
        </div>
      </article>;
    })}</div>}
  </div>;
}
