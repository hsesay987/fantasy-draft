import { redirect } from "next/navigation";

// Old topic-draft links now open the Classic Draft with that pool preselected.
export default async function Page({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  redirect(`/play/snake?pool=${encodeURIComponent(game)}`);
}
