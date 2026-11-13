"use client";

import { notFound, useParams } from "next/navigation";
import { peckingList } from "../../topicDraft/pecking/lists";
import { PeckingSolo } from "../PeckingSolo";

/** Free play on one ranked list. An unknown list has no page. */
export default function PeckingList() {
  const { list } = useParams<{ list: string }>();
  const found = peckingList(list);
  if (!found) return notFound();
  return <PeckingSolo key={found.id} lists={[found]} count={6} />;
}
