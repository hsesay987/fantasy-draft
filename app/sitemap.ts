import type { MetadataRoute } from "next";
import { LANDINGS } from "./games/landing";
import { TOPICS } from "./play/categories";

const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? "https://toppicgames.com";

/** The pages worth finding in a search: the tabs, every game's own page and every topic. */
export default function sitemap(): MetadataRoute.Sitemap {
  const page = (path: string, priority: number, changeFrequency: "daily" | "weekly" | "monthly" = "weekly") => ({ url: `${SITE}${path}`, changeFrequency, priority });
  return [
    page("", 1, "daily"),
    ...["/drafts", "/trivia", "/online", "/community", "/games"].map((p) => page(p, 0.8)),
    page("/daily", 0.8, "daily"),
    ...LANDINGS.map((l) => page(`/games/${l.slug}`, 0.9, "monthly")),
    ...TOPICS.map((t) => page(`/category/${t.id}`, 0.5, "monthly")),
  ];
}
