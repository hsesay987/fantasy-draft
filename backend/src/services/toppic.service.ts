import prisma from "../lib/prisma";

export type TopPicPool = "NBA" | "NFL" | "CARTOON" | "MULTI";

export type TopPicPromptCard = {
  id: string;
  text: string;
  pool: TopPicPool;
  rating: "family" | "adult";
  tags?: string[];
};

export type TopPicResponseCard = {
  id: string;
  text: string;
  pool: TopPicPool;
  source: string;
  rating?: "family" | "adult";
};

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: T[], seed: string): T[] {
  const rand = mulberry32(
    seed
      .split("")
      .reduce((acc, ch) => acc + ch.charCodeAt(0), 0) || 1
  );
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const baseOpeners = [
  "In the final possession everyone remembers,",
  "During a chaotic timeout,",
  "On live TV draft night,",
  "When the locker room went silent,",
  "As the internet begged for a new meme,",
  "When the underdog storyline peaked,",
  "At the midnight shootaround,",
  "During a rain delay nobody expected,",
  "When ratings hit an all-time high,",
  "On the biggest rivalry night of the year,",
  "Inside a crossover episode none of us asked for,",
  "As the play-in chaos unfolded,",
  "During a cold-open monologue,",
  "On the team flight with no Wi-Fi,",
  "When the fan vote went off the rails,",
  "In the multiverse special edition,",
  "On the retro throwback night,",
  "As trade rumors heated up,",
  "Right after a mic’d-up moment leaked,",
  "When a mystery envelope changed everything,",
];

const familyHooks = [
  "became the unexpected hero.",
  "delivered the monologue of the decade.",
  "turned chaos into pure art.",
  "was trending before the play even ended.",
  "rewrote the playbook in real time.",
  "finally got the respect they deserved.",
  "stole the spotlight from the actual star.",
  "called game and strutted off.",
  "made the crowd gasp in unison.",
  "broke the algorithm with one look.",
  "quieted every doubter in the arena.",
  "kept the receipts and cashed them in.",
  "left the commentators speechless.",
  "became the group chat’s favorite gif.",
  "hit the perfectly timed celebration.",
  "called their shot and nailed it.",
  "out-foxed the coach on live TV.",
  "turned a broken play into art.",
  "made the mascot reconsider everything.",
  "landed the quote of the night.",
  "earned a documentary in real time.",
  "made the villain arc irresistible.",
  "brought back a forgotten catchphrase.",
  "forced the analytics team to recalc.",
  "won the internet without trying.",
  "owned the press conference after.",
  "turned defense into pure theater.",
  "was the only one reading the script.",
  "became the season’s weirdest highlight.",
  "made the blooper reel legendary.",
  "forced the refs to check the rulebook.",
  "made the theme song hit different.",
  "was the perfect cameo choice.",
  "created the ultimate crossover moment.",
  "made the sponsor logo iconic.",
];

const adultHooks = [
  "sparked a postgame rant that needed censoring.",
  "dropped a mic’d-up line the league fined later.",
  "made the halftime show way too real.",
  "turned trash talk into performance art.",
  "forced the broadcast to cut to commercial.",
  "had the group chat asking if this is PG-13.",
  "made the late-night hosts blush.",
  "walked right past the PR handler.",
  "demanded the camera zoom out immediately.",
  "made the rated-R director’s cut canon.",
  "turned the wholesome arc upside down.",
  "left the broadcast delay button exhausted.",
];

const twistEndings = [
  "with zero context provided.",
  "while the crowd tried to narrate.",
  "and the league’s social team clipped it instantly.",
  "before anyone realized what happened.",
  "with a soundtrack nobody expected.",
  "as the mascot looked betrayed.",
  "during the longest replay review ever.",
  "without breaking eye contact.",
  "and the postgame memes wrote themselves.",
  "making the historians take notes.",
  "and it somehow felt inevitable.",
  "with the perfect camera angle.",
  "as confetti fell way too early.",
  "before the sponsor read finished.",
  "and the internet agreed for once.",
];

const nbaMoments = [
  "at Madison Square Garden.",
  "after a step-back that froze time.",
  "right after a failed coach’s challenge.",
  "in the middle of a full-court press.",
  "during the ring ceremony.",
  "as the shot clock malfunctioned.",
  "on a vintage teal court.",
  "during a double-overtime thriller.",
  "after a skyhook tutorial.",
  "as the bench mob lost its mind.",
];

const nflMoments = [
  "on a frozen field in December.",
  "right after a brutal hit.",
  "with the game clock reading 0:01.",
  "after a trick play nobody practiced.",
  "during the loudest two-minute drill ever.",
  "in the shadow of the uprights.",
  "while the rain soaked every playbook.",
  "at the coin toss that felt scripted.",
  "in a snow game for the ages.",
  "during a fourth-and-forever miracle.",
];

const cartoonMoments = [
  "in a hand-drawn background reveal.",
  "midway through a theme-song remix.",
  "as the fourth wall shattered.",
  "in a Saturday morning cold open.",
  "during a crossover nobody predicted.",
  "with the villain suddenly relatable.",
  "when the laugh track cut out.",
  "after a portal went wrong.",
  "inside a retro 2D montage.",
  "during the musical episode.",
];

const cultureMoments = [
  "in the cinematic universe nobody mapped.",
  "during a brand collab livestream.",
  "at the award show after-party.",
  "in an arena of neon lights.",
  "on the rooftop after credits scene.",
  "during a surprise remix drop.",
  "inside a glitchy VR set.",
  "while the documentary crew kept filming.",
  "at the midnight premiere.",
  "during the summer league of pop culture.",
];

function buildCandidatePrompts(): TopPicPromptCard[] {
  let idx = 1;
  const candidates: TopPicPromptCard[] = [];

  function pushPrompt(
    pool: TopPicPool,
    opener: string,
    hook: string,
    twist: string,
    rating: "family" | "adult",
    tags: string[]
  ) {
    candidates.push({
      id: `TP-${idx.toString().padStart(4, "0")}`,
      text: `${opener} ____ ${hook} ${twist}`.replace(/\s+/g, " ").trim(),
      pool,
      rating,
      tags,
    });
    idx += 1;
  }

  const pools: { pool: TopPicPool; moments: string[]; tags: string[] }[] = [
    { pool: "NBA", moments: nbaMoments, tags: ["basketball"] },
    { pool: "NFL", moments: nflMoments, tags: ["football"] },
    { pool: "CARTOON", moments: cartoonMoments, tags: ["animation"] },
    { pool: "MULTI", moments: cultureMoments, tags: ["culture"] },
  ];

  for (const { pool, moments, tags } of pools) {
    for (const opener of baseOpeners) {
      for (const hook of familyHooks) {
        for (const twist of [...moments, ...twistEndings]) {
          pushPrompt(pool, opener, hook, twist, "family", tags);
        }
      }

      for (const hook of adultHooks) {
        for (const twist of [...moments, ...twistEndings]) {
          pushPrompt(pool, opener, hook, twist, "adult", tags);
        }
      }
    }
  }

  return candidates;
}

const PROMPT_CANDIDATES = buildCandidatePrompts();

export function buildPromptDeck(options: {
  pools: TopPicPool[];
  allowAdult: boolean;
  seed?: string;
  take?: number;
}) {
  const { pools, allowAdult, seed = "toppic", take = 500 } = options;
  const enabledPools = pools.includes("MULTI") ? pools : [...pools, "MULTI"];

  const filtered = PROMPT_CANDIDATES.filter(
    (card) =>
      enabledPools.includes(card.pool) && (allowAdult || card.rating === "family")
  );

  const deck = seededShuffle(filtered, seed);
  return deck.slice(0, Math.min(take, deck.length));
}

export async function buildResponseCards(options: {
  pools: TopPicPool[];
  allowAdult: boolean;
  seed?: string;
}) {
  const { pools, allowAdult, seed = "toppic-responses" } = options;
  const enabledPools = pools.includes("MULTI") ? pools : [...pools, "MULTI"];
  const cards: TopPicResponseCard[] = [];

  if (enabledPools.includes("NBA")) {
    const nbaPlayers = await prisma.nBAPlayer.findMany({
      where: { fitTopPicEligible: true },
      take: 400,
      orderBy: { lastName: "asc" },
    });
    nbaPlayers.forEach((p) => {
      cards.push({
        id: `NBA-${p.id}`,
        text: p.name,
        pool: "NBA",
        source: p.primaryTeam || "NBA",
        rating: "family",
      });
    });
  }

  if (enabledPools.includes("NFL")) {
    const nflPlayers = await prisma.nFLPlayer.findMany({
      where: { fitTopPicEligible: true },
      take: 400,
      orderBy: { lastName: "asc" },
    });
    nflPlayers.forEach((p) => {
      cards.push({
        id: `NFL-${p.id}`,
        text: p.name,
        pool: "NFL",
        source: p.teams?.[0] || "NFL",
        rating: "family",
      });
    });
  }

  if (enabledPools.includes("CARTOON") || enabledPools.includes("MULTI")) {
    const characters = await prisma.cartoonCharacter.findMany({
      where: {
        fitTopPicEligible: true,
        show: allowAdult ? undefined : { ageRating: { not: "adult" } },
      },
      include: { show: true },
      take: 400,
      orderBy: { name: "asc" },
    });

    characters.forEach((c) => {
      cards.push({
        id: `CARTOON-${c.id}`,
        text: c.name,
        pool: "CARTOON",
        source: c.show?.name || "Cartoon",
        rating: c.show?.ageRating === "adult" ? "adult" : "family",
      });
    });
  }

  if (!cards.length) {
    cards.push(
      {
        id: "fallback-hero",
        text: "Wildcard Hero",
        pool: "MULTI",
        source: "System",
        rating: "family",
      },
      {
        id: "fallback-villain",
        text: "Chaos Villain",
        pool: "MULTI",
        source: "System",
        rating: "family",
      }
    );
  }

  const filtered = allowAdult ? cards : cards.filter((c) => c.rating !== "adult");
  return seededShuffle(filtered, seed);
}

export async function setupTopPicGame(options: {
  pools: TopPicPool[];
  allowAdult: boolean;
  seed?: string;
  take?: number;
}) {
  const promptDeck = buildPromptDeck(options);
  const responseCards = await buildResponseCards(options);
  return { promptDeck, responseCards };
}

export async function logCardReport(input: {
  promptId: string;
  promptText: string;
  pool: TopPicPool;
  rating?: string | null;
  roomCode?: string | null;
  reason?: string | null;
  userId?: string | null;
}) {
  return prisma.topPicCardReport.create({
    data: {
      promptId: input.promptId,
      promptText: input.promptText,
      pool: input.pool,
      rating: input.rating || null,
      roomCode: input.roomCode || null,
      reason: input.reason || null,
      userId: input.userId || null,
    },
  });
}
