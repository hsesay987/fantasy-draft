// app/page.tsx
"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import draftImg from "./assets/nba.jpg";
import imposterImg from "./assets/imposter.jpg";
import lineupImg from "./assets/lineup.jpg";
import quizImg from "./assets/quiz.jpg";
import auxImg from "./assets/music.jpg";

type GameCard = {
  id: string;
  name: string;
  image: any;
  enabled: boolean;
  route?: string;
};

export default function MainHomePage() {
  const router = useRouter();

  const games: GameCard[] = [
    {
      id: "draft",
      name: "Drafts",
      image: draftImg,
      enabled: true,
      route: "/draft",
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
