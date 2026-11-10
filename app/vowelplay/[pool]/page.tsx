"use client";

import { notFound, useParams } from "next/navigation";
import { VOWEL_TOPICS } from "../../topicDraft/party/vowelWords";
import { VowelPlayGame } from "../VowelPlayGame";

/** Solo on one topic. A topic with no names has no page. */
export default function VowelPlayTopic() {
  const { pool } = useParams<{ pool: string }>();
  const topic = VOWEL_TOPICS.find((t) => t.id === pool);
  if (!topic) return notFound();
  return <VowelPlayGame key={topic.id} topic={topic.id} title={topic.title} />;
}
