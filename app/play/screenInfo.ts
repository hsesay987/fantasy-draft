import { currentTurn, isDone, npatIsDig, npatIsQuestion, type GameState } from "../topicDraft/core";
import * as IM from "../topicDraft/formats/imposter";
import * as IS from "../topicDraft/formats/insync";
import * as MF from "../topicDraft/formats/mafia";
import * as PK from "../topicDraft/formats/pecking";
import type { NPView } from "../topicDraft/formats/npat";
import type { DigView } from "../topicDraft/formats/npatDig";
import * as PT from "../topicDraft/formats/partytrivia";
import { categoryOf } from "../topicDraft/npat/categories";
import { currentDescriber, type SLState, type SLView } from "../topicDraft/formats/sayless";
import * as SLR from "../topicDraft/sayless/rules";
import { own } from "../topicDraft/party/own";
import * as V from "../topicDraft/formats/vote";
import type { VPState } from "../topicDraft/formats/vowelplay";
import { TEAM_COLORS, teamName } from "./teamMoves";
import { teamStandings, teamsFor } from "./teamStandings";
import type { GameSetup } from "./types";
import { npatClock } from "./views/npatBoard";
import { digClock, digPhase } from "./views/npatDigBoard";
import { chosen as dodgeChosen, type DodgeView } from "../topicDraft/formats/dodge";
import { dodgeClock, dodgePhase } from "./views/dodgeBoard";

/** What the big screen says above the board: whose turn it is (null when nobody's in particular) and the phase. */
export type ScreenInfo = { turn: string | null; phase: string };

export type LeaderRow = { name: string; score: number; last?: number; left?: boolean; team?: number; seat?: number; /** Cut from the tournament: listed after the finalists. */ cut?: boolean };
export type LeaderTeam = { name: string; score: number; color?: string };
export type ScreenBoard = { rows: LeaderRow[]; teams?: LeaderTeam[] };

/** Whose turn and which phase, from the public state alone (what a viewer with no seat is sent). */
export function screenInfo(setup: GameSetup, state: GameState): ScreenInfo {
  const done = isDone(setup, state);
  switch (setup.format) {
    case "imposter": {
      const s = state as IM.ImposterState;
      if (done) return { turn: null, phase: "Masks off" };
      const round = Math.min(s.rounds, Math.floor(s.clues.length / Math.max(1, s.order.length)) + 1);
      return s.phase === "clue" ? { turn: IM.turnPlayer(s), phase: `Clues · round ${round} of ${s.rounds}` } : { turn: null, phase: s.phase === "vote" ? "Vote for the imposter" : "Last guess" };
    }
    case "insync": {
      const s = state as IS.InSyncState;
      if (done) return { turn: null, phase: "End of the show" };
      const round = `Round ${s.round + 1} of ${s.pairs.length}`;
      return { turn: s.phase === "reveal" ? null : IS.giver(s), phase: `${round} · ${s.phase === "clue" ? "Clue" : s.phase === "tune" ? "Tune in" : "Reveal"}` };
    }
    case "vote": {
      const s = state as V.VoteState;
      if (done) return { turn: null, phase: "Final scores" };
      return { turn: null, phase: `Card ${s.round + 1} of ${s.total} · ${s.phase === "vote" ? "Vote" : s.phase === "guess" ? "Read the room" : "Reveal"}` };
    }
    case "partytrivia": {
      const s = state as PT.PTState & { total?: number; buzzer?: string | null };
      if (done) return { turn: null, phase: "Final scores" };
      const total = s.total ?? s.questions.length;
      // Buzz mode puts a buzzer on the state; the plain game has none.
      return { turn: s.phase === "question" ? s.buzzer ?? null : null, phase: `Question ${s.round + 1} of ${total}${s.phase === "reveal" ? " · Answer" : ""}` };
    }
    case "pecking": {
      const s = state as PK.PeckView;
      if (done) return { turn: null, phase: "Final scores" };
      const q = s.questions[s.round];
      const step = s.phase === "reveal" ? "Answer" : q?.kind === "name" ? `Who's at #${q.at}?` : "Where does it rank?";
      return { turn: null, phase: `Question ${s.round + 1} of ${s.total ?? s.questions.length} · ${step}` };
    }
    case "sayless": {
      const s = state as unknown as SLView;
      if (done) return { turn: null, phase: "Final scores" };
      const step = s.phase === "clue" ? "Describing" : s.phase === "speak" ? "Say it" : s.phase === "judge" ? "Right or wrong?" : "Reveal";
      return { turn: currentDescriber(s as unknown as SLState) || null, phase: `Turn ${s.turn + 1} of ${s.total ?? s.turns.length} · ${step}` };
    }
    case "npat": {
      if (npatIsDig(setup)) return { turn: null, phase: done ? (npatIsQuestion(setup) ? "Final scores" : "Final depths") : digPhase(state as unknown as DigView) };
      const s = state as unknown as NPView;
      if (done) return { turn: null, phase: "Final scores" };
      const cat = s.categories[s.cat] ?? "";
      const step = s.phase === "write" ? `Letter ${s.letter} · Writing` : s.phase === "reveal" ? `Reveal: ${categoryOf(cat)?.title ?? cat}` : s.phase === "vote" ? "Vote" : "Round results";
      return { turn: null, phase: `Round ${s.round + 1} of ${s.rounds} · ${step}` };
    }
    case "dodge": {
      const s = state as unknown as DodgeView;
      return { turn: done ? null : dodgeChosen(s), phase: dodgePhase(s) };
    }
    case "mafia": {
      const s = state as MF.MafiaState;
      if (done) return { turn: null, phase: "The case is closed" };
      return { turn: null, phase: s.phase === "night" ? `Night ${s.night}` : `Day ${s.night} · ${s.phase === "morning" ? "Morning" : s.phase === "talk" ? "Talk" : "Vote"}` };
    }
    case "vowelplay":
    case "vowelparty": {
      const s = state as VPState;
      if (done) return { turn: null, phase: "Final scores" };
      const step = s.phase === "guess" ? (s.answer === "type" ? "Name it" : "Buzz in") : s.phase === "speak" ? "Say it" : s.phase === "judge" ? "Right or wrong?" : "Reveal";
      return { turn: s.phase === "speak" || s.phase === "judge" ? s.buzzer : null, phase: `Name ${s.round + 1} of ${s.total} · ${step}` };
    }
    default:
      return { turn: currentTurn(setup, state), phase: done ? "Results" : "" };
  }
}

const MAFIA_MS = { night: MF.NIGHT_MS, morning: MF.MORNING_MS, talk: MF.TALK_MS, vote: MF.VOTE_MS };

/**
 * The phase clock for the screen's header, or null where the board carries its own (Party Trivia's cabinet, Vowel Play's
 * typewriter) or there is none.
 */
export function screenClock(setup: GameSetup, state: GameState): { deadline: number; total: number } | null {
  if (isDone(setup, state)) return null;
  const at = (total: number, phaseAt: number) => ({ deadline: phaseAt + total, total });
  switch (setup.format) {
    case "imposter": {
      const s = state as IM.ImposterState;
      return at(s.phase === "clue" ? IM.CLUE_MS : s.phase === "vote" ? IM.VOTE_MS : IM.GUESS_MS, s.phaseAt);
    }
    case "insync": {
      const s = state as IS.InSyncState;
      return at(s.phase === "reveal" ? IS.REVEAL_MS : s.phase === "tune" ? IS.TUNE_MS : IS.CLUE_MS, s.phaseAt);
    }
    case "vote": {
      const s = state as V.VoteState;
      return at(s.phase === "reveal" ? V.revealMs(s) : s.phase === "guess" ? V.GUESS_MS : V.VOTE_MS, s.phaseAt);
    }
    case "mafia": {
      const s = state as MF.MafiaState;
      return at(MAFIA_MS[s.phase], s.phaseAt);
    }
    case "pecking": {
      const s = state as PK.PeckView;
      return at(s.phase === "reveal" ? PK.REVEAL_MS : PK.QUESTION_MS, s.phaseAt);
    }
    case "sayless": {
      // Describing runs on the word's own minute; saying, judging and the reveal on their phase clocks.
      const s = state as unknown as SLView;
      return s.phase === "clue" ? at(SLR.WORD_MS, s.wordAt) : at(s.phase === "speak" ? SLR.SPEAK_MS : s.phase === "judge" ? SLR.JUDGE_MS : SLR.REVEAL_MS, s.phaseAt);
    }
    case "dodge":
      return dodgeClock(state as unknown as DodgeView);
    case "npat":
      return npatIsDig(setup) ? digClock(state as unknown as DigView) : npatClock(state as unknown as NPView);
    default:
      return null;
  }
}

const vowelScore = (s: VPState, p: string) => (s.mode === "duel" ? s.history.filter((h) => h.winner === p).length : s.points[p] ?? 0);

/**
 * The leaderboard beside the board, by player and (with teams) by team. Null when the game has no public score to show:
 * Mafia, or a vote game with Show votes off, whose scores stay secret until the end.
 */
export function screenBoard(setup: GameSetup, state: GameState, gone: string[] = []): ScreenBoard | null {
  const done = isDone(setup, state);
  const rowsFor = (players: string[], score: (p: string) => number, last?: (p: string) => number | undefined, teams?: string[][] | null): LeaderRow[] =>
    players.map((p, seat) => {
      const team = teams ? teams.findIndex((t) => t.includes(p)) : -1;
      const l = last?.(p);
      return { name: p, score: score(p), seat, ...(l ? { last: l } : {}), ...(gone.includes(p) ? { left: true } : {}), ...(team >= 0 ? { team } : {}) };
    });
  const summed = (points: Record<string, number>, teams: string[][] | null): LeaderTeam[] | undefined =>
    teams ? teamStandings(points, teams).map((t) => ({ name: t.name, score: t.score, color: TEAM_COLORS[t.index] })) : undefined;

  switch (setup.format) {
    case "imposter": {
      const s = state as IM.ImposterState;
      const teams = teamsFor(setup, s.players);
      return { rows: rowsFor(s.players, (p) => s.points[p] ?? 0, undefined, teams), teams: summed(s.points, teams) };
    }
    case "vote": {
      const s = state as V.VoteState;
      if (!s.showVotes && !done) return null;
      const teams = teamsFor(setup, s.players);
      const h = s.phase === "reveal" && !done ? s.history[s.history.length - 1] : undefined;
      return { rows: rowsFor(s.players, (p) => s.points[p] ?? 0, h ? (p) => h.gained[p] : undefined, teams), teams: summed(s.points, teams) };
    }
    case "insync": {
      const s = state as IS.InSyncState;
      // Older co-operative games: the room's group score is the only standing.
      if (!s.points) return { rows: [], teams: [{ name: "Group score", score: s.score }] };
      const pts = s.points;
      const h = s.phase === "reveal" && !done ? s.history[s.history.length - 1] : undefined;
      return { rows: rowsFor(s.players, (p) => pts[p] ?? 0, h?.gained ? (p) => h.gained![p] : undefined, null) };
    }
    case "partytrivia": {
      const s = state as PT.PTState;
      const teams = s.teams && s.teams.length >= 2 ? s.teams : null;
      return {
        rows: rowsFor(s.players, (p) => s.points[p] ?? 0, undefined, teams),
        teams: teams ? teams.map((_, i) => ({ name: `${teamName(i)} team`, score: s.teamPoints[i] ?? 0, color: TEAM_COLORS[i] })).sort((a, b) => b.score - a.score) : undefined,
      };
    }
    case "pecking": {
      const s = state as PK.PeckView;
      const teams = teamsFor(setup, s.players);
      // What each player just scored, closest bonus included, while the answer is up.
      const h = s.phase === "reveal" && !done ? s.history[s.history.length - 1] : undefined;
      const gain = (p: string) => { const sc = h?.scores[p]; return sc ? sc.points + (sc.bonus ? PK.CLOSEST_BONUS : 0) : undefined; };
      return { rows: rowsFor(s.players, (p) => s.points[p] ?? 0, h ? gain : undefined, teams), teams: summed(s.points, teams) };
    }
    case "sayless": {
      const s = state as unknown as SLView;
      // The engine decides whether teams played (too few players means solo) and keeps their points itself.
      const teams = s.teams && s.teams.length >= 2 ? s.teams : null;
      const h = s.phase === "reveal" && !done ? s.history[s.history.length - 1] : undefined;
      const gain = (p: string) => {
        if (!h) return undefined;
        const g = (h.winner === p ? h.points : 0) + (h.describer === p && h.winner !== null ? h.points : 0) + (h.describer === p ? h.bonus ?? 0 : 0) - (own(h.guarded ?? {}, p) ?? 0);
        return g > 0 ? g : undefined;
      };
      return {
        rows: rowsFor(s.players, (p) => s.points[p] ?? 0, h ? gain : undefined, teams),
        teams: teams ? teams.map((_, i) => ({ name: `${teamName(i)} team`, score: s.teamPoints[i] ?? 0, color: TEAM_COLORS[i] })).sort((a, b) => b.score - a.score) : undefined,
      };
    }
    case "npat": {
      if (npatIsDig(setup)) {
        const s = state as unknown as DigView;
        const teams = s.teams && s.teams.length >= 2 ? s.teams : null;
        const live = s.phase === "verdict" && !done;
        const gain = (p: string) => { const n = own(s.results, p)?.[s.cat]?.points; return n && n > 0 ? n : undefined; };
        return {
          rows: rowsFor(s.players, (p) => own(s.points, p) ?? 0, live ? gain : undefined, teams),
          teams: teams ? teams.map((_, i) => ({ name: `${teamName(i)} team`, score: s.teamPoints[i] ?? 0, color: TEAM_COLORS[i] })).sort((a, b) => b.score - a.score) : undefined,
        };
      }
      const s = state as unknown as NPView;
      // The engine keeps team points itself: a team scores each answer once, however many members gave it.
      const teams = s.teams && s.teams.length >= 2 ? s.teams : null;
      const r = s.phase === "reveal" && !done ? s.history[s.history.length - 1] : undefined;
      const gain = (p: string) => { const n = own(r?.answers ?? {}, p)?.[s.cat]?.points; return n && n > 0 ? n : undefined; };
      return {
        rows: rowsFor(s.players, (p) => own(s.points, p) ?? 0, r ? gain : undefined, teams),
        teams: teams ? teams.map((_, i) => ({ name: `${teamName(i)} team`, score: s.teamPoints[i] ?? 0, color: TEAM_COLORS[i] })).sort((a, b) => b.score - a.score) : undefined,
      };
    }
    case "dodge": {
      const s = state as unknown as DodgeView;
      // What each player just gained, while the reveal is up. Losses show as nothing: the board shows totals.
      const h = s.phase === "reveal" && !done ? s.history[s.history.length - 1] : undefined;
      const gain = (p: string) => { const n = h ? own(h.gained, p) : undefined; return n && n > 0 ? n : undefined; };
      return { rows: rowsFor(s.players, (p) => own(s.points, p) ?? 0, h ? gain : undefined) };
    }
    case "vowelplay":
    case "vowelparty": {
      const s = state as VPState;
      const teams = teamsFor(setup, s.players);
      const points = Object.fromEntries(s.players.map((p) => [p, vowelScore(s, p)]));
      return { rows: rowsFor(s.players, (p) => points[p]!, undefined, teams), teams: summed(points, teams) };
    }
    default:
      return null;
  }
}
