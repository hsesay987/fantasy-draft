"use client";

import { useAuth } from "./useAuth";

export function useAds() {
  const { user } = useAuth();

  if (!user) return true; // guests see ads

  if (user.isAdmin) return false;
  if (user.isFounder) return false;

  if (user.subscriptionTier) {
    const ends = user.subscriptionEnds ? new Date(user.subscriptionEnds) : null;
    if (!ends || ends.getTime() > Date.now()) {
      return false;
    }
  }

  return true;
}
