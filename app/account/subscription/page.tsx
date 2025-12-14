// app/account/subscription/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Loader2, Rocket, ShieldCheck, Trophy } from "lucide-react";
import { useAuth } from "@/app/hooks/useAuth";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

type StatusResponse = {
  user: {
    subscriptionTier: string | null;
    subscriptionEnds: string | null;
    isFounder: boolean;
    entitlement: boolean;
  };
  offer: {
    trialDays: number;
    monthlyPrice: string | null;
    yearlyPrice: string | null;
  };
};

export default function SubscriptionPage() {
  const { user, token, setAuth } = useAuth();
  const router = useRouter();

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    loadStatus();
  }, [token]);

  async function loadStatus() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/billing/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Unable to load subscription.");
      setStatus(data);
      if (data.user && user) {
        setAuth(token, { ...user, ...data.user });
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout(plan: "monthly" | "yearly") {
    if (!token) return router.push("/login");
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start checkout.");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function openPortal() {
    if (!token) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/billing/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not open portal.");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 p-6">
        <div className="max-w-md text-center space-y-3">
          <p className="text-lg font-semibold">
            You need an account to manage subscriptions.
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

  const isFounder = status?.user.isFounder;
  const isActive =
    status?.user.entitlement ||
    (!!status?.user.subscriptionEnds &&
      new Date(status.user.subscriptionEnds).getTime() > Date.now());

  return (
    <main className="min-h-screen bg-slate-950 text-slate-50 p-6 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Account
            </p>
            <h1 className="text-3xl font-bold text-indigo-100">Subscription</h1>
            <p className="text-sm text-slate-400">
              Manage ads, trials, and supporter perks. Founders are ad-free for
              life.
            </p>
          </div>
          {isFounder && (
            <span className="inline-flex items-center gap-2 rounded-full bg-amber-900/40 px-4 py-2 text-xs font-semibold text-amber-100 border border-amber-600/50">
              <Crown className="h-4 w-4" />
              Founder — lifetime perks
            </span>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-500/40 bg-red-900/30 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <PlanCard
            label="Monthly"
            price="$3.99"
            subtext="per month"
            cta="Start monthly"
            onClick={() => startCheckout("monthly")}
            disabled={loading || isFounder || isActive}
          />
          <PlanCard
            label="Yearly"
            price="$30"
            subtext="per year"
            highlight
            cta="Start yearly"
            onClick={() => startCheckout("yearly")}
            disabled={loading || isFounder || isActive}
          />
          <PlanCard
            label="Ads off"
            price="Included"
            subtext={isFounder ? "Founder benefit" : "With any active plan"}
            cta={isActive ? "Manage billing" : "Pick a plan"}
            onClick={isActive ? openPortal : () => startCheckout("monthly")}
            disabled={loading}
          />
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-300" /> Current
              status
            </h2>
            {loading && (
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            )}
            {status && (
              <ul className="space-y-2 text-sm text-slate-300">
                <li>
                  Ads:{" "}
                  {isFounder || isActive
                    ? "Off"
                    : "Showing (can disable with subscription)"}
                </li>
                <li>
                  Subscription:{" "}
                  {isFounder
                    ? "Founder — lifetime access"
                    : status.user.subscriptionTier
                    ? `${status.user.subscriptionTier} — renews ${
                        status.user.subscriptionEnds
                          ? new Date(
                              status.user.subscriptionEnds
                            ).toLocaleDateString()
                          : "soon"
                      }`
                    : "None"}
                </li>
                <li>Trial offer: {status.offer.trialDays} days free</li>
              </ul>
            )}
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Rocket className="h-5 w-5 text-indigo-300" /> Perks
            </h2>
            <ul className="text-sm text-slate-300 space-y-2">
              <li>🛡️ No ads across the experience</li>
              <li>🚀 Priority access to new draft and quiz modes</li>
              <li>🎟️ Unlimited game creation + early beta invites</li>
              <li>🌟 Founders get a lifetime badge and perks</li>
            </ul>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-300" />
              Want to feature your brand?
            </h3>
            <p className="text-sm text-slate-400">
              Submit a tasteful community ad. Admins approve everything to keep
              it clean.
            </p>
          </div>
          <button
            onClick={() => router.push("/ads/submit")}
            className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-semibold hover:bg-slate-700"
          >
            Submit community ad
          </button>
        </div>
      </div>
    </main>
  );
}

function PlanCard({
  label,
  price,
  subtext,
  highlight,
  cta,
  onClick,
  disabled,
}: {
  label: string;
  price: string;
  subtext: string;
  highlight?: boolean;
  cta: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border ${
        highlight ? "border-indigo-500/60" : "border-slate-800"
      } bg-slate-900/70 p-5 shadow-lg`}
    >
      <p className="text-xs uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="text-3xl font-bold text-slate-50">{price}</span>
        <span className="text-sm text-slate-400">{subtext}</span>
      </div>
      <button
        onClick={onClick}
        disabled={disabled}
        className="mt-4 w-full rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
      >
        {cta}
      </button>
    </div>
  );
}
