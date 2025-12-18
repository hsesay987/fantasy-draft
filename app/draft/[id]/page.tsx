// app/draft/[id]/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function DraftRedirectPage() {
  const router = useRouter();
  const params = useParams();
  const id = params?.id as string | undefined;

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;

    let cancelled = false;
    async function resolveDraft() {
      try {
        const res = await fetch(`${API_URL}/drafts/${id}`);
        if (!res.ok) {
          throw new Error("Draft not found");
        }

        const draft = await res.json();
        const league = (draft.league || "NBA").toUpperCase();
        const target =
          league === "NFL"
            ? `/draft/nfl/${id}`
            : league === "CARTOON"
            ? `/draft/cartoon/${id}`
            : `/draft/nba/${id}`;

        if (!cancelled) {
          router.replace(target);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || "Unable to load draft");
        }
      }
    }

    resolveDraft();
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="text-center space-y-2">
        <p className="text-lg font-semibold">Loading draft...</p>
        {error && (
          <p className="text-sm text-red-300">
            {error}. Please return to the draft list.
          </p>
        )}
      </div>
    </main>
  );
}
