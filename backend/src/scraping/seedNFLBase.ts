// src/scraping/seedNFLBase.ts
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import prisma from "../lib/prisma";

type WeeklyOffenseRow = {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  season: string;
  season_type?: string;
  passing_yards?: string;
  rushing_yards?: string;
  receiving_yards?: string;
  rush_touchdown?: string;
  pass_touchdown?: string;
  receiving_touchdown?: string;
  interception?: string;
  receptions?: string;
  fantasy_points_ppr?: string;
  fantasy_points_standard?: string;
};

type WeeklyDefenseRow = {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  season: string;
  season_type?: string;
  sack?: string;
  interception?: string;
  def_touchdown?: string;
  fumble_forced?: string;
  fantasy_points_ppr?: string;
  fantasy_points_standard?: string;
};

type YearlyOffenseRow = {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  season: string;
  season_type?: string;
  games_played_season?: string;
  season_passing_yards?: string;
  season_rushing_yards?: string;
  season_receiving_yards?: string;
  season_pass_touchdown?: string;
  season_rush_touchdown?: string;
  season_receiving_touchdown?: string;
  season_interception?: string;
  season_receptions?: string;
  season_fantasy_points_ppr?: string;
  season_fantasy_points_standard?: string;
};

type YearlyDefenseRow = {
  player_id: string;
  player_name: string;
  position: string;
  team: string;
  season: string;
  season_type?: string;
  games_played_season?: string;
  solo_tackle?: string;
  assist_tackle?: string;
  sack?: string;
  interception?: string;
  def_touchdown?: string;
  fumble_forced?: string;
  fantasy_points_ppr?: string;
  fantasy_points_standard?: string;
};

type TeamOffenseRow = {
  team: string;
  season: string;
  season_type?: string;
  total_off_yards?: string;
  total_off_points?: string;
  total_def_points?: string;
};

type TeamDefenseRow = {
  team: string;
  season: string;
  season_type?: string;
  defense_snaps?: string;
  total_def_points?: string;
  sack?: string;
  interception?: string;
  def_touchdown?: string;
};

type SeasonStat = {
  season: number;
  team: string | null;
  games?: number | null;
  yards?: number | null;
  touchdowns?: number | null;
  receptions?: number | null;
  sacks?: number | null;
  interceptions?: number | null;
  fantasyPoints?: number | null;
  approximateValue?: number | null;
  isTot?: boolean;
};

type PlayerAcc = {
  id: string;
  name: string;
  rawPosition: string;
  normalizedPos: string;
  positionTags: Set<string>;
  primaryEraFrom: number;
  primaryEraTo: number;
  teams: Set<string>;
  seasons: Map<number, SeasonStat>;
};

const DATA_DIR = path.join(process.cwd(), "data", "nfl");

const readCsv = <T>(file: string) =>
  parse(fs.readFileSync(path.join(DATA_DIR, file)), {
    columns: true,
    skip_empty_lines: true,
  }) as T[];

const toNum = (v?: string | number | null) => {
  if (v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function normalizeTeam(raw?: string | null) {
  if (!raw) return null;
  const t = raw.toUpperCase();
  const map: Record<string, string> = {
    STL: "LAR",
    STLAC: "LAC",
    SD: "LAC",
    OAK: "LV",
    RAI: "LV",
    JAX: "JAC",
    LA: "LAR",
    WAS: "WAS",
    WSH: "WAS",
    ARI: "ARI",
    PHO: "ARI",
    HOU: "HOU",
  };
  return map[t] ?? t;
}

function normalizePosition(raw?: string | null) {
  const p = (raw || "").toUpperCase();
  if (["QB"].includes(p)) return "QB";
  if (["RB", "HB", "FB"].includes(p)) return "RB";
  if (["WR"].includes(p)) return "WR";
  if (["TE"].includes(p)) return "TE";
  if (["OT", "OG", "C", "OL", "LT", "RT", "LG", "RG"].includes(p)) return "OL";
  if (["NT", "DT", "DE", "DL", "EDGE"].includes(p)) return "DL";
  if (
    ["OLB", "MLB", "ILB", "WILL", "MIKE", "SAM", "LB"].includes(p)
  )
    return "LB";
  if (["CB", "FS", "SS", "S", "DB", "SAF"].includes(p)) return "DB";
  if (["K", "PK", "P"].includes(p)) return "K";
  if (p === "DEF") return "DEF";
  return "WR";
}

function collectTags(raw?: string | null) {
  const p = (raw || "").toUpperCase();
  const tags = new Set<string>();
  if (["EDGE", "OLB", "DE"].includes(p)) tags.add("EDGE");
  if (["FS", "SS"].includes(p)) tags.add(p);
  if (["NT", "DT"].includes(p)) tags.add("IDL");
  return tags;
}

function upsertSeason(
  player: PlayerAcc,
  season: number,
  incoming: SeasonStat,
  isTot: boolean
) {
  const current = player.seasons.get(season);
  if (!current || isTot || !current.isTot) {
    player.seasons.set(season, { ...incoming, isTot });
  }
}

function ensurePlayer(
  players: Map<string, PlayerAcc>,
  id: string,
  name: string,
  rawPosition: string,
  season: number
) {
  if (!players.has(id)) {
    const normalized = normalizePosition(rawPosition);
    players.set(id, {
      id,
      name,
      rawPosition,
      normalizedPos: normalized,
      positionTags: collectTags(rawPosition),
      primaryEraFrom: season,
      primaryEraTo: season,
      teams: new Set<string>(),
      seasons: new Map(),
    });
  }
  const p = players.get(id)!;
  p.primaryEraFrom = Math.min(p.primaryEraFrom, season);
  p.primaryEraTo = Math.max(p.primaryEraTo, season);
  return p;
}

async function main() {
  console.log("🏈 Seeding NFL base players & seasons...");

  const yearlyOffense = readCsv<YearlyOffenseRow>(
    "yearly_player_stats_offense.csv"
  );
  const yearlyDefense = readCsv<YearlyDefenseRow>(
    "yearly_player_stats_defense.csv"
  );
  const weeklyOffense = readCsv<WeeklyOffenseRow>(
    "weekly_player_stats_offense.csv"
  );
  const weeklyDefense = readCsv<WeeklyDefenseRow>(
    "weekly_player_stats_defense.csv"
  );
  const teamOffense = readCsv<TeamOffenseRow>("yearly_team_stats_offense.csv");
  const teamDefense = readCsv<TeamDefenseRow>("yearly_team_stats_defense.csv");

  const players = new Map<string, PlayerAcc>();

  /* -------------------------------------------------------- */
  /*           Aggregate weekly → season (offense)             */
  /* -------------------------------------------------------- */
  const weeklyAgg = new Map<string, SeasonStat>();
  for (const row of weeklyOffense) {
    if (row.season_type && row.season_type !== "REG") continue;
    const season = Number(row.season);
    if (!season || season < 1980) continue;

    const key = `${row.player_id}_${season}`;
    const existing = weeklyAgg.get(key) || {
      season,
      team: null,
      yards: 0,
      touchdowns: 0,
      receptions: 0,
      interceptions: 0,
      fantasyPoints: 0,
      games: 0,
    };

    const teamCode = normalizeTeam(row.team);
    existing.team =
      existing.team && existing.team !== teamCode ? "TOT" : teamCode;
    existing.yards =
      (existing.yards || 0) +
      toNum(row.passing_yards) +
      toNum(row.rushing_yards) +
      toNum(row.receiving_yards);
    existing.touchdowns =
      (existing.touchdowns || 0) +
      toNum(row.rush_touchdown) +
      toNum(row.receiving_touchdown) +
      toNum(row.pass_touchdown);
    existing.receptions = (existing.receptions || 0) + toNum(row.receptions);
    existing.interceptions =
      (existing.interceptions || 0) + toNum(row.interception);
    existing.fantasyPoints =
      (existing.fantasyPoints || 0) +
      (toNum(row.fantasy_points_ppr) || toNum(row.fantasy_points_standard));
    existing.games = (existing.games || 0) + 1;

    weeklyAgg.set(key, existing);
  }

  /* -------------------------------------------------------- */
  /*           Aggregate weekly → season (defense)             */
  /* -------------------------------------------------------- */
  const weeklyDefAgg = new Map<string, SeasonStat>();
  for (const row of weeklyDefense) {
    if (row.season_type && row.season_type !== "REG") continue;
    const season = Number(row.season);
    if (!season || season < 1980) continue;

    const key = `${row.player_id}_${season}`;
    const existing = weeklyDefAgg.get(key) || {
      season,
      team: null,
      sacks: 0,
      interceptions: 0,
      touchdowns: 0,
      fantasyPoints: 0,
      games: 0,
    };

    const teamCode = normalizeTeam(row.team);
    existing.team =
      existing.team && existing.team !== teamCode ? "TOT" : teamCode;
    existing.sacks = (existing.sacks || 0) + toNum(row.sack);
    existing.interceptions =
      (existing.interceptions || 0) + toNum(row.interception);
    existing.touchdowns = (existing.touchdowns || 0) + toNum(row.def_touchdown);
    existing.fantasyPoints =
      (existing.fantasyPoints || 0) +
      (toNum(row.fantasy_points_ppr) || toNum(row.fantasy_points_standard));
    existing.games = (existing.games || 0) + 1;

    weeklyDefAgg.set(key, existing);
  }

  /* -------------------------------------------------------- */
  /*                  Yearly offense rows                      */
  /* -------------------------------------------------------- */
  for (const row of yearlyOffense) {
    if (row.season_type && row.season_type !== "REG") continue;
    const season = Number(row.season);
    if (!row.player_id || !season || season < 1980) continue;

    const team = normalizeTeam(row.team);
    const player = ensurePlayer(
      players,
      row.player_id,
      row.player_name,
      row.position,
      season
    );
    if (team) player.teams.add(team);

    const yards =
      toNum(row.season_passing_yards) +
      toNum(row.season_rushing_yards) +
      toNum(row.season_receiving_yards);
    const touchdowns =
      toNum(row.season_pass_touchdown) +
      toNum(row.season_rush_touchdown) +
      toNum(row.season_receiving_touchdown);
    const stat: SeasonStat = {
      season,
      team,
      games: toNum(row.games_played_season) || null,
      yards: yards || null,
      touchdowns: touchdowns || null,
      interceptions: toNum(row.season_interception) || null,
      receptions: toNum(row.season_receptions) || null,
      fantasyPoints:
        toNum(row.season_fantasy_points_ppr) ||
        toNum(row.season_fantasy_points_standard) ||
        null,
    };

    const isTot = team === "TOT";
    upsertSeason(player, season, stat, isTot);
  }

  /* -------------------------------------------------------- */
  /*                  Yearly defense rows                      */
  /* -------------------------------------------------------- */
  for (const row of yearlyDefense) {
    if (row.season_type && row.season_type !== "REG") continue;
    const season = Number(row.season);
    if (!row.player_id || !season || season < 1980) continue;

    const team = normalizeTeam(row.team);
    const player = ensurePlayer(
      players,
      row.player_id,
      row.player_name,
      row.position,
      season
    );
    if (team) player.teams.add(team);

    const tackles =
      toNum(row.solo_tackle) + Math.max(0, toNum(row.assist_tackle) * 0.5);
    const stat: SeasonStat = {
      season,
      team,
      games: toNum(row.games_played_season) || null,
      yards: tackles || null, // treat tackles as proxy production
      touchdowns: toNum(row.def_touchdown) || null,
      sacks: toNum(row.sack) || null,
      interceptions: toNum(row.interception) || null,
      fantasyPoints:
        toNum(row.fantasy_points_ppr) ||
        toNum(row.fantasy_points_standard) ||
        null,
    };

    const isTot = team === "TOT";
    upsertSeason(player, season, stat, isTot);
  }

  /* -------------------------------------------------------- */
  /*            Fill gaps with weekly aggregates               */
  /* -------------------------------------------------------- */
  for (const [key, agg] of weeklyAgg) {
    const [playerId, seasonStr] = key.split("_");
    const season = Number(seasonStr);
    const player = ensurePlayer(
      players,
      playerId,
      weeklyOffense.find((r) => r.player_id === playerId)?.player_name ||
        playerId,
      weeklyOffense.find((r) => r.player_id === playerId)?.position || "WR",
      season
    );

    if (agg.team) player.teams.add(agg.team);
    const isTot = agg.team === "TOT";
    upsertSeason(
      player,
      season,
      {
        ...agg,
        touchdowns: agg.touchdowns ?? null,
        interceptions: agg.interceptions ?? null,
        receptions: agg.receptions ?? null,
        yards: agg.yards ?? null,
        fantasyPoints: agg.fantasyPoints ?? null,
      },
      isTot
    );
  }

  for (const [key, agg] of weeklyDefAgg) {
    const [playerId, seasonStr] = key.split("_");
    const season = Number(seasonStr);
    const defRow = weeklyDefense.find((r) => r.player_id === playerId);
    const player = ensurePlayer(
      players,
      playerId,
      defRow?.player_name || playerId,
      defRow?.position || "LB",
      season
    );

    if (agg.team) player.teams.add(agg.team);
    const isTot = agg.team === "TOT";
    upsertSeason(
      player,
      season,
      {
        ...agg,
        touchdowns: agg.touchdowns ?? null,
        sacks: agg.sacks ?? null,
        interceptions: agg.interceptions ?? null,
        yards: agg.yards ?? null,
        fantasyPoints: agg.fantasyPoints ?? null,
      },
      isTot
    );
  }

  /* -------------------------------------------------------- */
  /*                  Team DEF pseudo-players                  */
  /* -------------------------------------------------------- */
  for (const row of teamDefense) {
    if (row.season_type && row.season_type !== "REG") continue;
    const season = Number(row.season);
    const team = normalizeTeam(row.team);
    if (!team || !season || season < 1980) continue;

    const id = `DEF-${team}`;
    const name = `${team} Defense`;
    const player = ensurePlayer(players, id, name, "DEF", season);
    player.normalizedPos = "DEF";
    player.positionTags.add("TEAM");
    player.teams.add(team);

    upsertSeason(
      player,
      season,
      {
        season,
        team,
        games: null,
        yards: toNum(row.defense_snaps) || null,
        touchdowns: toNum(row.def_touchdown) || null,
        sacks: toNum(row.sack) || null,
        interceptions: toNum(row.interception) || null,
        fantasyPoints: toNum(row.total_def_points) * -1 || null, // points allowed as inverse signal
      },
      true
    );
  }

  // sometimes points allowed are in offense file
  for (const row of teamOffense) {
    if (row.season_type && row.season_type !== "REG") continue;
    const season = Number(row.season);
    const team = normalizeTeam(row.team);
    if (!team || !season || season < 1980) continue;

    const id = `DEF-${team}`;
    if (!players.has(id)) continue;
    const player = players.get(id)!;
    const existing = player.seasons.get(season);

    const fantasyPenalty =
      toNum(row.total_def_points) || (existing?.fantasyPoints ?? 0);
    const yardsAllowed = existing?.yards ?? null;

    upsertSeason(
      player,
      season,
      {
        season,
        team,
        games: existing?.games ?? null,
        yards: yardsAllowed,
        touchdowns: existing?.touchdowns ?? null,
        sacks: existing?.sacks ?? null,
        interceptions: existing?.interceptions ?? null,
        fantasyPoints: fantasyPenalty
          ? -fantasyPenalty
          : existing?.fantasyPoints ?? null,
      },
      true
    );
  }

  /* -------------------------------------------------------- */
  /*                     Persist to DB                        */
  /* -------------------------------------------------------- */
  let total = 0;
  let seasonsSeeded = 0;
  for (const p of players.values()) {
    total++;
    if (total % 250 === 0) {
      console.log(`✅ Seeded ${total} players`);
    }

    const [firstName, ...rest] = (p.name || "").split(" ");
    const lastName = rest.join(" ") || firstName;

    await prisma.nFLPlayer.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        name: p.name,
        firstName: firstName || p.name,
        lastName: lastName || p.name,
        rawPosition: p.rawPosition,
        normalizedPos: p.normalizedPos,
        positionTags: Array.from(p.positionTags.values()),
        primaryEraFrom: p.primaryEraFrom || null,
        primaryEraTo: p.primaryEraTo || null,
        teams: Array.from(p.teams.values()),
        hallOfFame: false,
        proBowls: 0,
        allPros: 0,
        championships: 0,
        careerAV: null,
        fitTopPicEligible: true,
      },
      update: {
        name: p.name,
        firstName: firstName || p.name,
        lastName: lastName || p.name,
        rawPosition: p.rawPosition,
        normalizedPos: p.normalizedPos,
        positionTags: Array.from(p.positionTags.values()),
        primaryEraFrom: p.primaryEraFrom || null,
        primaryEraTo: p.primaryEraTo || null,
        teams: Array.from(p.teams.values()),
      },
    });

    await prisma.nFLPlayerSeasonStat.deleteMany({
      where: { playerId: p.id },
    });

    for (const season of p.seasons.values()) {
      await prisma.nFLPlayerSeasonStat.create({
        data: {
          playerId: p.id,
          season: season.season,
          team: season.team ?? "TOT",
          games: season.games ?? null,
          yards: season.yards ?? null,
          touchdowns: season.touchdowns ?? null,
          receptions: season.receptions ?? null,
          sacks: season.sacks ?? null,
          interceptions: season.interceptions ?? null,
          fantasyPoints: season.fantasyPoints ?? null,
          approximateValue: season.approximateValue ?? null,
        },
      });
      seasonsSeeded++;
      if (seasonsSeeded % 1000 === 0) {
        console.log(`   • Seasons seeded: ${seasonsSeeded}`);
      }
    }
  }

  console.log(
    `🎉 NFL base seed complete (${total} players, ${seasonsSeeded} seasons)`
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
