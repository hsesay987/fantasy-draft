// app/components/AdSlot.tsx
"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useCommunityAds } from "../hooks/useCommunityAds";

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

const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
const ADSENSE_RAIL_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_RAIL;
const ADSENSE_FOOTER_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_FOOTER;

export default function AdSlot({
  placement,
  variant = "primary",
  className = "",
}: AdSlotProps) {
  const copy = baseCopy[variant];
  const { ad } = useCommunityAds(placement, variant === "community");
  const slotId = placement === "rail" ? ADSENSE_RAIL_SLOT : ADSENSE_FOOTER_SLOT;
  const adsenseReady = !!(ADSENSE_CLIENT && slotId && variant !== "community");

  useEffect(() => {
    if (!adsenseReady) return;
    if (typeof window === "undefined") return;
    try {
      // @ts-ignore
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      console.warn("AdSense push failed", err);
    }
  }, [adsenseReady, slotId]);

  const headline = variant === "community" && ad?.title ? ad.title : copy.title;
  const body = variant === "community" && ad?.body ? ad.body : copy.body;
  const target =
    variant === "community" && ad?.targetUrl ? ad.targetUrl : undefined;
  const ctaHref =
    variant === "community"
      ? target || "/ads/submit"
      : variant === "primary"
      ? "/account/subscription"
      : "/online";

  const isExternalCommunity = variant === "community" && !!target;

  const ctaButton = isExternalCommunity ? (
    <a
      href={target}
      target="_blank"
      rel="noreferrer noopener"
      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-800/70 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700/80"
    >
      Visit sponsor
    </a>
  ) : (
    <Link
      href={ctaHref}
      target={variant === "community" && target ? "_blank" : undefined}
      rel={
        variant === "community" && target ? "noreferrer noopener" : undefined
      }
      className="mt-2 inline-flex items-center gap-2 rounded-lg bg-slate-800/70 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700/80"
    >
      {variant === "community" && ad?.targetUrl ? (
        <span>Visit sponsor</span>
      ) : (
        copy.cta
      )}
    </Link>
  );

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
        <h3 className="text-lg font-semibold text-slate-50">{headline}</h3>
        {body && (
          <p className="text-sm text-slate-400 leading-relaxed">{body}</p>
        )}

        {adsenseReady ? (
          <ins
            className="adsbygoogle block w-full"
            style={{ display: "block" }}
            data-ad-client={ADSENSE_CLIENT}
            data-ad-slot={slotId}
            data-ad-format="auto"
            data-full-width-responsive="true"
          />
        ) : (
          ctaButton
        )}
      </div>
    </div>
  );
}
