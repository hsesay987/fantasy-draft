// app/admin/page.tsx
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
  stripeRevenue: number;
  adsenseRevenue: number;
};

type CommunityAd = {
  id: string;
  title: string;
  body?: string | null;
  targetUrl: string;
  imageUrl?: string | null;
  status: string;
  placement: string;
  submittedBy?: { email: string; id: string } | null;
  createdAt: string;
};

export default function AdminPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [ads, setAds] = useState<CommunityAd[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const [statsRes, feedbackRes, adsRes] = await Promise.all([
        fetch(`${API_URL}/admin/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/admin/feedback`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/ads/community/admin`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const statsJson = await statsRes.json();
      const feedbackJson = await feedbackRes.json();
      const adsJson = await adsRes.json();

      if (!statsRes.ok)
        throw new Error(statsJson.error || "Failed to load stats");
      if (!feedbackRes.ok)
        throw new Error(feedbackJson.error || "Failed to load feedback");
      if (!adsRes.ok) throw new Error(adsJson.error || "Failed to load ads");

      setStats(statsJson.stats);
      setFeedback(feedbackJson.feedback);
      setAds(adsJson.ads);
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

  async function updateAdStatus(
    id: string,
    status: "approved" | "rejected" | "pending"
  ) {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/ads/community/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update ad.");
      setAds((prev) => prev.map((a) => (a.id === id ? data.ad : a)));
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
          <StatCard
            label="Stripe revenue (cents)"
            value={stats?.stripeRevenue ?? 0}
            loading={loading}
          />
          <StatCard
            label="AdSense revenue (cents)"
            value={stats?.adsenseRevenue ?? 0}
            loading={loading}
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 shadow-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
            <div>
              <p className="text-xs uppercase tracking-widest text-slate-500">
                Community ads
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                Pending approvals
              </h2>
            </div>
            {loading && (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            )}
          </div>

          {ads.length === 0 && !loading ? (
            <div className="p-6 text-sm text-slate-400">
              No ad submissions yet.
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {ads.map((ad) => (
                <div key={ad.id} className="p-4 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full bg-slate-800 px-2 py-0.5">
                      {ad.status}
                    </span>
                    <span className="rounded-full bg-slate-800 px-2 py-0.5">
                      {ad.placement}
                    </span>
                    <span>
                      {new Date(ad.createdAt).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {ad.submittedBy?.email && (
                      <span className="text-slate-500">
                        By {ad.submittedBy.email}
                      </span>
                    )}
                    <a
                      href={ad.targetUrl}
                      className="underline hover:text-indigo-200"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Visit
                    </a>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-slate-100">
                        {ad.title}
                      </p>
                      {ad.body && (
                        <p className="text-sm text-slate-400 leading-relaxed">
                          {ad.body}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateAdStatus(ad.id, "approved")}
                        className="rounded-lg border border-emerald-700/60 bg-emerald-900/40 px-3 py-1 text-xs font-semibold text-emerald-100 hover:border-emerald-500/80"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => updateAdStatus(ad.id, "rejected")}
                        className="rounded-lg border border-red-700/60 bg-red-900/30 px-3 py-1 text-xs font-semibold text-red-100 hover:border-red-500/80"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            {loading && (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            )}
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
                        <span className="text-slate-500">
                          User: {item.userId}
                        </span>
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
      <p className="text-xs uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="text-3xl font-bold text-indigo-200">
          {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : value}
        </p>
      </div>
    </div>
  );
}
