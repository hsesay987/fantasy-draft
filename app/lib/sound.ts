// app/lib/sound.ts — synthesized SFX via Web Audio, no asset files.
export type SfxName = "click" | "pick" | "steal" | "tick" | "reveal" | "win" | "error" | "wrong" | "lose" | "delete" | "creak" | "rung" | "rungHigh" | "ledge" | "lamp" | "fall" | "lifeline" | "walkDown";

export type Note = { freq: number; dur: number; at: number; type?: OscillatorType; gain?: number };

export const SFX_DEFS: Record<SfxName, Note[]> = {
  // Top Rung: iron and wind. A low rub as the ladder takes your weight, a boot on a rung, a ship's bell at a safe ledge.
  creak: [
    { freq: 98, dur: 0.16, at: 0, type: "sawtooth", gain: 0.16 },
    { freq: 117, dur: 0.14, at: 0.16, type: "sawtooth", gain: 0.13 },
    { freq: 104, dur: 0.22, at: 0.32, type: "sawtooth", gain: 0.1 },
  ],
  rung: [
    { freq: 233, dur: 0.05, at: 0, type: "square", gain: 0.28 },
    { freq: 466, dur: 0.16, at: 0.05, type: "triangle", gain: 0.42 },
    { freq: 554, dur: 0.2, at: 0.13, type: "triangle", gain: 0.36 },
  ],
  rungHigh: [
    { freq: 311, dur: 0.05, at: 0, type: "square", gain: 0.28 },
    { freq: 622, dur: 0.16, at: 0.05, type: "triangle", gain: 0.42 },
    { freq: 740, dur: 0.16, at: 0.13, type: "triangle", gain: 0.36 },
    { freq: 932, dur: 0.24, at: 0.21, type: "sine", gain: 0.3 },
  ],
  ledge: [
    { freq: 698, dur: 0.5, at: 0, type: "sine", gain: 0.45 },
    { freq: 1397, dur: 0.3, at: 0, type: "sine", gain: 0.14 },
    { freq: 698, dur: 0.7, at: 0.3, type: "sine", gain: 0.4 },
    { freq: 1397, dur: 0.4, at: 0.3, type: "sine", gain: 0.12 },
  ],
  lamp: [
    { freq: 294, dur: 0.16, at: 0, type: "triangle", gain: 0.4 },
    { freq: 392, dur: 0.16, at: 0.13, type: "triangle", gain: 0.4 },
    { freq: 494, dur: 0.16, at: 0.26, type: "triangle", gain: 0.4 },
    { freq: 587, dur: 0.16, at: 0.39, type: "triangle", gain: 0.4 },
    { freq: 784, dur: 0.9, at: 0.54, type: "triangle", gain: 0.4 },
    { freq: 988, dur: 0.9, at: 0.54, type: "sine", gain: 0.26 },
    { freq: 1175, dur: 1.1, at: 0.54, type: "sine", gain: 0.2 },
  ],
  fall: [
    { freq: 622, dur: 0.1, at: 0, type: "square", gain: 0.2 },
    { freq: 494, dur: 0.1, at: 0.08, type: "square", gain: 0.2 },
    { freq: 370, dur: 0.1, at: 0.16, type: "square", gain: 0.2 },
    { freq: 277, dur: 0.1, at: 0.24, type: "square", gain: 0.2 },
    { freq: 196, dur: 0.12, at: 0.32, type: "square", gain: 0.2 },
    { freq: 82, dur: 0.4, at: 0.44, type: "triangle", gain: 0.55 },
  ],
  lifeline: [
    { freq: 880, dur: 0.07, at: 0, type: "sine", gain: 0.3 },
    { freq: 659, dur: 0.07, at: 0.06, type: "sine", gain: 0.3 },
    { freq: 1109, dur: 0.18, at: 0.12, type: "sine", gain: 0.3 },
  ],
  walkDown: [
    { freq: 494, dur: 0.1, at: 0, type: "triangle", gain: 0.35 },
    { freq: 415, dur: 0.1, at: 0.14, type: "triangle", gain: 0.35 },
    { freq: 370, dur: 0.1, at: 0.28, type: "triangle", gain: 0.35 },
    { freq: 330, dur: 0.3, at: 0.42, type: "triangle", gain: 0.35 },
  ],
  click: [{ freq: 520, dur: 0.05, at: 0, type: "triangle", gain: 0.5 }],
  pick: [
    { freq: 392, dur: 0.09, at: 0, type: "square", gain: 0.35 },
    { freq: 587, dur: 0.14, at: 0.07, type: "square", gain: 0.35 },
  ],
  steal: [
    { freq: 660, dur: 0.08, at: 0, type: "sawtooth", gain: 0.35 },
    { freq: 330, dur: 0.16, at: 0.08, type: "sawtooth", gain: 0.35 },
  ],
  tick: [{ freq: 880, dur: 0.03, at: 0, type: "sine", gain: 0.4 }],
  reveal: [
    { freq: 262, dur: 0.12, at: 0, type: "triangle" },
    { freq: 330, dur: 0.12, at: 0.1, type: "triangle" },
    { freq: 392, dur: 0.12, at: 0.2, type: "triangle" },
    { freq: 523, dur: 0.25, at: 0.3, type: "triangle" },
  ],
  win: [
    { freq: 523, dur: 0.12, at: 0, type: "square", gain: 0.3 },
    { freq: 659, dur: 0.12, at: 0.12, type: "square", gain: 0.3 },
    { freq: 784, dur: 0.12, at: 0.24, type: "square", gain: 0.3 },
    { freq: 1047, dur: 0.4, at: 0.36, type: "square", gain: 0.3 },
  ],
  // Game-show buzzer: two low, harsh tones.
  wrong: [
    { freq: 140, dur: 0.22, at: 0, type: "sawtooth", gain: 0.45 },
    { freq: 110, dur: 0.32, at: 0.2, type: "square", gain: 0.4 },
  ],
  // Sad trombone: slow falling notes for a lost round, lot or game.
  lose: [
    { freq: 392, dur: 0.18, at: 0, type: "triangle", gain: 0.4 },
    { freq: 349, dur: 0.18, at: 0.18, type: "triangle", gain: 0.4 },
    { freq: 311, dur: 0.18, at: 0.36, type: "triangle", gain: 0.4 },
    { freq: 220, dur: 0.5, at: 0.54, type: "triangle", gain: 0.4 },
  ],
  // Soft downward blip for throwing something away.
  delete: [
    { freq: 330, dur: 0.07, at: 0, type: "triangle", gain: 0.35 },
    { freq: 196, dur: 0.12, at: 0.06, type: "triangle", gain: 0.35 },
  ],
  error: [
    { freq: 200, dur: 0.12, at: 0, type: "sawtooth", gain: 0.35 },
    { freq: 150, dur: 0.18, at: 0.1, type: "sawtooth", gain: 0.35 },
  ],
};

export type SoundPrefs = { muted: boolean; volume: number };
const KEY = "toppic:sound";
const DEFAULTS: SoundPrefs = { muted: false, volume: 0.6 };

export function loadPrefs(): SoundPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const p = JSON.parse(raw);
    return {
      muted: !!p.muted,
      volume: typeof p.volume === "number" ? Math.min(1, Math.max(0, p.volume)) : DEFAULTS.volume,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(p: SoundPrefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playSfx(name: SfxName, prefs: SoundPrefs) {
  if (prefs.muted || prefs.volume <= 0) return;
  const ac = getCtx();
  if (!ac) return;
  const t0 = ac.currentTime;
  for (const n of SFX_DEFS[name]) {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = n.type ?? "sine";
    osc.frequency.value = n.freq;
    const peak = (n.gain ?? 0.4) * prefs.volume * 0.5;
    const s = t0 + n.at;
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), s + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, s + n.dur);
    osc.connect(g).connect(ac.destination);
    osc.start(s);
    osc.stop(s + n.dur + 0.02);
  }
}
