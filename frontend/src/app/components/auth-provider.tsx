"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { authApi, type AuthUser } from "../../lib/api/authApi";
import { clearCsrfToken, setUnauthorizedHandler } from "../../lib/api/apiClient";

type AuthContextValue = {
  status: "loading" | "authenticated" | "unauthenticated";
  user: AuthUser | null;
  refreshSession: () => Promise<AuthUser | null>;
  login: (login: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<AuthContextValue["status"]>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const requestVersion = useRef(0);

  const invalidate = useCallback(() => {
    requestVersion.current += 1;
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  const refreshSession = useCallback(async () => {
    const version = ++requestVersion.current;
    setStatus("loading");
    try {
      const current = await authApi.me();
      if (version !== requestVersion.current) return null;
      setUser(current);
      setStatus("authenticated");
      return current;
    } catch {
      if (version === requestVersion.current) invalidate();
      return null;
    }
  }, [invalidate]);

  useEffect(() => {
    setUnauthorizedHandler(invalidate);
    const handleUnauthorized = () => invalidate();
    window.addEventListener("goctro:unauthorized", handleUnauthorized);
    void refreshSession();
    return () => {
      setUnauthorizedHandler(null);
      window.removeEventListener("goctro:unauthorized", handleUnauthorized);
    };
  }, [invalidate, refreshSession]);

  const login = useCallback(async (identifier: string, password: string) => {
    const version = ++requestVersion.current;
    const authenticated = await authApi.login(identifier, password);
    if (version !== requestVersion.current) return authenticated;
    setUser(authenticated);
    setStatus("authenticated");
    return authenticated;
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    clearCsrfToken();
    invalidate();
    router.replace("/login");
  }, [invalidate, router]);

  const value = useMemo(() => ({ status, user, refreshSession, login, logout }), [status, user, refreshSession, login, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
