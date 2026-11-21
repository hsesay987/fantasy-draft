import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { PageHeader, PageShell } from "../components/ui";
import { DailyList } from "./DailyList";

export const metadata: Metadata = {
  title: "Daily Puzzles: A New Trivia Game Every Day",
  description: "Free daily trivia puzzles: Summit, Hot Air, Top Rung, Pecking Order, Costimation and Name Place Animal Thing. Same puzzle for everyone, new every day.",
  alternates: { canonical: "/daily" },
};

/** The Daily tab: every puzzle that is the same for everyone today. */
export default function DailyPage() {
  return (
    <PageShell width="lg" className="space-y-8">
      <PageHeader title="Daily" subtitle="One puzzle each, the same for everyone, new every day. Compare your score once you finish." icon={CalendarDays} />
      <DailyList />
    </PageShell>
  );
}
