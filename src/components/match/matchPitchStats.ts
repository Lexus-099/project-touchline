import type { MatchEvent } from "./types";

export type MatchSide = "Home" | "Away";
export type MatchEventFilter = "all" | "goals" | "shots" | "cards" | "substitutions" | "injuries";

export interface TeamMatchCounts {
  goals: number;
  shotsOnTarget: number;
  shotsOffTarget: number;
  shotsBlocked: number;
  corners: number;
  fouls: number;
  yellowCards: number;
  redCards: number;
  tackles: number;
  dribbles: number;
  passes: number;
  interceptions: number;
  crosses: number;
  injuries: number;
}

export interface PlayerMatchContribution {
  goals: number;
  assists: number;
  shots: number;
  passes: number;
  tackles: number;
  dribbles: number;
  cards: number;
  injuries: number;
}

const EMPTY_TEAM_COUNTS: TeamMatchCounts = {
  goals: 0,
  shotsOnTarget: 0,
  shotsOffTarget: 0,
  shotsBlocked: 0,
  corners: 0,
  fouls: 0,
  yellowCards: 0,
  redCards: 0,
  tackles: 0,
  dribbles: 0,
  passes: 0,
  interceptions: 0,
  crosses: 0,
  injuries: 0,
};

const EMPTY_PLAYER_CONTRIBUTION: PlayerMatchContribution = {
  goals: 0,
  assists: 0,
  shots: 0,
  passes: 0,
  tackles: 0,
  dribbles: 0,
  cards: 0,
  injuries: 0,
};

const SHOT_EVENTS = new Set([
  "ShotOnTarget",
  "ShotSaved",
  "ShotOffTarget",
  "ShotBlocked",
  "PenaltyGoal",
  "PenaltyMiss",
]);

const CARD_EVENTS = new Set(["YellowCard", "RedCard", "SecondYellow"]);

const EVENT_FILTERS: Record<Exclude<MatchEventFilter, "all">, ReadonlySet<string>> = {
  goals: new Set(["Goal", "PenaltyGoal"]),
  shots: new Set([...SHOT_EVENTS, "Goal"]),
  cards: CARD_EVENTS,
  substitutions: new Set(["Substitution"]),
  injuries: new Set(["Injury"]),
};

/** Derive team comparison counts from the events produced by the match engine. */
export function buildMatchStats(events: readonly MatchEvent[]) {
  const counts: Record<MatchSide, TeamMatchCounts> = {
    Home: { ...EMPTY_TEAM_COUNTS },
    Away: { ...EMPTY_TEAM_COUNTS },
  };

  for (const event of events) {
    const team = counts[event.side];
    switch (event.event_type) {
      case "Goal":
      case "PenaltyGoal":
        team.goals += 1;
        team.shotsOnTarget += 1;
        break;
      case "ShotOnTarget":
      case "ShotSaved":
        team.shotsOnTarget += 1;
        break;
      case "ShotOffTarget":
        team.shotsOffTarget += 1;
        break;
      case "ShotBlocked":
        team.shotsBlocked += 1;
        break;
      case "Corner":
        team.corners += 1;
        break;
      case "Foul":
        team.fouls += 1;
        break;
      case "YellowCard":
        team.yellowCards += 1;
        break;
      case "RedCard":
      case "SecondYellow":
        team.redCards += 1;
        break;
      case "Tackle":
        team.tackles += 1;
        break;
      case "Dribble":
        team.dribbles += 1;
        break;
      case "PassCompleted":
        team.passes += 1;
        break;
      case "PassIntercepted":
      case "Interception":
        team.interceptions += 1;
        break;
      case "Cross":
        team.crosses += 1;
        break;
      case "Injury":
        team.injuries += 1;
        break;
    }
  }

  return counts;
}

/** Calculate an individual player's contribution using the same event log shown in the match. */
export function buildPlayerMatchContribution(
  events: readonly MatchEvent[],
  playerId: string | null,
): PlayerMatchContribution {
  const contribution = { ...EMPTY_PLAYER_CONTRIBUTION };
  if (!playerId) return contribution;

  for (const event of events) {
    if (event.player_id === playerId) {
      if (event.event_type === "Goal" || event.event_type === "PenaltyGoal") {
        contribution.goals += 1;
      }
      if (SHOT_EVENTS.has(event.event_type) || event.event_type === "Goal") {
        contribution.shots += 1;
      }
      if (event.event_type === "PassCompleted") contribution.passes += 1;
      if (event.event_type === "Tackle") contribution.tackles += 1;
      if (event.event_type === "Dribble") contribution.dribbles += 1;
      if (CARD_EVENTS.has(event.event_type)) contribution.cards += 1;
      if (event.event_type === "Injury") contribution.injuries += 1;
    }

    if (
      event.secondary_player_id === playerId &&
      (event.event_type === "Goal" || event.event_type === "PenaltyGoal")
    ) {
      contribution.assists += 1;
    }
  }

  return contribution;
}

/** Return the most recent matching events first, with a bounded result count. */
export function filterMatchEvents(
  events: readonly MatchEvent[],
  filter: MatchEventFilter,
  limit = 8,
): MatchEvent[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 8;
  if (safeLimit === 0) return [];

  const matching = filter === "all" ? events : events.filter((event) => EVENT_FILTERS[filter].has(event.event_type));
  return matching.slice(-safeLimit).reverse();
}

export interface MatchMomentumPeriod {
  start: number;
  home: number;
  away: number;
}

const PRESSURE_EVENTS = new Set([
  "Goal",
  "PenaltyGoal",
  "ShotSaved",
  "ShotOnTarget",
  "ShotOffTarget",
  "ShotBlocked",
  "Corner",
]);

/** Group attacking events into 15-minute periods for the match momentum chart. */
export function buildMatchMomentum(
  events: readonly MatchEvent[],
  matchDuration: number,
): MatchMomentumPeriod[] {
  const periodCount = Math.max(1, Math.ceil(matchDuration / 15));
  const periods = Array.from({ length: periodCount }, (_, index) => ({
    start: index * 15,
    home: 0,
    away: 0,
  }));

  for (const event of events) {
    if (!PRESSURE_EVENTS.has(event.event_type)) continue;
    const periodIndex = Math.min(
      periods.length - 1,
      Math.max(0, Math.floor(Math.max(0, event.minute - 1) / 15)),
    );
    const period = periods[periodIndex];
    if (period) period[event.side === "Home" ? "home" : "away"] += 1;
  }

  return periods;
}
