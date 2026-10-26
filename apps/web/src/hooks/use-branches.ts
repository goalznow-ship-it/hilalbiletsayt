"use client";

import { useCallback, useEffect, useState } from "react";
import { type Branch, useSession } from "@/components/session-provider";

export function useBranches() {
  const { user, request } = useSession();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const controller = new AbortController();
    const central = (user.roles ?? [user.role]).some((role) =>
      ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role ?? ""),
    );
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const result = central
          ? await request<Branch[]>("/branches", { signal: controller.signal })
          : await Promise.all(
              [...new Set(user.branches.map((b) => b.id))].map((id) =>
                request<Branch>(`/branches/${encodeURIComponent(id)}`, {
                  signal: controller.signal,
                }),
              ),
            );
        if (
          !Array.isArray(result) ||
          result.some(
            (b) =>
              !b ||
              typeof b.id !== "string" ||
              typeof b.name !== "string" ||
              typeof b.code !== "string",
          )
        )
          throw new Error("Filial məlumatları etibarlı deyil.");
        if (!cancelled) setBranches(result.filter((b) => b.isActive));
      } catch (cause) {
        if (!cancelled) {
          setBranches([]);
          setError(
            cause instanceof Error ? cause.message : "Filiallar yüklənmədi.",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [user, request, revision]);
  return {
    branches: user ? branches : [],
    loading: user ? loading : false,
    error,
    reload,
  };
}
