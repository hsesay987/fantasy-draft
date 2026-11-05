"use client";

import { useMemo, useState } from "react";
import { notFound, useParams } from "next/navigation";
import { track } from "../../lib/analytics";
import { CATEGORIES } from "../../play/categories";
import { bundledCategories, hasTrivia } from "../../topicDraft/trivia";
import { freeSaveKey, forgetClimb } from "../climb";
import { TopRungGame } from "../TopRungGame";

/** Free play on one topic's bundled questions. It saves under its own key, so it can never touch the daily. */
export default function TopRungFreePlay() {
  const { pool } = useParams<{ pool: string }>();
  const meta = CATEGORIES.find((c) => c.id === pool && !c.hidden && hasTrivia(c.id));
  const categories = useMemo(() => (meta ? bundledCategories(meta.id) : []), [meta]);
  const [climb, setClimb] = useState(0);
  if (!meta) return notFound();
  const saveKey = freeSaveKey(meta.id);
  return (
    <TopRungGame key={climb} categories={categories} saveKey={saveKey} eyebrow={`${meta.title} · Free climb`}
      onDone={(s, { restored }) => { if (!restored) track("toprung_finished", { pool: meta.id, status: s.status, points: s.points, rung: s.rung, daily: false }); }}
      onAgain={() => { forgetClimb(saveKey); setClimb((n) => n + 1); window.scrollTo(0, 0); }} />
  );
}
