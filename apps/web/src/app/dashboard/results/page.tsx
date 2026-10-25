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
import { LoaderCircle, CheckCircle, X } from "lucide-react";

type Result = {
  id: string;
  examCode: string;
  examTitle: string;
  candidateName: string;
  candidateNumber: string;
  score: number;
  maxScore: number;
  takenAt: string;
  status: "PASSED" | "FAILED" | "IN_PROGRESS";
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading } = useBranches();

  const [results, setResults] = useState<Result[]>([]);

  useEffect(() => {
    if (!user) return;
    request<Result[]>(`/api/result?branchId=${user.branches?.[0]?.id}`).then((data) => {
      setResults(data);
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
        eyebrow="Cavablar"
        title="Nəticə Nəticələri"
        description="İmtahan cavabları və nəticələr"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Nəticə Listesi</h3>

            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : results.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Nəticə yoxdur
              </p>
            ) : (
              <table className="w-full rounded-md border border-border bg-card">
                <thead>
                  <tr className="border-b border-border text-sm font-medium text-muted-foreground">
                    <th className="py-3">Sınav</th>
                    <th className="py-3">Candidate</th>
                    <th className="py-3">Cavab Nömrəsi</th>
                    <th className="py-3">Baliq</th>
                    <th className="py-3">Tarix</th>
                    <th className="py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((result) => (
                    <tr key={result.id} className="border-b border-border">
                      <td>{result.examCode} - {result.examTitle}</td>
                      <td>{result.candidateName}</td>
                      <td>{result.candidateNumber}</td>
                      <td>{result.score}/{result.maxScore}</td>
                      <td>{result.takenAt}</td>
                      <td>{result.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Statistika</h3>
            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : results.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Statistika yoxdur
              </p>
            ) : (
              <div>
                <p className="text-sm text-success">
                  ✓ Müştərilər: {results.length}
                </p>
                <p className="text-sm text-muted-foreground">
                  ✓ Ortalama baliq: {(results.reduce((s, r) => s + r.score, 0) / results.length) || 0}.0
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
