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

// Unified Draft Box Type
type DraftSummary = {
  id: string;
  title: string | null;
  mode: string;
  createdAt?: string;
};

type DraftCategory = {
  id: string;
  name: string;
  image: StaticImageData;
  enabled: boolean;
  onClick?: () => void;
};

export default function HomePage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

  const [drafts, setDrafts] = useState<DraftSummary[]>([]);

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
      name: "NFL Draft",
      image: nflImg,
      enabled: false,
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
      name: "Cartoon Characters Draft",
      image: cartoonsImg,
      enabled: false,
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
          {draftCategories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => cat.enabled && cat.onClick?.()}
              disabled={!cat.enabled}
              className={`group relative rounded-2xl overflow-hidden border border-slate-700 bg-slate-900/30 backdrop-blur-sm transition-all ${
                cat.enabled
                  ? "hover:border-indigo-500 hover:shadow-indigo-500/30"
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
                {cat.enabled ? (
                  <p className="text-sm text-indigo-400 font-medium">
                    ✦ Start Draft
                  </p>
                ) : (
                  <p className="text-sm text-slate-500">Coming Soon</p>
                )}
              </div>

              {/* Coming Soon overlay */}
              {!cat.enabled && (
                <div className="absolute inset-0 bg-slate-950/50 flex items-end justify-end p-3 pointer-events-none">
                  <span className="text-[10px] uppercase tracking-wide bg-slate-700/60 text-slate-300 px-2 py-[2px] rounded">
                    Coming Soon
                  </span>
                </div>
              )}
            </button>
          ))}
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
                  onClick={() => router.push(`/draft/${d.id}`)}
                  className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-left hover:border-indigo-500 transition-all"
                >
                  <div className="font-semibold text-sm text-slate-100">
                    {d.title || "NBA Draft"}
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
