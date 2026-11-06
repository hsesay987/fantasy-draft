"use client";

import { useEffect, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { track } from "../../lib/analytics";
import { CATEGORIES } from "../../play/categories";
import { fetchQuiz } from "../../play/onlineApi";
import { bundledCategories, hasTrivia } from "../../topicDraft/trivia";
import type { TriviaCategory } from "../../topicDraft/trivia/types";
import { forgetClimb, freeClimbBank, freeSaveKey } from "../climb";
import { TopRungGame } from "../TopRungGame";

/** Free play on one topic, from the server's trivia bank with the bundled questions as the fallback. It saves under its own key, so it can never touch the daily. */
export default function TopRungFreePlay() {
  const { pool } = useParams<{ pool: string }>();
  const meta = CATEGORIES.find((c) => c.id === pool && !c.hidden && hasTrivia(c.id));
  const id = meta?.id;
  const [climb, setClimb] = useState(0);
  const [bank, setBank] = useState<{ climb: number; categories: TriviaCategory[] } | null>(null);
  useEffect(() => {
    if (!id) return;
    let live = true;
    void freeClimbBank(id, freeSaveKey(id), async (avoid) => (await fetchQuiz("jeopardy", id, avoid))?.categories, () => bundledCategories(id)).then((categories) => {
      if (live) setBank({ climb, categories });
    });
    return () => {
      live = false;
    };
  }, [id, climb]);
  if (!meta) return notFound();
  const saveKey = freeSaveKey(meta.id);
  return (
    <TopRungGame key={climb} categories={bank?.climb === climb ? bank.categories : null} saveKey={saveKey} eyebrow={`${meta.title} · Free climb`}
      onDone={(s, { restored }) => { if (!restored) track("toprung_finished", { pool: meta.id, status: s.status, points: s.points, rung: s.rung, daily: false }); }}
      onAgain={() => { forgetClimb(saveKey); setClimb((n) => n + 1); window.scrollTo(0, 0); }} />
  );
}
