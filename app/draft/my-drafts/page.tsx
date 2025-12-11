// app/draft/my-drafts/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/app/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type MyDraftSummary = {
  id: string;
  title: string | null;
  mode: string;
  createdAt: string;
  rules?: any;
};

export default function MyDraftsPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const [drafts, setDrafts] = useState<MyDraftSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const res = await fetch(`${API_URL}/drafts/my`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        if (!res.ok) return;
        const data = await res.json();
        setDrafts(data);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [token]);

  if (!user) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-50 flex items-center justify-center">
        <div className="text-center space-y-2">
          <p className="text-lg font-semibold">My Drafts</p>
          <p className="text-sm text-slate-400">
            Login to see your saved drafts.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 md:p-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold text-indigo-300">My Drafts</h1>
      </header>

      <section className="rounded-2xl bg-slate-900/70 border border-slate-700 p-4">
        {loading ? (
          <p className="text-sm text-slate-400">Loading drafts…</p>
        ) : drafts.length === 0 ? (
          <p className="text-sm text-slate-500">
            You don&apos;t have any saved drafts yet.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {drafts.map((d) => (
              <button
                key={d.id}
                onClick={() => router.push(`/draft/${d.id}`)}
                className="text-left rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 hover:border-indigo-500 transition-all"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">
                    {d.title || "NBA Draft"}
                  </span>
                  <span className="text-[11px] text-slate-400">
                    {new Date(d.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">Mode: {d.mode}</div>
              </button>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
