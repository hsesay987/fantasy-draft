"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PixelButton } from "../../components/pixel/PixelUI";
import { useSound } from "../../components/SoundProvider";
import type { GameCtl } from "../useGame";

/**
 * Online party games: the host's Pause button, and the cover every device shows while the game is paused. The cover
 * hides the game so nobody types or reads ahead; the server refuses moves anyway and every timer stands still.
 */
export function PauseLayer({ ctl }: { ctl: GameCtl }) {
  // Rendered into <body>: the screen-mode board is a containing block, which would pin "fixed" to it and under the top bar.
  const body = useSyncExternalStore(noSubscribe, () => document.body, () => null);
  return body ? createPortal(<Layer ctl={ctl} />, body) : null;
}

const noSubscribe = () => () => {};

function Layer({ ctl }: { ctl: GameCtl }): ReactNode {
  const { play } = useSound();
  const host = !!ctl.setPaused;
  useEffect(() => { if (ctl.paused) play("click"); }, [ctl.paused, play]);

  if (ctl.paused) {
    return (
      <div role="dialog" aria-modal="true" aria-labelledby="pause-title" className="pixel"
        style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 16, background: "rgba(7, 4, 25, 0.9)", backdropFilter: "blur(6px)" }}>
        <section className="px-box px-pad" style={{ maxWidth: 360, width: "100%", textAlign: "center" }}>
          <h2 id="pause-title" style={{ font: "400 28px var(--px-title)", color: "var(--px-gold)", margin: "4px 0 12px" }}>Paused</h2>
          <p style={{ font: "400 20px var(--px-body)", color: "var(--px-fg)", margin: 0 }}>{host ? "Every timer has stopped. Resume when everyone is back." : "The host paused the game. Every timer has stopped."}</p>
          {host && <PixelButton variant="gold" autoFocus onClick={() => ctl.setPaused?.(false)} style={{ marginTop: 16, width: "100%" }}>Resume</PixelButton>}
        </section>
      </div>
    );
  }
  if (!host) return null;
  return (
    // On phones it docks in the empty middle of the top bar, where it covers no answer box or Lock in button.
    <div className="pixel px-pause-dock">
      <PixelButton variant="alt" aria-label="Pause the game" title="Pause" onClick={() => ctl.setPaused?.(true)}>❚❚</PixelButton>
    </div>
  );
}
