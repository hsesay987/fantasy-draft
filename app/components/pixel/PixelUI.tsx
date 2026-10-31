"use client";

import "./pixel.css";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/** Wrapper that switches a page to the pixel look. */
export function PixelShell({ children, className = "", world }: { children: ReactNode; className?: string; world?: "summit" | "sky" | "launch" }) {
  return <div className={`pixel min-h-[calc(100vh-4rem)] ${className}`} data-world={world}><div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-10">{children}</div></div>;
}

export function PixelBox({ children, className = "", pad = true, as: Tag = "div" }: { children: ReactNode; className?: string; pad?: boolean; as?: "div" | "section" | "aside" }) {
  return <Tag className={`px-box ${pad ? "px-pad" : ""} ${className}`}>{children}</Tag>;
}

export function PixelButton({ variant, className = "", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "alt" | "gold" }) {
  return <button type="button" {...rest} className={`px-btn ${variant ?? ""} ${className}`} />;
}

export function PixelScore({ rows }: { rows: { name: string; value: string; active?: boolean }[] }) {
  return (
    <ul className="px-score m-0 p-0" aria-label="Scores">
      {rows.map((r) => <li key={r.name} className={r.active ? "on" : ""}><span>{r.name}</span><b>{r.value}</b></li>)}
    </ul>
  );
}
