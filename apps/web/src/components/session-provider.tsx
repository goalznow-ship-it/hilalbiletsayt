"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { authenticatedRequest } from "@/lib/request";
import { authenticate, fetchCurrentUser, type CurrentUser } from "@/lib/auth";
export type { Branch, CurrentUser } from "@/lib/auth";

const SESSION_KEY = "hilal.session";

type StoredSession = {
  token: string;
  expiresAt: number;
  selectedBranch: string;
};

function readStoredSession(): StoredSession | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (
      typeof parsed.token !== "string" ||
      !parsed.token ||
      typeof parsed.expiresAt !== "number" ||
      !Number.isFinite(parsed.expiresAt) ||
      typeof parsed.selectedBranch !== "string"
    ) {
      return null;
    }
    if (parsed.expiresAt <= Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

type Session = {
  user: CurrentUser | null;
  selectedBranch: string;
  initializing: boolean;
  selectBranch: (id: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  clearSession: () => void;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [selectedBranch, selectBranch] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [initializing, setInitializing] = useState(true);
  const clearSession = useCallback(() => {
    setToken(null);
    setUser(null);
    selectBranch("");
    setExpiresAt(null);
  }, []);

  useEffect(() => {
    if (!expiresAt) return;
    const timer = window.setTimeout(
      clearSession,
      Math.max(0, expiresAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [expiresAt, clearSession]);

  useEffect(() => {
    if (!token || !expiresAt) {
      window.sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    window.sessionStorage.setItem(
      SESSION_KEY,
      JSON.stringify({ token, expiresAt, selectedBranch }),
    );
  }, [token, expiresAt, selectedBranch]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      const stored = readStoredSession();
      if (!stored) {
        if (active) setInitializing(false);
        return;
      }
      setToken(stored.token);
      setExpiresAt(stored.expiresAt);
      try {
        const identity = await fetchCurrentUser(stored.token);
        const roles = identity.roles ?? (identity.role ? [identity.role] : []);
        const nextBranch =
          identity.branches.some((branch) => branch.id === stored.selectedBranch)
            ? stored.selectedBranch
            : roles.some((role) => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role))
              ? ""
              : (identity.branches[0]?.id ?? "");
        if (active) {
          setUser(identity);
          selectBranch(nextBranch);
        }
      } catch {
        if (active) clearSession();
      } finally {
        if (active) setInitializing(false);
      }
    };
    void restore();
    return () => {
      active = false;
    };
  }, [clearSession]);

  const request = useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      return authenticatedRequest<T>(token, path, init, clearSession);
    },
    [token, clearSession],
  );

  const signIn = async (email: string, password: string) => {
    const session = await authenticate(email, password);
    setToken(session.token);
    setUser(session.user);
    setExpiresAt(session.expiresAt);
    const roles =
      session.user.roles ??
      (session.user.role ? [session.user.role] : []);
    selectBranch(
      roles.some((role) => ["SUPER_ADMIN", "CENTRAL_ADMIN"].includes(role))
        ? ""
        : (session.user.branches[0]?.id ?? ""),
    );
  };

  return (
    <SessionContext.Provider
      value={{
        user,
        selectedBranch,
        initializing,
        selectBranch,
        signIn,
        clearSession,
        request,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error("SessionProvider is required");
  return context;
}
