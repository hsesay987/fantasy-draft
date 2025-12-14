// app/hooks/useCommunityAds.ts
"use client";

import { useEffect, useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

export type CommunityAd = {
  id: string;
  title: string;
  body?: string | null;
  imageUrl?: string | null;
  targetUrl: string;
  category?: string | null;
  placement?: string | null;
};

export function useCommunityAds(placement: "rail" | "footer", enabled = true) {
  const [ad, setAd] = useState<CommunityAd | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    setLoading(true);
    fetch(`${API_URL}/ads/community?placement=${placement}`)
      .then((res) => res.json())
      .then((data) => {
        const first = data.ads?.[0];
        if (first) setAd(first);
      })
      .catch(() => {
        setAd(null);
      })
      .finally(() => setLoading(false));
  }, [placement, enabled]);

  return { ad, loading };
}
