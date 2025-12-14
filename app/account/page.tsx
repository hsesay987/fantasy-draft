// app/account/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../hooks/useAuth";
import { useRouter } from "next/navigation";
import { CheckCircle, Loader2, MailWarning, ShieldCheck } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function AccountPage() {
  const { user, token, setAuth } = useAuth();
  const router = useRouter();

  const [name, setName] = useState(user?.name || "");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [sendingVerification, setSendingVerification] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [emailVerified, setEmailVerified] = useState<boolean | undefined>(
    user?.emailVerified
  );

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    setName(user?.name || "");
    setEmailVerified(user?.emailVerified);
  }, [user]);

  useEffect(() => {
    if (!token) return;

    setLoadingProfile(true);
    fetch(`${API_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.user) {
          setName(data.user.name || "");
          setEmailVerified(data.user.emailVerified);
          setAuth(token, data.user);
        }
      })
      .catch(() => setError("Failed to load account info."))
      .finally(() => setLoadingProfile(false));
  }, [token]);

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-semibold">
            You need an account to manage settings.
          </p>
          <button
            onClick={() => router.push("/login")}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-700"
          >
            Go to login
          </button>
        </div>
      </main>
    );
  }

  async function saveProfile() {
    setSavingProfile(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Update failed.");
      setAuth(token, data.user);
      setEmailVerified(data.user.emailVerified);
      setStatus("Profile updated.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSavingProfile(false);
    }
  }

  async function handleResendVerification() {
    setSendingVerification(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${API_URL}/auth/resend-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user?.email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not send email.");
      setStatus(data.message || "Verification email sent.");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSendingVerification(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setChangingPassword(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`${API_URL}/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not update password.");
      setStatus(data.message || "Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center p-6">
      <div className="w-full max-w-3xl space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Account
              </p>
              <h1 className="text-2xl font-semibold text-indigo-200">
                Settings
              </h1>
            </div>
            {emailVerified ? (
              <span className="inline-flex items-center gap-2 rounded-full bg-emerald-900/40 px-3 py-1 text-xs text-emerald-200 border border-emerald-700/50">
                <CheckCircle className="h-4 w-4" />
                Email verified
              </span>
            ) : (
              <span className="inline-flex items-center gap-2 rounded-full bg-amber-900/30 px-3 py-1 text-xs text-amber-200 border border-amber-600/60">
                <MailWarning className="h-4 w-4" />
                Verification needed
              </span>
            )}
          </div>

          <div className="mt-4 text-sm text-slate-400">
            <p>Email: {user?.email}</p>
          </div>

          {(status || error) && (
            <div className="mt-4 space-y-2">
              {status && (
                <div className="rounded-lg bg-emerald-900/30 border border-emerald-500/40 px-3 py-2 text-sm text-emerald-100">
                  {status}
                </div>
              )}
              {error && (
                <div className="rounded-lg bg-red-900/30 border border-red-500/40 px-3 py-2 text-sm text-red-100">
                  {error}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Profile</h2>
            <label className="text-xs text-slate-400">Display name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
              placeholder="Your name"
            />
            <button
              onClick={saveProfile}
              disabled={savingProfile || loadingProfile}
              className="mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
            >
              {savingProfile ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving...
                </span>
              ) : (
                "Save changes"
              )}
            </button>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-1">Email verification</h2>
            <p className="text-sm text-slate-400 mb-4">
              We&apos;ll send a fresh link to {user?.email}.
            </p>
            <button
              onClick={handleResendVerification}
              disabled={sendingVerification || emailVerified}
              className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-700 disabled:opacity-60"
            >
              {sendingVerification ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending...
                </span>
              ) : (
                "Resend verification email"
              )}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-indigo-300" />
            <h2 className="text-lg font-semibold">Reset password</h2>
          </div>
          <p className="text-xs text-slate-400 mb-4">
            Enter your current password if you have one. If you signed up with
            Google and never set a password, leave the current password empty.
          </p>
          <div className="space-y-3">
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="New password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <button
            onClick={handleChangePassword}
            disabled={changingPassword}
            className="mt-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold disabled:opacity-60"
          >
            {changingPassword ? (
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Updating...
              </span>
            ) : (
              "Update password"
            )}
          </button>
        </div>
      </div>
    </main>
  );
}
