"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldOff, Trash2 } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type FeedbackItem = {
  id: string;
  type: string;
  category: string | null;
  message: string;
  url?: string | null;
  userId?: string | null;
  createdAt: string;
};

type AdminStats = {
  totalUsers: number;
  totalGames: number;
  gamesPlayedToday: number;
  totalFeedback: number;
};

export default function AdminPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, feedbackRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/admin/feedback`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const statsJson = await statsRes.json();
      const feedbackJson = await feedbackRes.json();

      if (!statsRes.ok) throw new Error(statsJson.error || "Failed to load stats");
      if (!feedbackRes.ok)
        throw new Error(feedbackJson.error || "Failed to load feedback");

      setStats(statsJson.stats);
      setFeedback(feedbackJson.feedback);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token || !user?.isAdmin) {
      setLoading(false);
      return;
    }
    loadData();
  }, [token, user?.isAdmin, loadData]);

  async function handleDelete(id: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/admin/feedback/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      setFeedback((prev) => prev.filter((f) => f.id !== id));
    } catch (err: any) {
      setError(err.message);
    }
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-semibold">Sign in required</p>
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

  if (!user.isAdmin) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center space-y-4">
          <ShieldOff className="mx-auto h-10 w-10 text-amber-300" />
          <p className="text-lg font-semibold">Admin access only</p>
          <button
            onClick={() => router.push("/")}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
          >
            Return home
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-widest text-slate-500">
              Admin
            </p>
            <h1 className="text-3xl font-bold text-indigo-200">Control Room</h1>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold hover:border-indigo-400 disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Total users"
            value={stats?.totalUsers ?? 0}
            loading={loading}
          />
          <StatCard
            label="Games created"
            value={stats?.totalGames ?? 0}
            loading={loading}
          />
          <StatCard
            label="Games played today"
            value={stats?.gamesPlayedToday ?? 0}
            loading={loading}
          />
          <StatCard
            label="Feedback received"
            value={stats?.totalFeedback ?? feedback.length}
            loading={loading}
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Feedback
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                Latest submissions
              </h2>
            </div>
            {loading && <Loader2 className="h-5 w-5 animate-spin text-slate-400" />}
          </div>

          {feedback.length === 0 && !loading ? (
            <div className="p-6 text-sm text-slate-400">No feedback yet.</div>
          ) : (
            <div className="divide-y divide-slate-800">
              {feedback.map((item) => (
                <div key={item.id} className="p-4 flex gap-3">
                  <div className="w-2 h-2 rounded-full mt-2 shrink-0 bg-indigo-400" />
                  <div className="flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span className="rounded-full bg-slate-800 px-2 py-0.5">
                        {item.type}
                      </span>
                      {item.category && (
                        <span className="rounded-full bg-slate-800 px-2 py-0.5">
                          {item.category}
                        </span>
                      )}
                      <span>
                        {new Date(item.createdAt).toLocaleString(undefined, {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                      {item.userId && (
                        <span className="text-slate-500">User: {item.userId}</span>
                      )}
                      {item.url && (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline hover:text-indigo-200"
                        >
                          View page
                        </a>
                      )}
                    </div>
                    <p className="text-sm text-slate-100 whitespace-pre-wrap leading-relaxed">
                      {item.message}
                    </p>
                  </div>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="self-start rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-400 hover:text-red-300 hover:border-red-500/60"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: number;
  loading: boolean;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg">
      <p className="text-xs uppercase tracking-widest text-slate-500">{label}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold text-indigo-200">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : value}
        </p>
      </div>
    </div>
  );
}
