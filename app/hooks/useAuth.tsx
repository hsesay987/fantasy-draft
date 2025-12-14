// app/hooks/useAuth.ts
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type User = {
  id: string;
  email: string;
  name?: string | null;
  emailVerified?: boolean;
  isAdmin?: boolean;
  isFounder?: boolean;
  subscriptionTier?: string | null;
  subscriptionEnds?: string | null;
};

type AuthContextValue = {
  user: User | null;
  token: string | null;
  setAuth: (token: string | null, user: User | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem("authToken");
    const storedUser = localStorage.getItem("authUser");
    if (storedToken) {
      setToken(storedToken);
      if (storedUser) {
        setUser(JSON.parse(storedUser));
      }

      fetch(`${API_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${storedToken}`,
        },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data?.user) {
            setAuth(storedToken, data.user);
          } else {
            setAuth(null, null);
          }
        })
        .catch(() => setAuth(null, null));
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
