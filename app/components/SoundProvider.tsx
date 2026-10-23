"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { loadPrefs, playSfx, savePrefs, type SfxName, type SoundPrefs } from "../lib/sound";

type Ctx = SoundPrefs & {
  setMuted: (m: boolean) => void;
  setVolume: (v: number) => void;
  play: (n: SfxName) => void;
};

const SoundCtx = createContext<Ctx>({
  muted: false,
  volume: 0.6,
  setMuted: () => {},
  setVolume: () => {},
  play: () => {},
});

export function SoundProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<SoundPrefs>({ muted: false, volume: 0.6 });

  useEffect(() => {
    setPrefs(loadPrefs());
  }, []);

  const update = useCallback((next: SoundPrefs) => {
    setPrefs(next);
    savePrefs(next);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      ...prefs,
      setMuted: (muted) => update({ ...prefs, muted }),
      setVolume: (volume) => update({ ...prefs, volume }),
      play: (n) => playSfx(n, prefs),
    }),
    [prefs, update]
  );

  return <SoundCtx.Provider value={value}>{children}</SoundCtx.Provider>;
}

export const useSound = () => useContext(SoundCtx);
