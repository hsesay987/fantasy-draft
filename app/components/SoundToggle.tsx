"use client";

import { Volume2, VolumeX } from "lucide-react";
import { useSound } from "./SoundProvider";

export default function SoundToggle() {
  const { muted, setMuted, play } = useSound();
  return (
    <button
      type="button"
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      aria-pressed={muted}
      onClick={() => {
        if (muted) {
          setMuted(false);
          setTimeout(() => play("pick"), 0);
        } else setMuted(true);
      }}
      className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-white"
    >
      {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
    </button>
  );
}
