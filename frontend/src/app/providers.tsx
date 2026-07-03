import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { apiClient } from "../services/apiClient";
import type { UserRead } from "../types/api";

interface AuthContextValue {
  token: string;
  user: UserRead | null;
  isAuthenticated: boolean;
  isBootstrapping: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const TOKEN_STORAGE_KEY = "voltpulse_token";

function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_STORAGE_KEY) ?? "");
  const [user, setUser] = useState<UserRead | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(Boolean(token));

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUser(null);
      setIsBootstrapping(false);
      return;
    }

    setIsBootstrapping(true);
    apiClient
      .me(token)
      .then((profile) => {
        if (!cancelled) {
          setUser(profile);
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(TOKEN_STORAGE_KEY);
          setToken("");
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsBootstrapping(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await apiClient.login(email, password);
    localStorage.setItem(TOKEN_STORAGE_KEY, response.access_token);
    setToken(response.access_token);
    setUser(await apiClient.me(response.access_token));
  }, []);

  const signOut = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    setToken("");
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      isAuthenticated: Boolean(token && user),
      isBootstrapping,
      signIn,
      signOut,
    }),
    [isBootstrapping, signIn, signOut, token, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AppProviders");
  }
  return context;
}
