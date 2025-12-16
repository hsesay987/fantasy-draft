import {
  CartoonChannel,
  CartoonCharacter,
  CartoonShow,
} from "@prisma/client";

export type CartoonScoringMethod = "system" | "user" | "community";

const CHANNEL_WEIGHTS: Record<CartoonChannel, number> = {
  Disney: 8,
  DisneyXD: 6,
  Nickelodeon: 7,
  CartoonNetwork: 6,
  AdultSwim: 9,
  Netflix: 5,
  Other: 4,
};

function longevityBonus(show: Pick<CartoonShow, "yearFrom" | "yearTo">) {
  const endYear = show.yearTo ?? new Date().getFullYear();
  const span = Math.max(1, endYear - show.yearFrom + 1);
  return Math.min(span, 60); // cap to avoid runaway scores for evergreens
}

function popularityBonus(channel?: CartoonChannel | null) {
  return channel ? CHANNEL_WEIGHTS[channel] ?? 0 : 0;
}

export function scoreCartoonShow(show: CartoonShow): number {
  const rating = show.imdbRating ?? show.googleRating ?? 7;
  return rating * 10 + longevityBonus(show) + popularityBonus(show.channel);
}

export function scoreCartoonCharacter(
  character: CartoonCharacter & { show: CartoonShow }
): number {
  const showScore = scoreCartoonShow(character.show);
  const base = showScore * 0.7;
  const mainBonus = character.isMainCharacter ? 12 : 0;
  const heroBonus = character.isSuperhero ? 10 : 0;
  return base + mainBonus + heroBonus;
}

export function applyCommunityBonus(
  score: number,
  voteTotal: number | null | undefined
) {
  if (!voteTotal) return score;
  return score + (voteTotal > 0 ? 1 : 0);
}
