type AdSlotProps = {
  placement: "rail" | "footer";
  variant?: "primary" | "secondary" | "community";
  className?: string;
};

const baseCopy: Record<
  NonNullable<AdSlotProps["variant"]>,
  { title: string; body: string; cta: string; accent: string }
> = {
  primary: {
    title: "Draft smarter with Pro tiers",
    body: "Unlock deeper stats, richer eras, and priority game access.",
    cta: "Upgrade now",
    accent: "from-indigo-500/80 via-indigo-400/70 to-sky-400/60",
  },
  secondary: {
    title: "Bring friends, earn boosts",
    body: "Share your lobby code and get bonus rerolls for your crew.",
    cta: "Invite friends",
    accent: "from-emerald-500/80 via-teal-400/70 to-cyan-400/60",
  },
  community: {
    title: "Sponsor the community",
    body: "Have a league, podcast, or brand? Feature it tastefully here.",
    cta: "Place your ad",
    accent: "from-amber-500/80 via-orange-400/70 to-pink-400/60",
  },
};

export default function AdSlot({
  placement,
  variant = "primary",
  className = "",
}: AdSlotProps) {
  const copy = baseCopy[variant];

  return (
    <div
      className={`rounded-2xl border border-slate-800 bg-slate-900/70 shadow-lg overflow-hidden ${className}`}
    >
      <div
        className={`h-1 w-full bg-gradient-to-r ${copy.accent}`}
        aria-hidden
      />
      <div className="p-4 space-y-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
          {placement === "rail" ? "Sponsored" : "Sponsored spot"}
        </p>
        <h3 className="text-lg font-semibold text-slate-50">{copy.title}</h3>
        <p className="text-sm text-slate-400 leading-relaxed">{copy.body}</p>
        <button className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-800/70 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700/80">
          {copy.cta}
        </button>
      </div>
    </div>
  );
}
