import type { Tier } from "../../topicDraft/npat/rules";
import { GEMS } from "../../topicDraft/npat/rules";
import { C, GEM_SPRITE } from "./world";

type Pen = Pick<CanvasRenderingContext2D, "fillStyle" | "fillRect">;

/** Miner sprite rows and its colour key (ported from the approved mockup). */
export const MINER = [" yyyy  ", "yyyyyyl", " ssss  ", " sese  ", " bbbbp ", "bbbbbbp", " bbbb p", " dddd  ", " d  d  ", " k  k  "];
export const MINER_INK: Record<string, string> = { y: C.ll, l: C.cl, s: "#e8b98f", e: C.ink, b: C.bl, d: C.so, k: C.ink, p: C.cy };

/** Draws the 5×5 gem for a tier at (x, y), shifted up by `o` pixels (the camera offset). */
export function drawGem(k: Pen, x: number, y: number, tier: Tier, o = 0) {
  const gm = GEMS[tier];
  GEM_SPRITE.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === " ") return;
    k.fillStyle = ch === "a" ? gm.dark : ch === "b" ? gm.light : C.cl;
    k.fillRect(Math.round(x + i), Math.round(y + j - o), 1, 1);
  }));
}

/** Draws the miner at (x, y); `tint` recolours the overalls so each lane's miner is told apart. */
export function drawMiner(k: Pen, x: number, y: number, o: number, tint?: string) {
  MINER.forEach((row, j) => [...row].forEach((ch, i) => {
    if (ch === " ") return;
    k.fillStyle = ch === "b" && tint ? tint : MINER_INK[ch];
    k.fillRect(Math.round(x + i), Math.round(y + j - o), 1, 1);
  }));
}
