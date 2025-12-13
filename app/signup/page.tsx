// app/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLogin } from "@react-oauth/google";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const hasGoogle = Boolean(GOOGLE_CLIENT_ID);

export default function SignupPage() {
  const router = useRouter();
  const { setAuth } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSignup() {
    setLoading(true);
    setMessage(null);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

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

  async function handleGoogle(credential: string | undefined) {
    if (!credential) {
      setError("Google sign-up failed. Please try again.");
      return;
    }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Google signup failed");
      setAuth(data.token, data.user);
      router.push("/");
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

        <div className="relative mb-3">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 pr-10 text-sm"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>

        <input
          type={showPassword ? "text" : "password"}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password"
          className="w-full mb-4 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
        />

        <button
          onClick={handleSignup}
          disabled={loading}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 py-3 text-sm font-semibold disabled:opacity-60"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Creating account...
            </span>
          ) : (
            "Create Account"
          )}
        </button>

        {hasGoogle && (
          <>
            <div className="my-4 flex items-center gap-3 text-xs text-slate-500">
              <div className="h-px flex-1 bg-slate-800" />
              <span>or</span>
              <div className="h-px flex-1 bg-slate-800" />
            </div>

            <div className="flex justify-center">
              <GoogleLogin
                onSuccess={(cred) => handleGoogle(cred.credential)}
                onError={() =>
                  setError("Google sign-up failed. Please try again.")
                }
              />
            </div>
          </>
        )}

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
