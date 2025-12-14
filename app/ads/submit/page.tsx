// app/ads/submit/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export default function SubmitAdPage() {
  const { user, token } = useAuth();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");
  const [placement, setPlacement] = useState<"rail" | "footer">("rail");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-semibold">
            Log in to submit a community ad.
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

  async function handleSubmit() {
    setLoading(true);
    setStatus(null);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/ads/community`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title,
          targetUrl,
          imageUrl,
          body,
          category,
          placement,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not submit ad.");
      setStatus("Submitted for review. We'll approve it soon.");
      setTitle("");
      setTargetUrl("");
      setImageUrl("");
      setBody("");
      setCategory("");
      setPlacement("rail");
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 flex justify-center">
      <div className="w-full max-w-3xl space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Community
              </p>
              <h1 className="text-2xl font-semibold text-indigo-200">
                Submit an ad
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Keep it clean and relevant. We manually review every placement.
              </p>
            </div>
            <div className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-300">
              Ads are reviewed within 24h
            </div>
          </div>
        </div>

        {(status || error) && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              status
                ? "border-emerald-500/40 bg-emerald-900/30 text-emerald-100"
                : "border-red-500/40 bg-red-900/30 text-red-100"
            }`}
          >
            {status || error}
          </div>
        )}

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Title"
              value={title}
              onChange={setTitle}
              placeholder="League, show, or brand name"
            />
            <Field
              label="Target URL"
              value={targetUrl}
              onChange={setTargetUrl}
              placeholder="https://your-site.com"
            />
          </div>
          <Field
            label="Image URL (optional)"
            value={imageUrl}
            onChange={setImageUrl}
            placeholder="https://your-site.com/banner.png"
          />
          <Field
            label="Short copy"
            value={body}
            onChange={setBody}
            placeholder="Describe your ad in one sentence."
            multiline
          />
          <div className="grid gap-3 md:grid-cols-2">
            <Field
              label="Category (optional)"
              value={category}
              onChange={setCategory}
              placeholder="Podcast, league, etc."
            />
            <div className="space-y-1">
              <label className="text-xs text-slate-400">Placement</label>
              <select
                value={placement}
                onChange={(e) =>
                  setPlacement(e.target.value as "rail" | "footer")
                }
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
              >
                <option value="rail">Sidebar rail</option>
                <option value="footer">Mobile footer</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Submit for review
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-slate-400">{label}</label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
          rows={3}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
        />
      )}
    </div>
  );
}
