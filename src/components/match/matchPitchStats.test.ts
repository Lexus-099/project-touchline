import { describe, expect, it } from "vitest";
import type { MatchEvent } from "./types";
import {
  buildMatchMomentum,
  buildMatchStats,
  buildPlayerMatchContribution,
  filterMatchEvents,
} from "./matchPitchStats";

function event(
  event_type: string,
  side: "Home" | "Away" = "Home",
  player_id: string | null = "p1",
  secondary_player_id: string | null = null,
): MatchEvent {
  return {
    minute: 12,
    event_type,
    side,
    zone: "AwayBox",
    player_id,
    secondary_player_id,
  };
}

describe("match pitch statistics", () => {
  it("counts goals as shots on target and keeps blocked shots separate", () => {
    const stats = buildMatchStats([
      event("Goal"),
      event("ShotSaved"),
      event("ShotOffTarget"),
      event("ShotBlocked"),
      event("Goal", "Away", "p2"),
      event("Injury", "Home", "p1"),
    ]);

    expect(stats.Home.goals).toBe(1);
    expect(stats.Home.shotsOnTarget).toBe(2);
    expect(stats.Home.shotsOffTarget).toBe(1);
    expect(stats.Home.shotsBlocked).toBe(1);
    expect(stats.Away.goals).toBe(1);
    expect(stats.Away.shotsOnTarget).toBe(1);
    expect(stats.Home.injuries).toBe(1);
  });

  it("derives individual goals, assists, shots and actions from the event log", () => {
    const events = [
      event("Goal", "Home", "striker", "creator"),
      event("ShotSaved", "Home", "striker"),
      event("PassCompleted", "Home", "creator"),
      event("Tackle", "Home", "creator"),
      event("YellowCard", "Home", "creator"),
      event("Injury", "Home", "striker"),
      event("Dribble", "Away", "opponent"),
    ];

    expect(buildPlayerMatchContribution(events, "striker")).toEqual({
      goals: 1,
      assists: 0,
      shots: 2,
      passes: 0,
      tackles: 0,
      dribbles: 0,
      cards: 0,
      injuries: 1,
    });
    expect(buildPlayerMatchContribution(events, "creator")).toEqual({
      goals: 0,
      assists: 1,
      shots: 0,
      passes: 1,
      tackles: 1,
      dribbles: 0,
      cards: 1,
      injuries: 0,
    });
    expect(buildPlayerMatchContribution(events, null).goals).toBe(0);
  });

  it("filters event categories and returns newest events first", () => {
    const events = [
      event("Goal"),
      event("YellowCard"),
      event("Substitution"),
      event("ShotOffTarget"),
      event("Goal", "Away"),
      event("Injury", "Home", "p3"),
    ];

    expect(filterMatchEvents(events, "goals", 1).map((item) => item.event_type)).toEqual(["Goal"]);
    expect(filterMatchEvents(events, "cards").map((item) => item.event_type)).toEqual(["YellowCard"]);
    expect(filterMatchEvents(events, "substitutions").map((item) => item.event_type)).toEqual(["Substitution"]);
    expect(filterMatchEvents(events, "injuries").map((item) => item.event_type)).toEqual(["Injury"]);
    expect(filterMatchEvents(events, "all", 2).map((item) => item.event_type)).toEqual(["Injury", "Goal"]);
  });


  it("groups pressure events into 15-minute periods and includes extra time", () => {
    const periods = buildMatchMomentum([
      event("ShotSaved", "Home"),
      { ...event("Corner", "Away"), minute: 16 },
      { ...event("Goal", "Home"), minute: 90 },
      { ...event("ShotOffTarget", "Away"), minute: 105 },
      { ...event("Foul", "Away"), minute: 106 },
    ], 120);

    expect(periods).toHaveLength(8);
    expect(periods[0]).toMatchObject({ start: 0, home: 1, away: 0 });
    expect(periods[1]).toMatchObject({ start: 15, home: 0, away: 1 });
    expect(periods[5]).toMatchObject({ start: 75, home: 1, away: 0 });
    expect(periods[6]).toMatchObject({ start: 90, home: 0, away: 1 });
    expect(periods[7]).toMatchObject({ start: 105, home: 0, away: 0 });
  });

  it("returns no events for a zero limit", () => {
    expect(filterMatchEvents([event("Goal")], "all", 0)).toEqual([]);
  });
});
