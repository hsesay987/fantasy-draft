"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

function VerifyEmailContent() {
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
  }, [token, router]);

  return (
    <main className="min-h-screen flex items-center justify-center text-foreground">
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

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center text-foreground">
          <div className="max-w-md text-center text-sm text-muted-foreground">
            Loading verification screen...
          </div>
        </main>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
