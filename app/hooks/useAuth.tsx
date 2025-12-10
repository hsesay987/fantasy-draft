// app/hooks/useAuth.ts
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type User = {
  id: string;
  email: string;
  name?: string | null;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  setAuth: (token: string | null, user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("authUser");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
  }, []);

  function setAuth(t: string | null, u: User | null) {
    setToken(t);
    setUser(u);
    if (!t || !u) {
      localStorage.removeItem("authToken");
      localStorage.removeItem("authUser");
    } else {
      localStorage.setItem("authToken", t);
      localStorage.setItem("authUser", JSON.stringify(u));
    }
  }

  return (
    <AuthContext.Provider value={{ user, token, setAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
