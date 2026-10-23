"use client";

import { useEffect, useRef, useState } from "react";
import { cachedImage, fetchCharacterImage } from "../lib/characterImages";

const PALETTE = ["#7c3aed", "#f43f5e", "#0ea5e9", "#10b981", "#f59e0b", "#d946ef", "#6366f1", "#14b8a6"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const initials = (name: string) =>
  name.replace(/\(.*?\)/g, "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

/** Character picture with a colourful initials fallback (also shown while loading or offline). */
export function CharacterAvatar({ name, query, size = 48, className = "" }: { name: string; query?: string; size?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [src, setSrc] = useState<string | null>(() => (query ? cachedImage(query) ?? null : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!query || src || failed) return;
    const el = ref.current;
    let live = true;
    const go = () => fetchCharacterImage(query).then((s) => live && s && setSrc(s));
    if (!el || typeof IntersectionObserver === "undefined") {
      go();
      return () => void (live = false);
    }
    const io = new IntersectionObserver((e) => {
      if (e[0]?.isIntersecting) {
        io.disconnect();
        go();
      }
    }, { rootMargin: "120px" });
    io.observe(el);
    return () => {
      live = false;
      io.disconnect();
    };
  }, [query, src, failed]);

  const c = PALETTE[hash(name) % PALETTE.length]!;
  return (
    <span
      ref={ref}
      aria-hidden
      className={`relative inline-grid shrink-0 place-items-center overflow-hidden rounded-xl font-display text-white ${className}`}
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${c}, #1e1c35)`, fontSize: size * 0.36 }}
    >
      {initials(name)}
      {src && !failed && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover object-top" />
      )}
    </span>
  );
}
