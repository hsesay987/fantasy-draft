"use client";

import { useEffect } from "react";
import { Check, X } from "lucide-react";
import { Button } from "../components/ui";

/** Sticky confirm bar: Enter confirms, Esc cancels. */
export function PickBar({
  label,
  sub,
  cta,
  onConfirm,
  onCancel,
  children,
}: {
  label: string;
  sub?: string;
  cta: string;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (["INPUT", "TEXTAREA"].includes(t.tagName)) return;
      if (e.key === "Enter") onConfirm();
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onConfirm, onCancel]);

  return (
    <div className="fixed inset-x-0 bottom-16 z-30 border-t border-white/10 bg-background/90 p-3 backdrop-blur-xl md:bottom-0">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3">
        <button aria-label="Cancel selection" onClick={onCancel} className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{label}</div>
          {sub && <div className="truncate text-xs text-muted-foreground">{sub}</div>}
        </div>
        {children}
        <Button variant="accent" onClick={onConfirm}>
          <Check className="h-4 w-4" aria-hidden /> {cta}
        </Button>
      </div>
    </div>
  );
}
