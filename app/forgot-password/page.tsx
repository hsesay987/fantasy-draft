"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send reset email.");
      setMessage(data.message || "If the email exists, a reset link was sent.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
        <h1 className="text-2xl font-bold text-indigo-300 mb-2">
          Forgot password
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Enter your email to receive a reset link.
        </p>

        {error && (
          <div className="mb-4 rounded-lg bg-red-900/30 border border-red-500/50 px-3 py-2 text-sm text-red-200">
            ⚠ {error}
          </div>
        )}

        {message && (
          <div className="mb-4 rounded-lg bg-emerald-900/30 border border-emerald-500/50 px-3 py-2 text-sm text-emerald-200">
            {message}
          </div>
        )}

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full mb-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <button
          onClick={handleSubmit}
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending...
            </span>
          ) : (
            "Send reset link"
          )}
        </button>

        <p className="mt-4 text-xs text-slate-400 text-center">
          Remembered your password?{" "}
          <button
            onClick={() => router.push("/login")}
            className="underline hover:text-white"
          >
            Back to login
          </button>
        </p>
      </div>
    </main>
  );
}
