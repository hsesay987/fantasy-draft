// app/page.tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import draftImg from "./assets/nba.jpg";
import nflImg from "./assets/nfl.jpg";
import cartoonsImg from "./assets/cartoons.jpg";
import imposterImg from "./assets/imposter.jpg";
import lineupImg from "./assets/lineup.jpg";
import quizImg from "./assets/quiz.jpg";
import auxImg from "./assets/music.jpg";
import topPicImg from "./assets/toppic.png";

type GameCard = {
  id: string;
  name: string;
  image: any;
  enabled: boolean;
  route?: string;
};

type DraftRecord = {
  league?: string;
  createdAt?: string;
};

type TopGame = {
  id: string;
  title: string;
  subtitle: string;
  image: any;
  route: string;
};

export default function MainHomePage() {
  const router = useRouter();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";
  const [topGame, setTopGame] = useState<TopGame | null>(null);

  const topGameByLeague: Record<string, TopGame> = useMemo(
    () => ({
      NBA: {
        id: "nba",
        title: "NBA Draft",
        subtitle: "Most created today",
        image: draftImg,
        route: "/draft/new",
      },
      NFL: {
        id: "nfl",
        title: "NFL Draft",
        subtitle: "Most created today",
        image: nflImg,
        route: "/draft/new?league=NFL",
      },
      CARTOON: {
        id: "cartoon",
        title: "Cartoon Draft",
        subtitle: "Most created today",
        image: cartoonsImg,
        route: "/draft/new?league=CARTOON",
      },
    }),
    []
  );

  useEffect(() => {
    async function loadTopGame() {
      try {
        const res = await fetch(`${API_URL}/drafts`);
        if (!res.ok) return;

        const drafts: DraftRecord[] = await res.json();
        const today = new Date().toDateString();

        const counts = drafts.reduce<Record<string, number>>((acc, draft) => {
          if (!draft.createdAt) return acc;
          const created = new Date(draft.createdAt);
          if (created.toDateString() !== today) return acc;

          const league = (draft.league || "NBA").toUpperCase();
          acc[league] = (acc[league] || 0) + 1;
          return acc;
        }, {});

        const topLeague =
          Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "NBA";

        setTopGame(topGameByLeague[topLeague] || topGameByLeague.NBA);
      } catch (err) {
        console.error("Failed to load today's top game", err);
      }
    }

    loadTopGame();
  }, [API_URL, topGameByLeague]);

  useEffect(() => {
    if (!topGame) {
      setTopGame(topGameByLeague.NBA);
    }
  }, [topGame, topGameByLeague]);

  const games: GameCard[] = [
    {
      id: "draft",
      name: "Drafts",
      image: draftImg,
      enabled: true,
      route: "/draft",
    },
    {
      id: "officialTopPic",
      name: "TopPic",
      image: topPicImg,
      enabled: true,
      route: "/toppic",
    },
    {
      id: "imposter",
      name: "Imposter",
      image: imposterImg,
      enabled: false,
    },
    {
      id: "lineup",
      name: "Lineup Builder",
      image: lineupImg,
      enabled: false,
    },
    {
      id: "quiz",
      name: "Quizzes",
      image: quizImg,
      enabled: false,
    },
    {
      id: "aux",
      name: "Aux Battles",
      image: auxImg,
      enabled: false,
    },
  ];

  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-50 space-y-10">
      <header>
        <h1 className="text-5xl font-extrabold text-indigo-400 mb-2">
          GameHub
        </h1>
        <p className="text-slate-400">
          Competitive games across sports, culture, and creativity.
        </p>
      </header>

      {topGame && (
        <section className="rounded-2xl border border-indigo-500/60 bg-slate-900/60 p-5 md:p-6 flex flex-col md:flex-row gap-4 md:items-center">
          <div className="relative h-36 w-full md:w-48 overflow-hidden rounded-xl border border-indigo-500/40">
            <Image
              src={topGame.image}
              alt={topGame.title}
              fill
              className="object-cover"
              priority
            />
          </div>
          <div className="flex-1 space-y-2">
            <div className="text-sm uppercase tracking-[0.2em] text-indigo-300">
              Today&apos;s Top Game
            </div>
            <h2 className="text-2xl font-bold text-slate-50">
              {topGame.title}
            </h2>
            <p className="text-slate-300 text-sm">{topGame.subtitle}</p>
            <div>
              <button
                onClick={() => router.push(topGame.route)}
                className="mt-2 inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 px-4 py-2 text-sm font-semibold"
              >
                Jump in
              </button>
            </div>
          </div>
        </section>
      )}
      <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => {
          const isDraft = game.id === "draft";

          return (
            <div
              key={game.id}
              className={`relative overflow-hidden rounded-2xl border transition-all ${
                game.enabled
                  ? "border-indigo-500 hover:shadow-indigo-500/40"
                  : "border-slate-700 opacity-60 cursor-not-allowed"
              }`}
            >
              <div
                className={`relative h-48 ${
                  game.enabled ? "cursor-pointer" : "cursor-not-allowed"
                }`}
                onClick={() =>
                  game.enabled && game.route && router.push(game.route)
                }
              >
                <Image
                  src={game.image}
                  alt={game.name}
                  fill
                  className={`object-cover ${!game.enabled ? "grayscale" : ""}`}
                />
              </div>

              <div className="p-4 text-left">
                <h3 className="text-xl font-semibold">{game.name}</h3>
                <p className="text-sm text-slate-400 mb-3">
                  {game.enabled ? "Choose your mode" : "Coming soon"}
                </p>

                {isDraft && (
                  <button
                    onClick={() => router.push("/draft")}
                    className="w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-xs py-2 font-semibold"
                  >
                    Explore Drafts
                  </button>
                )}
              </div>

              {!game.enabled && (
                <span className="absolute top-2 right-2 bg-slate-800 text-xs px-2 py-1 rounded">
                  Soon
                </span>
              )}
            </div>
          );
        })}
      </section>

      {/* <section className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {games.map((game) => (
          <button
            key={game.id}
            onClick={() =>
              game.enabled && game.route && router.push(game.route)
            }
            disabled={!game.enabled}
            className={`relative overflow-hidden rounded-2xl border transition-all ${
              game.enabled
                ? "border-indigo-500 hover:shadow-indigo-500/40"
                : "border-slate-700 opacity-60 cursor-not-allowed"
            }`}
          >
            <div className="relative h-48">
              <Image
                src={game.image}
                alt={game.name}
                fill
                className={`object-cover ${!game.enabled ? "grayscale" : ""}`}
              />
            </div>

            <div className="p-4 text-left">
              <h3 className="text-xl font-semibold">{game.name}</h3>
              <p className="text-sm text-slate-400">
                {game.enabled ? "Play now" : "Coming soon"}
              </p>
            </div>

            {!game.enabled && (
              <span className="absolute top-2 right-2 bg-slate-800 text-xs px-2 py-1 rounded">
                Soon
              </span>
            )}
          </button>
        ))}
      </section> */}
    </main>
  );
}
