import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MatchPitchView from "./MatchPitchView";
import { makeSnapshot } from "./matchScreenFixtures";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

describe("MatchPitchView", () => {
  function renderPitch() {
    const snapshot = makeSnapshot();
    snapshot.current_minute = 20;
    snapshot.events = [
      {
        minute: 12,
        event_type: "Goal",
        side: "Home",
        zone: "AwayBox",
        player_id: "p1",
        secondary_player_id: "p2",
      },
      {
        minute: 16,
        event_type: "ShotOffTarget",
        side: "Away",
        zone: "HomeBox",
        player_id: "p2",
        secondary_player_id: null,
      },
      {
        minute: 18,
        event_type: "YellowCard",
        side: "Home",
        zone: "Midfield",
        player_id: "p1",
        secondary_player_id: null,
      },
    ];
    const props = {
      snapshot,
      homeColor: "#008844",
      awayColor: "#3344aa",
      playerJerseyMap: new Map([
        ["p1", 9],
        ["p2", 10],
      ]),
    };
    render(<MatchPitchView {...props} />);
    return { snapshot, props };
  }

  it("shows the home and away sides separately in the live stat cards", () => {
    renderPitch();
    expect(screen.getByText("match.goals")).toBeInTheDocument();
    expect(screen.getByText("match.shotsOffTarget")).toBeInTheDocument();
    expect(screen.getByText("match.yellowCards")).toBeInTheDocument();
  });

  it("lets the manager open an on-pitch player's contribution panel", () => {
    renderPitch();
    fireEvent.click(screen.getByRole("button", { name: "match.playerOverview: Alice" }));

    expect(screen.getByRole("heading", { name: "Alice" })).toBeInTheDocument();
    expect(screen.getByText("match.playerOverview")).toBeInTheDocument();
    expect(screen.getByText("match.assists")).toBeInTheDocument();
    expect(screen.getByText("match.tackles")).toBeInTheDocument();
  });

  it("filters recent events without changing the full-match event count", () => {
    renderPitch();
    expect(screen.getByText("3 match.events")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "match.goals" }));

    expect(screen.getByText("match.eventTypes.Goal")).toBeInTheDocument();
    expect(screen.queryByText("match.eventTypes.ShotOffTarget")).toBeNull();
    expect(screen.queryByText("match.eventTypes.YellowCard")).toBeNull();
  });

  it("allows the bench player to open the same player profile", () => {
    const snapshot = makeSnapshot();
    snapshot.home_bench = [snapshot.home_team.players[0]];
    snapshot.home_team.players = [];
    render(
      <MatchPitchView
        snapshot={snapshot}
        homeColor="#008844"
        awayColor="#3344aa"
        playerJerseyMap={new Map()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Alice/ }));
    expect(screen.getByRole("heading", { name: "Alice" })).toBeInTheDocument();
  });
});
