import type { Metadata } from "next";
import { Suspense } from "react";
import { Gamepad2 } from "lucide-react";
import { PageHeader, PageShell } from "../components/ui";
import { GamesList } from "./GamesList";

export const metadata: Metadata = {
  title: "All Games: Drafts, Trivia and Party Games",
  description: "Every TopPic game in one place: draft games for any topic, daily trivia puzzles and party games everyone plays on their own phone. All free in your browser.",
  alternates: { canonical: "/games" },
};

/** The directory of every game. Each tile opens that game's own page. */
export default function GamesPage() {
  return (
    <PageShell width="lg" className="space-y-10">
      <PageHeader title="All games" subtitle="Every way to play TopPic: draft a team, take a quiz, or get the group on their phones." icon={Gamepad2} />
      <Suspense fallback={null}><GamesList /></Suspense>
    </PageShell>
  );
}
