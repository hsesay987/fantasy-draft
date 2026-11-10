"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * While the player types, the site's bottom bar steps aside, and on a short screen the scene is cut down to the sheet so the
 * letters and the input fit together above the keyboard. iOS doesn't shrink the page for its keyboard, so the visual viewport
 * decides. Returns whether the scene should be compact. `active` is false once there is no input to watch (the game is over).
 */
export function useTypingStage(input: RefObject<HTMLInputElement | null>, stage: RefObject<HTMLElement | null>, active: boolean): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const el = input.current;
    if (!el || !active) return;
    const vv = window.visualViewport;
    let compactNow = false;
    const update = () => {
      const typingNow = document.activeElement === el;
      document.documentElement.toggleAttribute("data-vp-typing", typingNow);
      const short = Math.min(window.innerHeight, vv?.height ?? Infinity) < 520;
      const next = typingNow && short;
      if (next && !compactNow) requestAnimationFrame(() => stage.current?.scrollIntoView({ block: "start" }));
      compactNow = next;
      setCompact(next);
    };
    update();
    el.addEventListener("focus", update);
    el.addEventListener("blur", update);
    vv?.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("focus", update);
      el.removeEventListener("blur", update);
      vv?.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      document.documentElement.removeAttribute("data-vp-typing");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
  return compact;
}
