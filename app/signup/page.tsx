// app/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function SignupPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setLoading(true);
    setMessage(null);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Signup failed");

      setMessage(
        "✅ Account created! Check your email to verify before logging in."
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900/60 p-6">
        <h1 className="text-3xl font-extrabold text-indigo-300 mb-2">
          Sign Up
        </h1>
        <p className="text-sm text-slate-400 mb-6">
          Create an account to save drafts and play online.
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
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (optional)"
          className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full mb-3 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full mb-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <button
          onClick={handleSignup}
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? "Creating account..." : "Create Account"}
        </button>

        <p className="mt-4 text-xs text-slate-400">
          Already have an account?{" "}
          <button
            onClick={() => router.push("/login")}
            className="underline hover:text-white"
          >
            Log in
          </button>
        </p>
      </div>
    </main>
  );
}
