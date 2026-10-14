"use client";

import { Eye } from "lucide-react";

/** Consistent top strip for every format. Mystery missions stay hidden until the verdict. */
export function GameFrame({
  kicker,
  headline,
  mission,
  mystery,
  right,
  children,
}: {
  kicker: string;
  headline: string;
  mission: { title: string };
  mystery: boolean;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 bg-card/70 p-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">{kicker}</p>
          <h1 className="truncate text-2xl md:text-3xl">{headline}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            {mystery ? /* eslint-disable-next-line @next/next/no-img-element */ <img src="/icons/mystery-block.png" alt="" width={18} height={18} className="h-[18px] w-[18px] shrink-0" /> : <Eye className="h-4 w-4 shrink-0" aria-hidden />}
            <span className="truncate">{mystery ? "Mission hidden — revealed at the verdict" : mission.title}</span>
          </p>
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}
