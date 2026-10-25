"use client";

import { useEffect, useState } from "react";
import { useSession } from "@/components/session-provider";
import { useBranches } from "@/hooks/use-branches";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/page-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { formatAzn } from "@/lib/money";

type Exam = {
  id: string;
  code: string;
  title: string;
  description?: string;
  date: string;
  startTime: string;
  location: string;
  price: number;
  branchName: string;
  duration?: string;
  capacity?: number;
  registered?: number;
  status: "ACTIVE" | "COMPLETED" | "CANCELLED";
};

type ExamFormValues = {
  code: string;
  title: string;
  price: number;
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading } = useBranches();

  const [examsData, setExamsData] = useState<Exam[]>([]);

  useEffect(() => {
    if (!user) return;
    request<Exam[]>(`/api/exam?branchId=${user.branches?.[0]?.id ?? ""}`).then((data) => {
      setExamsData(data);
    });
  }, [user]);

  const handleCreate = (values: ExamFormValues) => {
    setExamsData(prev => [...prev, {
      id: "new",
      code: values.code,
      title: values.title,
      date: new Date().toISOString().split("T")[0],
      startTime: "09:00",
      location: "",
      price: values.price,
      branchName: user?.fullName ?? "Filial",
      duration: "3 saat",
      capacity: 100,
      registered: 0,
      status: "ACTIVE",
    } as Exam]);
  };

  if (!user) {
    return (
      <div className="min-h-screen p-4">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-xl font-medium mb-2">Xoş gəlmisiniz</h2>
          <p className="text-muted-foreground">
            Filial administratorunuzla əlaqə saxlayın
          </p>
          <Link href="/login" className="btn-primary mt-4">
            Giriş
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <PageHeader
        eyebrow="İMTAHAT SİSTEMLİ"
        title="İmtahat Listesi"
        description="Yerli imtahanlar haqqında məlumatlar"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Yeni İmtahan Əlavə Et</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleCreate({ code: "IMT-001", title: "Test İmtahası", price: 50 });
              }}
            >
              <Input
                type="text"
                value=""
                onChange={() => {}}
                placeholder="İmtahan kodu"
                disabled
              />
              <Input
                type="text"
                value=""
                onChange={() => {}}
                placeholder="İmtahan başlığı"
                disabled
              />
              <Input
                type="number"
                value={50}
                onChange={() => {}}
                min={0}
                disabled
              />
              <Button type="submit">İmtahan əlavə et</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {}}
              >
                Läğv et
              </Button>
            </form>
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">İmtahan Listesi</h3>

            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : examsData.length === 0 ? (
              <p className="text-center text-muted-foreground">
                İmtahan tapılmadı
              </p>
            ) : (
              <table className="w-full rounded-md border border-border bg-card">
                <thead>
                  <tr className="border-b border-border text-sm font-medium text-muted-foreground">
                    <th className="py-3">Kod</th>
                    <th className="py-3">Başlıq</th>
                    <th className="py-3">Tarix</th>
                    <th className="py-3">Qiymət</th>
                    <th className="py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {examsData.map((exam) => (
                    <tr key={exam.code} className="border-b border-border">
                      <td className="font-mono">{exam.code}</td>
                      <td>{exam.title}</td>
                      <td>{exam.date}</td>
                      <td className="text-right">{formatAzn(exam.price)}</td>
                      <td>{exam.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
