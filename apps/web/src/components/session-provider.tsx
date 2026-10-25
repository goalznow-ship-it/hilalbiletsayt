"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import { authenticatedRequest } from "@/lib/request";
import { authenticate, type CurrentUser } from "@/lib/auth";
export type { Branch, CurrentUser } from "@/lib/auth";

type Session = {
  user: CurrentUser | null;
  selectedBranch: string;
  selectBranch: (id: string) => void;
  signIn: (email: string, password: string) => Promise<void>;
  clearSession: () => void;
  request: <T>(path: string, init?: RequestInit) => Promise<T>;
};
const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  // Access tokens stay in memory until refresh-session support exists in the API.
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [selectedBranch, selectBranch] = useState("");
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
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
