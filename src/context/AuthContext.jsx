import { createContext, useContext, useMemo, useState } from "react";
import { setAuthToken } from "../api/client";

const STORAGE_KEY = "smart_schedular_auth";
const AuthContext = createContext(null);

function loadStoredAuth() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    const stored = loadStoredAuth();
    if (stored?.access_token) {
      setAuthToken(stored.access_token);
    }
    return stored;
  });

  const saveAuth = (payload) => {
    setAuth(payload);
    setAuthToken(payload?.access_token);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  };

  const logout = () => {
    setAuth(null);
    setAuthToken(null);
    localStorage.removeItem(STORAGE_KEY);
  };

  const value = useMemo(
    () => ({
      auth,
      isAuthenticated: Boolean(auth?.access_token),
      saveAuth,
      logout
    }),
    [auth]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}

