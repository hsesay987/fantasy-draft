"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token");

  const [status, setStatus] = useState("verifying");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }

    fetch(`${API_URL}/auth/verify?token=${token}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error();
        setStatus("success");
        setTimeout(() => router.push("/login"), 2500);
      })
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-50">
      <div className="max-w-md text-center">
        {status === "verifying" && <p>🔄 Verifying your email…</p>}
        {status === "success" && (
          <p>✅ Email verified! Redirecting to login…</p>
        )}
        {status === "error" && (
          <p className="text-red-400">
            ❌ Invalid or expired verification link.
          </p>
        )}
      </div>
    </main>
  );
}
