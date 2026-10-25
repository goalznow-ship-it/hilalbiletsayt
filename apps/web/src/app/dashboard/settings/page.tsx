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
import { Settings2, LoaderCircle, Shield, Users } from "lucide-react";

type Setting = {
  id: string;
  key: string;
  value: string;
  description: string;
};

type SettingFormValues = {
  key: string;
  value: string;
  description: string;
};

export default function Page() {
  const { user, request } = useSession();
  const { branches, loading: branchLoading } = useBranches();

  const [settings, setSettings] = useState<Setting[]>([]);

  useEffect(() => {
    if (!user) return;
    request<Setting[]>(`/api/setting?branchId=${user.branches?.[0]?.id}`).then((data) => {
      setSettings(data);
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
        eyebrow="AYARLAR"
        title="Sistem Ayarları"
        description="Sistem konfiqurasyon parametrləri"
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">Sistem Ayarları</h3>

            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : settings.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Ayar yoxdur
              </p>
            ) : (
              <table className="w-full rounded-md border border-border bg-card">
                <thead>
                  <tr className="border-b border-border text-sm font-medium text-muted-foreground">
                    <th className="py-3">Key</th>
                    <th className="py-3">Value</th>
                    <th className="py-3">Description</th>
                    <th className="py-3">Əməliyyat</th>
                  </tr>
                </thead>
                <tbody>
                  {settings.map((setting) => (
                    <tr key={setting.id} className="border-b border-border">
                      <td>{setting.key}</td>
                      <td>{setting.value}</td>
                      <td>{setting.description}</td>
                      <td>
                        <Button size="sm" variant="outline">
                          Redaktə et
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Card>

        <Card>
          <div className="p-4 md:p-6">
            <h3 className="font-medium mb-4">İstifadəçi Özləyirləri</h3>
            {branchLoading ? (
              <Skeleton className="animate-pulse" />
            ) : settings.length === 0 ? (
              <p className="text-center text-muted-foreground">
                Ayar yoxdur
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Sistem parametrləri yukarıda göstərilib.
              </p>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
