/** Pixel scenes for the trivia hub panels of games that have no world map: Pinpoint, Pecking Order and Common Thread. */
export function HubArt({ art, title }: { art: "pinpoint" | "pecking" | "thread"; title: string }) {
  return (
    <figure className="px-world m-0">
      <svg viewBox="0 0 160 90" className="block h-auto w-full" shapeRendering="crispEdges" role="img" aria-label={title}>
        {art === "pinpoint" ? <Pinpoint /> : art === "pecking" ? <Pecking /> : <Thread />}
      </svg>
    </figure>
  );
}

/** A dark grid with guesses closing in on a pulsing target. */
function Pinpoint() {
  const lines = Array.from({ length: 9 }, (_, i) => i);
  const guesses = [{ x: 22, y: 66, c: "#ff4d6d" }, { x: 46, y: 22, c: "#ff9f1c" }, { x: 116, y: 70, c: "#ffd23f" }, { x: 92, y: 36, c: "#3ddc97" }];
  return (
    <>
      <rect width="160" height="90" fill="#0b1f1a" />
      {lines.map((i) => <rect key={`v${i}`} x={i * 20} y="0" width="1" height="90" fill="#123b30" />)}
      {lines.slice(0, 5).map((i) => <rect key={`h${i}`} x="0" y={i * 20 + 5} width="160" height="1" fill="#123b30" />)}
      {guesses.map((g, i) => (
        <g key={i}>
          <path d={`M${g.x + 2} ${g.y + 2} L82 46`} stroke={g.c} strokeOpacity=".35" strokeDasharray="2 3" fill="none" />
          <rect x={g.x} y={g.y} width="5" height="5" fill={g.c} />
        </g>
      ))}
      <g className="hub-pulse" style={{ transformOrigin: "82px 46px" }}>
        <rect x="70" y="45" width="25" height="2" fill="#f2b84b" />
        <rect x="81" y="34" width="2" height="25" fill="#f2b84b" />
        <rect x="74" y="38" width="17" height="17" fill="none" stroke="#f2b84b" strokeWidth="2" />
      </g>
      <rect x="80" y="44" width="4" height="4" fill="#fff0b8" />
    </>
  );
}

/** A ranked ladder at dusk with three birds perched on different rungs, the gold one at the top. */
function Pecking() {
  const rungs = Array.from({ length: 7 }, (_, i) => 14 + i * 11);
  const birds = [{ x: 64, rung: 0, c: "#ffd23f", w: "#e0a800" }, { x: 84, rung: 3, c: "#4cc9f0", w: "#2a8fb5" }, { x: 68, rung: 5, c: "#ff4d6d", w: "#c22f4b" }];
  return (
    <>
      <rect width="160" height="90" fill="#1b1838" />
      <rect y="60" width="160" height="30" fill="#24204a" />
      {[[14, 12], [36, 30], [130, 18], [148, 44], [22, 52], [118, 6]].map(([x, y], i) => <rect key={i} x={x} y={y} width="2" height="2" fill="#6d64b8" />)}
      <rect x="58" y="4" width="3" height="86" fill="#8a5a2b" />
      <rect x="99" y="4" width="3" height="86" fill="#8a5a2b" />
      {rungs.map((y, i) => (
        <g key={y}>
          <rect x="61" y={y} width="38" height="3" fill="#b07a3e" />
          <rect x="104" y={y} width="9" height="5" fill="#0006" />
          <text x="106" y={y + 4} fontSize="5" fill="#9b90d6" fontFamily="var(--font-press), monospace">{i + 1}</text>
        </g>
      ))}
      {birds.map((b, i) => {
        const y = rungs[b.rung]!;
        return (
          <g key={i}>
            <rect x={b.x - 3} y={y - 7} width="4" height="2" fill={b.w} />
            <rect x={b.x} y={y - 7} width="9" height="6" fill={b.c} />
            <rect x={b.x + 2} y={y - 6} width="4" height="3" fill={b.w} />
            <rect x={b.x + 6} y={y - 11} width="5" height="5" fill={b.c} />
            <rect x={b.x + 9} y={y - 10} width="1" height="1" fill="#000" />
            <rect x={b.x + 11} y={y - 9} width="3" height="2" fill="#ff9f1c" />
            <rect x={b.x + 3} y={y - 1} width="1" height="1" fill="#ff9f1c" />
            <rect x={b.x + 6} y={y - 1} width="1" height="1" fill="#ff9f1c" />
          </g>
        );
      })}
      <rect x="70" y="0" width="1" height="2" fill="#ffd23f" />
      <rect x="72" y="0" width="1" height="2" fill="#ffd23f" />
      <rect x="74" y="0" width="1" height="2" fill="#ffd23f" />
    </>
  );
}

/** A cork board with clue cards joined by red string. */
function Thread() {
  const cards = [{ x: 12, y: 12 }, { x: 62, y: 46 }, { x: 108, y: 10 }, { x: 128, y: 52 }];
  const pins = cards.map((c) => ({ x: c.x + 10, y: c.y + 3 }));
  return (
    <>
      <rect width="160" height="90" fill="#8a5a2b" />
      {Array.from({ length: 40 }, (_, i) => <rect key={i} x={(i * 37) % 157} y={(i * 23) % 87} width="2" height="2" fill="#6d4420" />)}
      {cards.map((c, i) => (
        <g key={i}>
          <rect x={c.x + 2} y={c.y + 2} width="22" height="26" fill="#0005" />
          <rect x={c.x} y={c.y} width="22" height="26" fill="#f4ead2" />
          <rect x={c.x + 4} y={c.y + 8} width="14" height="9" fill="#c9b994" />
          <rect x={c.x + 4} y={c.y + 20} width="14" height="2" fill="#9c8b68" />
        </g>
      ))}
      <path className="hub-thread" d={pins.map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`).join(" ")} stroke="#e62e38" strokeWidth="2" fill="none" />
      {pins.map((p, i) => <rect key={i} x={p.x - 2} y={p.y - 2} width="4" height="4" fill="#c9202b" />)}
    </>
  );
}
