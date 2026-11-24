"use client";

import { catTitle } from "../../play/views/npatParts";
import { C } from "./world";

/**
 * The dig's categories as a row of cards. Ones already played show their name, the open one (`at`) flips face up,
 * and the rest stay face down, so nobody knows a category until its turn comes. `at` of -1 keeps every card down.
 */
export default function CategoryCards({ categories, at }: { categories: string[]; at: number }) {
  return (
    <ol className="np-cards" aria-label={`${categories.length} categories`} style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, listStyle: "none", padding: 0, margin: "8px 0" }}>
      {categories.map((c, i) => {
        const up = i <= at, open = i === at;
        return (
          <li key={`${i}.${c}`} className={open ? "np-card-flip" : undefined} aria-label={up ? catTitle(c) : `Category ${i + 1}, hidden`}
            style={{ minWidth: 64, padding: "6px 8px", font: "700 11px ui-monospace, monospace", textAlign: "center", textTransform: "uppercase",
              background: open ? C.ll : up ? C.bo : C.rd, color: up ? C.ink : C.cyan, border: `3px solid ${C.ink}`,
              boxShadow: open ? `0 0 0 3px ${C.la}, 0 4px 0 ${C.ink}` : `0 3px 0 ${C.ink}`, opacity: up && !open ? 0.6 : 1 }}>
            {up ? catTitle(c) : "?"}
          </li>
        );
      })}
      <style>{`.np-card-flip{animation:np-flip 420ms steps(6) both}@keyframes np-flip{0%{transform:rotateY(90deg) scale(1.2)}60%{transform:rotateY(0) scale(1.15)}100%{transform:none}}
        .np-reveal{animation:np-reveal 520ms cubic-bezier(.2,1.4,.4,1) both}@keyframes np-reveal{0%{transform:scale(.4) rotate(-4deg);opacity:0}100%{transform:none;opacity:1}}
        @media (prefers-reduced-motion: reduce){.np-card-flip,.np-reveal{animation:none}}`}</style>
    </ol>
  );
}
