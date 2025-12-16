// app/draft/page.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import nbaImg from "../assets/nba.jpg";
import nflImg from "../assets/nfl.jpg";
import foodImg from "../assets/food.jpg";
import animeImg from "../assets/anime.jpg";
import cartoonsImg from "../assets/cartoons.jpg";
import fifaImg from "../assets/fifa.jpg";
import { useAuth } from "../hooks/useAuth";

// Unified Draft Box Type
type DraftSummary = {
  id: string;
  title: string | null;
  mode: string;
  createdAt?: string;
  league?: string;
};

type DraftCategory = {
  id: string;
  name: string;
  image: StaticImageData;
  enabled: boolean;
  beta?: boolean;
  requirePremium?: boolean;
  onClick?: () => void;
};

export default function HomePage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const { user } = useAuth();

  const [drafts, setDrafts] = useState<DraftSummary[]>([]);

  const isPremium =
    !!user?.isAdmin ||
    !!user?.isFounder ||
    (!!user?.subscriptionTier &&
      (!user.subscriptionEnds ||
        new Date(user.subscriptionEnds).getTime() > Date.now()));

  async function loadDrafts() {
    try {
      const res = await fetch(`${API_URL}/drafts`);
      if (!res.ok) return;
      const data = await res.json();
      setDrafts(data);
    } catch (err) {
      console.error("Failed to load drafts", err);
    }
  }

  useEffect(() => {
    loadDrafts();
  }, []);

  const goToNfl = () => {
    if (!isPremium) {
      router.push("/account/subscription");
      return;
    }
    router.push("/draft/new?league=NFL");
  };

  const goToCartoon = () => {
    if (!isPremium) {
      router.push("/account/subscription");
      return;
    }
    router.push("/draft/new?league=CARTOON");
  };

  const draftCategories: DraftCategory[] = [
    {
      id: "nba",
      name: "NBA Draft",
      image: nbaImg,
      enabled: true,
      onClick: () => router.push("/draft/new"),
    },
    {
      id: "nfl",
      name: "NFL Draft (Beta)",
      image: nflImg,
      enabled: true,
      beta: true,
      requirePremium: true,
      onClick: goToNfl,
    },
    {
      id: "food",
      name: "Food Draft",
      image: foodImg,
      enabled: false,
    },
    {
      id: "anime",
      name: "Anime Characters Draft",
      image: animeImg,
      enabled: false,
    },
    {
      id: "cartoons",
      name: "Cartoon Draft (Beta)",
      image: cartoonsImg,
      enabled: true,
      beta: true,
      requirePremium: true,
      onClick: goToCartoon,
    },
    {
      id: "epl",
      name: "EPL / FIFA Draft",
      image: fifaImg,
      enabled: false,
    },
  ];

  return (
    <main className="min-h-screen p-6 md:p-10 bg-slate-950 text-slate-50 space-y-10">
      {/* PAGE TITLE */}
      <header>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-indigo-300 mb-2">
          DraftHub
        </h1>
        <p className="text-slate-400 text-sm md:text-base">
          Create fantasy lineups across sports, games, food, and more.
        </p>
      </header>

      {/* AVAILABLE DRAFT MODES */}
      <section>
        <h2 className="text-2xl font-semibold mb-4">Available Drafts</h2>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {draftCategories.map((cat) => {
            const isNba = cat.id === "nba";
            const isNfl = cat.id === "nfl";
            const locked = !cat.enabled || (cat.requirePremium && !isPremium);
            return (
              <div
                key={cat.id}
                role={!locked ? "button" : undefined}
                onClick={() => !locked && cat.onClick?.()}
                className={`group relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/30 backdrop-blur-sm transition-all ${
                  !locked
                    ? "hover:border-indigo-500 hover:shadow-indigo-500/30 cursor-pointer"
                    : "opacity-60 cursor-not-allowed"
                }`}
              >
                {/* Image */}
                <div className="relative h-40 w-full overflow-hidden">
                  <Image
                    src={cat.image}
                    alt={cat.name}
                    fill
                    className={`object-cover transition-all duration-300 group-hover:scale-105 ${
                      !cat.enabled ? "grayscale" : ""
                    }`}
                  />
                </div>

                {/* Title */}
                <div className="p-4 text-left">
                  <div className="text-xl font-semibold mb-1 text-slate-100">
                    {cat.name}
                  </div>
                  {!locked ? (
                    <p className="text-sm text-indigo-400 font-medium">
                      ✦ {cat.beta ? "Launch Beta" : "Start Draft"}
                    </p>
                  ) : cat.requirePremium ? (
                    <p className="text-sm text-orange-300">
                      Premium members only
                    </p>
                  ) : (
                    <p className="text-sm text-slate-500">Coming Soon</p>
                  )}

                  {cat.enabled && isNba && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/draft/new");
                        }}
                        className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs py-2"
                      >
                        Offline Draft
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/online");
                        }}
                        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs py-2"
                      >
                        Online Draft
                      </button>
                    </div>
                  )}
                  {cat.enabled && isNfl && (
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          goToNfl();
                        }}
                        className="flex-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs py-2"
                      >
                        Offline Draft
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push("/online?league=NFL");
                        }}
                        className="flex-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs py-2"
                      >
                        Online Draft
                      </button>
                    </div>
                  )}

                  {cat.beta && (
                    <div className="mt-3 inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-amber-300">
                      <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
                      Beta
                    </div>
                  )}
                </div>

                {/* Coming Soon overlay */}
                {locked && (
                  <div className="absolute inset-0 bg-slate-950/50 flex items-end justify-end p-3 pointer-events-none">
                    <span className="text-[10px] uppercase tracking-wide bg-slate-700/60 text-slate-300 px-2 py-[2px] rounded">
                      {cat.requirePremium ? "Premium Beta" : "Coming Soon"}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* RECENT DRAFTS */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-semibold">Recent Drafts</h3>
          <button
            onClick={loadDrafts}
            className="text-xs text-slate-300 underline hover:text-white"
          >
            Refresh
          </button>
        </div>

        <div className="rounded-2xl bg-slate-900/60 border border-slate-700 p-4">
          {drafts.length === 0 ? (
            <p className="text-sm text-slate-500">No drafts yet.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2">
              {drafts.map((d) => (
                <button
                  key={d.id}
                  onClick={() => {
                    const leaguePath =
                      (d.league || "NBA").toUpperCase() === "NFL"
                        ? "nfl"
                        : "nba";
                    router.push(`/draft/${leaguePath}/${d.id}`);
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left hover:border-indigo-500 transition-all"
                >
                  <div className="font-semibold text-sm text-slate-100">
                    {d.title ||
                      ((d.league || "NBA").toUpperCase() === "NFL"
                        ? "NFL Draft"
                        : "NBA Draft")}
                  </div>
                  <div className="text-xs text-slate-400 flex items-center justify-between">
                    <span>Mode: {d.mode}</span>
                    {d.createdAt && (
                      <span>{new Date(d.createdAt).toLocaleDateString()}</span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
