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
import { BarChart3, LoaderCircle, TrendingUp, MapPin } from "lucide-react";

type ReportMetric = {
  id: string;
  title: string;
  value: string;
  change: string;
  trend: "up" | "down" | "neutral";
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading } = useBranches();

  const [metrics, setMetrics] = useState<ReportMetric[]>([]);

  useEffect(() => {
    if (!user) return;
    request<ReportMetric[]>(`/api/report?branchId=${user.branches?.[0]?.id}`).then((data) => {
      setMetrics(data);
    });
  }, [user]);

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
        eyebrow="RƏQİMLƏR"
        title="Raporlar"
        description="Metriklər və analytics"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Metrik Kartları</h3>
            <div className="grid grid-cols-2 gap-4">
              {metrics.map((metric) => (
                <div
                  key={metric.id}
                  className={`p-4 rounded-md border border-border bg-card ${metric.trend === "up" ? "border-success bg-success/5" : ""}`}
                >
                  <div className="text-success text-sm mb-2">
                    <BarChart3 className="h-4 w-4" />
                  </div>
                  <h4 className="font-medium">{metric.title}</h4>
                  <p className="text-3xl font-bold">{metric.value}</p>
                  <p className="text-sm text-muted-foreground">{metric.change}</p>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">İmtahan Statistikası</h3>
            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : metrics.length === 0 ? (
              <p className="text-center text-muted-foreground">
                məlumat yoxdur
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Umumili {metrics.length} metriq yoxlanıldı
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
