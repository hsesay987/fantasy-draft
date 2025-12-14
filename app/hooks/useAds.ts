"use client";

import { useAuth } from "./useAuth";

export function useAds(): { showAds: boolean; reason: string | null } {
  const { user } = useAuth();

  if (!user) return { showAds: true, reason: null }; // guests see ads

  if (user.isAdmin) return { showAds: false, reason: "admin" };
  if (user.isFounder) return { showAds: false, reason: "founder" };

  if (user.subscriptionTier) {
    const ends = user.subscriptionEnds ? new Date(user.subscriptionEnds) : null;
    if (!ends || ends.getTime() > Date.now()) {
      return { showAds: false, reason: user.subscriptionTier };
    }
  }

  return { showAds: true, reason: null };
}
