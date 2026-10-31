import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import type { EnginePlayerData, MatchEvent, MatchSnapshot } from "./types";
import { buildFormationSlots } from "./FormationPitch";
import {
  buildMatchMomentum,
  buildMatchStats,
  buildPlayerMatchContribution,
  filterMatchEvents,
  type MatchEventFilter,
  type TeamMatchCounts,
} from "./matchPitchStats";

interface MatchPitchViewProps {
  snapshot: MatchSnapshot;
  homeColor: string;
  awayColor: string;
  playerJerseyMap: Map<string, number>;
}

type MatchSide = "Home" | "Away";

interface PitchMarker {
  player: EnginePlayerData;
  side: MatchSide;
  left: number;
  top: number;
  color: string;
}

const BALL_ZONE_X: Record<string, number> = {
  HomeBox: 9,
  HomeDefense: 28,
  Midfield: 50,
  AwayDefense: 72,
  AwayBox: 91,
};

function eventLabel(event: MatchEvent, t: TFunction) {
  return t("match.eventTypes." + event.event_type, {
    defaultValue: event.event_type.replace(/([A-Z])/g, " $1").trim(),
  });
}

function getEventTone(eventType: string) {
  if (eventType === "Goal" || eventType === "PenaltyGoal") return "border-emerald-400/50 bg-emerald-500/10";
  if (eventType === "RedCard" || eventType === "SecondYellow") return "border-red-400/50 bg-red-500/10";
  if (eventType === "YellowCard") return "border-amber-400/50 bg-amber-500/10";
  if (eventType.startsWith("Shot")) return "border-sky-400/50 bg-sky-500/10";
  return "border-gray-200 bg-gray-50 dark:border-navy-700 dark:bg-navy-900/60";
}

function PlayerCondition({ value, label }: { value: number; label: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  const fill =
    safeValue < 30 ? "bg-red-500" : safeValue < 60 ? "bg-amber-400" : "bg-emerald-400";

  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-navy-700"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
    >
      <div className={"h-full rounded-full transition-[width] duration-300 " + fill} style={{ width: safeValue + "%" }} />
    </div>
  );
}

export default function MatchPitchView({
  snapshot,
  homeColor,
  awayColor,
  playerJerseyMap,
}: MatchPitchViewProps) {
  const { t } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [showNames, setShowNames] = useState(true);
  const [eventFilter, setEventFilter] = useState<MatchEventFilter>("all");

  const sentOff = snapshot.sent_off ?? [];
  const homeSlots = buildFormationSlots(snapshot.home_team.formation, snapshot.home_team.players, sentOff);
  const awaySlots = buildFormationSlots(snapshot.away_team.formation, snapshot.away_team.players, sentOff);

  const markers: PitchMarker[] = [
    ...homeSlots.map((slot) => ({
      player: slot.player,
      side: "Home" as const,
      left: 100 - slot.y,
      top: slot.x,
      color: homeColor,
    })),
    ...awaySlots.map((slot) => ({
      player: slot.player,
      side: "Away" as const,
      left: slot.y,
      top: slot.x,
      color: awayColor,
    })),
  ];

  const playerIndex = useMemo(() => {
    const players = [
      ...snapshot.home_team.players,
      ...snapshot.away_team.players,
      ...snapshot.home_bench,
      ...snapshot.away_bench,
    ];
    return new Map<string, EnginePlayerData>(players.map((player) => [player.id, player] as const));
  }, [snapshot.home_team.players, snapshot.away_team.players, snapshot.home_bench, snapshot.away_bench]);

  const selectedPlayer = selectedPlayerId ? playerIndex.get(selectedPlayerId) ?? null : null;
  const selectedSide: MatchSide | null = selectedPlayer
    ? snapshot.home_team.players.some((player) => player.id === selectedPlayer.id) ||
      snapshot.home_bench.some((player) => player.id === selectedPlayer.id)
      ? "Home"
      : "Away"
    : null;
  const selectedSetPieces = selectedSide === "Home" ? snapshot.home_set_pieces : snapshot.away_set_pieces;
  const selectedDuties = selectedPlayer
    ? [
        selectedSetPieces?.captain === selectedPlayer.id ? t("match.captain") : null,
        selectedSetPieces?.penalty_taker === selectedPlayer.id ? t("match.penaltyTaker") : null,
        selectedSetPieces?.free_kick_taker === selectedPlayer.id ? t("match.freeKickTaker") : null,
        selectedSetPieces?.corner_taker === selectedPlayer.id ? t("match.cornerTaker") : null,
      ].filter((duty): duty is string => duty !== null)
    : [];
  const selectedRating = selectedPlayer ? snapshot.player_ratings?.[selectedPlayer.id] : undefined;

  const homeCards = snapshot.home_yellows ?? {};
  const awayCards = snapshot.away_yellows ?? {};
  const substitutions = snapshot.substitutions ?? [];
  const currentAction = [...snapshot.events]
    .reverse()
    .find((event) => event.minute === snapshot.current_minute && event.player_id !== null);
  const activePlayerId = currentAction?.player_id ?? null;
  const ballX = BALL_ZONE_X[snapshot.ball_zone] ?? 50;
  // The engine exposes a longitudinal zone, not a lateral ball coordinate.
  const ballY = 50;
  const possessionTeam =
    snapshot.possession === "Home" ? snapshot.home_team.name : snapshot.away_team.name;
  const ballZoneLabel = t("match.ballZones." + snapshot.ball_zone, {
    defaultValue: snapshot.ball_zone,
  });
  const isExtraTime = snapshot.current_minute > 90 || snapshot.phase.includes("ExtraTime");
  const matchDuration = isExtraTime ? 120 : 90;
  const progressMinute = Math.min(matchDuration, Math.max(0, snapshot.current_minute));
  const matchProgress = (progressMinute / matchDuration) * 100;
  const phaseLabel = t("match.phases." + snapshot.phase, { defaultValue: snapshot.phase });
  const homePossession = Math.max(0, Math.min(100, snapshot.home_possession_pct));
  const awayPossession = Math.max(0, Math.min(100, snapshot.away_possession_pct));
  const scoreState =
    snapshot.home_score > snapshot.away_score
      ? t("match.homeLead")
      : snapshot.away_score > snapshot.home_score
        ? t("match.awayLead")
        : t("match.levelScore");

  const matchCounts = useMemo(() => buildMatchStats(snapshot.events), [snapshot.events]);
  const recentEvents = useMemo(
    () => filterMatchEvents(snapshot.events, eventFilter, 8),
    [snapshot.events, eventFilter],
  );
  const selectedContribution = useMemo(
    () => buildPlayerMatchContribution(snapshot.events, selectedPlayerId),
    [snapshot.events, selectedPlayerId],
  );
  const goalContributions = useMemo(
    () =>
      snapshot.events
        .filter((event) => event.event_type === "Goal" || event.event_type === "PenaltyGoal")
        .map((event, index) => ({
          id: event.minute + "-" + event.event_type + "-" + index,
          minute: event.minute,
          scorer: event.player_id ? playerIndex.get(event.player_id)?.name ?? null : null,
          assist: event.secondary_player_id ? playerIndex.get(event.secondary_player_id)?.name ?? null : null,
          teamName: event.side === "Home" ? snapshot.home_team.name : snapshot.away_team.name,
          side: event.side,
          isPenalty: event.event_type === "PenaltyGoal",
        })),
    [snapshot.events, playerIndex, snapshot.home_team.name, snapshot.away_team.name],
  );
  const eventFilters = [
    { id: "all", label: t("match.events") },
    { id: "goals", label: t("match.goals") },
    { id: "shots", label: t("match.shots") },
    { id: "cards", label: t("match.cards") },
    { id: "substitutions", label: t("match.substitutions") },
    { id: "injuries", label: t("match.eventTypes.Injury") },
  ] as const;
  const matchMomentum = useMemo(
    () => buildMatchMomentum(snapshot.events, matchDuration),
    [snapshot.events, matchDuration],
  );
  const maxMomentum = Math.max(1, ...matchMomentum.map((period) => Math.max(period.home, period.away)));
  const timelineEvents = snapshot.events.filter((event) =>
    ["Goal", "PenaltyGoal", "ShotSaved", "ShotOnTarget", "ShotOffTarget", "ShotBlocked", "YellowCard", "RedCard", "SecondYellow", "Substitution", "Injury"].includes(event.event_type),
  );
  const homeBench = snapshot.home_bench.slice(0, 5);
  const awayBench = snapshot.away_bench.slice(0, 5);
  const homeOnPitch = markers.filter((marker) => marker.side === "Home").length;
  const awayOnPitch = markers.filter((marker) => marker.side === "Away").length;
  const homeSubsUsed = snapshot.home_subs_made;
  const awaySubsUsed = snapshot.away_subs_made;

  const getPlayerCards = (playerId: string, side: MatchSide) =>
    (side === "Home" ? homeCards : awayCards)[playerId] ?? 0;

  const isSubbedOn = (playerId: string) =>
    substitutions.some((substitution) => substitution.player_on_id === playerId);

  const renderBench = (players: EnginePlayerData[], side: MatchSide, color: string) => (
    <div className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="truncate text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          {side === "Home" ? snapshot.home_team.name : snapshot.away_team.name}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-gray-500 dark:text-gray-400">
          {side === "Home"
            ? t("match.subsUsed", { used: homeSubsUsed, max: snapshot.max_subs })
            : t("match.subsUsed", { used: awaySubsUsed, max: snapshot.max_subs })}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {players.length === 0 ? (
          <span className="text-[10px] text-gray-400">{t("match.noBenchAvailable")}</span>
        ) : (
          players.map((player) => (
            <button
              type="button"
              key={player.id}
              onClick={() => setSelectedPlayerId(player.id)}
              title={player.name + " · " + t("match.fitness") + ": " + player.condition + "%"}
              className="flex max-w-full items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1 text-left text-[10px] transition-colors hover:border-primary-400 hover:bg-primary-50 dark:border-navy-600 dark:hover:bg-navy-700"
            >
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
              <span className="max-w-24 truncate text-gray-700 dark:text-gray-200">{player.name}</span>
              <span className="font-bold tabular-nums text-gray-500">{player.ovr}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );

  return (
    <section aria-label={t("match.pitchView")} className="mx-auto flex w-full max-w-6xl flex-col gap-3">
      <div className="relative overflow-hidden rounded-2xl border border-navy-700 bg-gradient-to-br from-[#101a2b] via-[#17283c] to-[#0b1422] p-4 text-white shadow-xl">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-30 [background:radial-gradient(circle_at_50%_0%,rgba(255,255,255,.18),transparent_58%)]" />
        <div className="relative grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-5">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 text-xs font-black shadow-lg sm:h-12 sm:w-12 sm:text-sm" style={{ backgroundColor: homeColor }}>
              {snapshot.home_team.name.split(/\\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-black sm:text-sm">{snapshot.home_team.name}</p>
              <p className="truncate text-[9px] uppercase tracking-widest text-white/55">{snapshot.home_team.formation}</p>
            </div>
          </div>
          <div className="flex min-w-0 flex-col items-center">
            <div className="flex items-center gap-2 font-heading text-3xl font-black tabular-nums tracking-wider sm:gap-3 sm:text-5xl">
              <span>{snapshot.home_score}</span>
              <span className="text-white/35">:</span>
              <span>{snapshot.away_score}</span>
            </div>
            <span className="mt-1 rounded-full border border-white/15 bg-white/10 px-2.5 py-1 text-[9px] font-bold uppercase tracking-widest text-white/80">
              {snapshot.current_minute}' · {phaseLabel}
            </span>
          </div>
          <div className="flex min-w-0 items-center justify-end gap-2 text-right sm:gap-3">
            <div className="min-w-0">
              <p className="truncate text-xs font-black sm:text-sm">{snapshot.away_team.name}</p>
              <p className="truncate text-[9px] uppercase tracking-widest text-white/55">{snapshot.away_team.formation}</p>
            </div>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/25 text-xs font-black shadow-lg sm:h-12 sm:w-12 sm:text-sm" style={{ backgroundColor: awayColor }}>
              {snapshot.away_team.name.split(/\\s+/).slice(0, 2).map((part) => part[0] ?? "").join("").toUpperCase()}
            </span>
          </div>
        </div>
        <div className="relative mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-[9px] font-bold uppercase tracking-widest text-white/55">
          <span>{snapshot.home_team.play_style} · {snapshot.away_team.play_style}</span>
          <span className="rounded-full bg-white/10 px-2.5 py-1 text-white/85">{scoreState}</span>
        </div>
      </div>

      {goalContributions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-navy-700 dark:bg-navy-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{t("match.goalContributions")}</h3>
            <span className="text-[10px] tabular-nums text-gray-400">{goalContributions.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {goalContributions.map((goal) => (
              <div key={goal.id} className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-navy-900">
                <span className="shrink-0 text-[10px] font-black tabular-nums text-gray-500">{goal.minute}'</span>
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: goal.side === "Home" ? homeColor : awayColor }} />
                <div className="min-w-0">
                  <p className="truncate text-[10px] font-bold text-gray-800 dark:text-gray-100">
                    {goal.scorer ?? t("match.scorers")}
                    {goal.isPenalty ? " · " + t("match.pen") : ""}
                  </p>
                  <p className="truncate text-[9px] text-gray-400">
                    {goal.assist ? t("match.assist", { name: goal.assist }) : goal.teamName}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-4">
          {([["Home", homeColor, snapshot.home_team.name], ["Away", awayColor, snapshot.away_team.name]] as const).map(
            ([side, color, name]) => (
              <div key={side} className="flex min-w-0 items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
                <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-full border border-white/80 shadow" style={{ backgroundColor: color }} />
                <span className="max-w-40 truncate">{name}</span>
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[9px] tabular-nums text-gray-500 dark:bg-navy-700 dark:text-gray-300">
                  {side === "Home" ? snapshot.home_team.play_style : snapshot.away_team.play_style}
                </span>
              </div>
            ),
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-heading text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
            {snapshot.current_minute}'
          </span>
          <button
            type="button"
            onClick={() => setShowNames((value) => !value)}
            aria-pressed={showNames}
            className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-gray-600 hover:bg-gray-100 dark:border-navy-600 dark:text-gray-300 dark:hover:bg-navy-700"
          >
            {showNames ? t("match.hideNames") : t("match.showNames")}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-gray-500 dark:text-gray-400">
        <span>{phaseLabel}</span>
        <span className="tabular-nums">{progressMinute}' / {matchDuration}'</span>
      </div>
      <div className="relative">
        <div
          className="relative h-2 rounded-full bg-gray-200 dark:bg-navy-700"
          role="progressbar"
          aria-label={phaseLabel}
          aria-valuemin={0}
          aria-valuemax={matchDuration}
          aria-valuenow={progressMinute}
        >
          <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-primary-500 transition-[width] duration-500" style={{ width: matchProgress + "%" }} />
          {[25, 50, 75].map((mark) => (
            <span key={mark} aria-hidden="true" className="absolute top-0 h-full w-px bg-white/80" style={{ left: mark + "%" }} />
          ))}
        </div>
        {timelineEvents.map((event, index) => {
          const isGoal = event.event_type === "Goal" || event.event_type === "PenaltyGoal";
          const isCard = ["YellowCard", "RedCard", "SecondYellow"].includes(event.event_type);
          const isSubstitution = event.event_type === "Substitution";
          const isInjury = event.event_type === "Injury";
          const filter: MatchEventFilter = isGoal
            ? "goals"
            : isCard
              ? "cards"
              : isSubstitution
                ? "substitutions"
                : isInjury
                  ? "injuries"
                  : "shots";
          const marker = isGoal ? "⚽" : isSubstitution ? "↕" : isCard ? (event.event_type === "YellowCard" ? "🟨" : "🟥") : isInjury ? "✚" : "•";
          const left = (Math.min(matchDuration, Math.max(0, event.minute)) / matchDuration) * 100;
          return (
            <button
              type="button"
              key={event.minute + "-" + event.event_type + "-" + index}
              title={event.minute + "' · " + eventLabel(event, t)}
              aria-label={event.minute + "' · " + eventLabel(event, t)}
              onClick={() => setEventFilter(filter)}
              className="absolute top-1/2 z-10 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white bg-white text-[9px] shadow hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              style={{ left: left + "%" }}
            >
              {marker}
            </button>
          );
        })}
      </div>
      <div className="relative isolate mx-auto aspect-[16/9] min-h-[330px] w-full overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#277e4d] via-[#1d7042] to-[#165d38] shadow-xl">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="absolute inset-y-0 border-r border-white/[0.035] bg-white/[0.025]"
            style={{ left: (index * 100) / 6 + "%", width: 100 / 6 + "%" }}
          />
        ))}
        <div aria-hidden="true" className="absolute inset-[2.5%] rounded-sm border border-white/65" />
        <div aria-hidden="true" className="absolute bottom-[2.5%] left-1/2 top-[2.5%] border-l border-white/60" />
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 aspect-square h-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60" />
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75" />
        <div aria-hidden="true" className="absolute left-[2.5%] top-[27%] h-[46%] w-[14%] border border-white/60" />
        <div aria-hidden="true" className="absolute left-[2.5%] top-[39%] h-[22%] w-[6%] border border-white/60" />
        <div aria-hidden="true" className="absolute right-[2.5%] top-[27%] h-[46%] w-[14%] border border-white/60" />
        <div aria-hidden="true" className="absolute right-[2.5%] top-[39%] h-[22%] w-[6%] border border-white/60" />
        <div aria-hidden="true" className="absolute -left-1 top-[44%] h-[12%] w-2 rounded-l-sm border border-white/80 bg-white/10" />
        <div aria-hidden="true" className="absolute -right-1 top-[44%] h-[12%] w-2 rounded-r-sm border border-white/80 bg-white/10" />

        <div aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-white/75">
          {t("match.homeAttack")} →
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-white/75">
          ← {t("match.awayAttack")}
        </div>

        {markers.map((marker) => {
          const jersey = playerJerseyMap.get(marker.player.id);
          const initials = marker.player.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] ?? "")
            .join("")
            .toUpperCase();
          const shortName = marker.player.name.trim().split(/\s+/).slice(-1)[0] ?? marker.player.name;
          const isInAction = marker.player.id === activePlayerId;
          const markerLeft = isInAction
            ? BALL_ZONE_X[currentAction?.zone ?? snapshot.ball_zone] ?? marker.left
            : marker.left;
          const markerTop = isInAction ? (marker.side === "Home" ? 40 : 60) : marker.top;
          const yellowCount = getPlayerCards(marker.player.id, marker.side);
          const selected = selectedPlayerId === marker.player.id;
          const enteredAsSub = isSubbedOn(marker.player.id);
          const wasInjured = snapshot.events.some((event) => event.event_type === "Injury" && event.player_id === marker.player.id);
          const setPieces = marker.side === "Home" ? snapshot.home_set_pieces : snapshot.away_set_pieces;
          const duties = [
            setPieces?.captain === marker.player.id ? { code: "C", label: t("match.captain") } : null,
            setPieces?.penalty_taker === marker.player.id ? { code: "P", label: t("match.penaltyTaker") } : null,
            setPieces?.free_kick_taker === marker.player.id ? { code: "FK", label: t("match.freeKickTaker") } : null,
            setPieces?.corner_taker === marker.player.id ? { code: "CK", label: t("match.cornerTaker") } : null,
          ].filter((duty): duty is { code: string; label: string } => duty !== null);

          return (
            <button
              type="button"
              key={marker.player.id}
              title={marker.player.name + " · " + (marker.side === "Home" ? snapshot.home_team.name : snapshot.away_team.name)}
              aria-label={t("match.playerOverview") + ": " + marker.player.name}
              aria-pressed={selected}
              onClick={() => setSelectedPlayerId(selected ? null : marker.player.id)}
              className={
                "absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 rounded-lg p-0.5 transition-[left,top,transform] duration-700 ease-out hover:z-40 hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white " +
                (isInAction ? "z-30 scale-110 " : "") +
                (selected ? "ring-2 ring-amber-300 " : "")
              }
              style={{ left: markerLeft + "%", top: markerTop + "%" }}
            >
              <span
                className={"relative flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/90 text-[9px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)] " +
                  (isInAction ? "animate-pulse ring-4 ring-white/50 " : "")}
                style={{ backgroundColor: marker.color }}
              >
                {jersey ?? initials}
                {yellowCount > 0 && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2 rounded-[2px] border border-black/20 bg-yellow-300" />
                )}
                {enteredAsSub && (
                  <span className="absolute -bottom-1 -left-1 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-emerald-500 text-[8px] text-white">▲</span>
                )}
                {wasInjured && (
                  <span title={t("match.eventTypes.Injury")} className="absolute -bottom-1 -right-1 flex h-3 w-3 items-center justify-center rounded-full border border-white bg-orange-500 text-[8px] font-black text-white">!</span>
                )}
              </span>
              {showNames && (
                <span className="max-w-[58px] truncate rounded bg-black/45 px-1 text-center text-[8px] font-semibold leading-3 text-white drop-shadow">
                  {shortName}
                </span>
              )}
              {duties.length > 0 && (
                <span className="flex gap-0.5">
                  {duties.map((duty) => (
                    <span key={duty.code} title={duty.label} className="rounded bg-amber-300 px-1 text-[7px] font-black leading-3 text-amber-950">
                      {duty.code}
                    </span>
                  ))}
                </span>
              )}
            </button>
          );
        })}

        <div
          aria-label={t("match.ballZone") + ": " + ballZoneLabel}
          className="absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-[left,top] duration-700 ease-in-out"
          style={{ left: ballX + "%", top: ballY + "%" }}
        >
          <span className="absolute inset-0 rounded-full bg-white/55 animate-ping" />
          <span className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-900/80 bg-white text-[11px] shadow-lg">⚽</span>
        </div>

        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/30 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/85">
          {snapshot.home_team.formation}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/30 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/85">
          {snapshot.away_team.formation}
        </div>
        <div className="pointer-events-none absolute bottom-3 left-3 rounded-md bg-black/30 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/85">
          {t("match.live")}
        </div>
        <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/30 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/85">
          {ballZoneLabel}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-6">
        {[
          ["goals", t("match.goals")],
          ["shotsOnTarget", t("match.shotsOnTarget")],
          ["shotsOffTarget", t("match.shotsOffTarget")],
          ["shotsBlocked", t("match.shotsBlocked")],
          ["corners", t("match.corners")],
          ["fouls", t("match.fouls")],
          ["yellowCards", t("match.yellowCards")],
          ["redCards", t("match.redCards")],
          ["tackles", t("match.tackles")],
          ["dribbles", t("match.dribbles")],
          ["passes", t("match.passes")],
          ["interceptions", t("match.interceptions")],
          ["crosses", t("match.crosses")],
          ["injuries", t("match.eventTypes.Injury")],
        ].map(([key, label]) => {
          const statKey = key as keyof TeamMatchCounts;
          const counts = { Home: matchCounts.Home[statKey], Away: matchCounts.Away[statKey] };
          return (
            <div key={key} className="rounded-lg border border-gray-200 bg-white px-2 py-2 dark:border-navy-700 dark:bg-navy-800">
              <p className="truncate text-[9px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{label}</p>
              <p className="flex items-center gap-1 text-lg font-heading font-bold tabular-nums text-gray-900 dark:text-white">
                <span style={{ color: homeColor }}>{counts.Home}</span>
                <span className="text-gray-400">–</span>
                <span style={{ color: awayColor }}>{counts.Away}</span>
              </p>
              <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-navy-900" aria-hidden="true">
                <span className="h-full transition-[width] duration-300" style={{ width: (counts.Home + counts.Away) > 0 ? (counts.Home / (counts.Home + counts.Away)) * 100 + "%" : "50%", backgroundColor: homeColor }} />
                <span className="h-full flex-1" style={{ backgroundColor: awayColor, opacity: 0.75 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{t("match.possessionSplit")}</h3>
          <span className="text-[10px] text-gray-400">{t("match.inPossession")}: {possessionTeam}</span>
        </div>
        <div className="mb-2 flex items-center justify-between gap-2 text-xs font-bold tabular-nums">
          <span className="min-w-0 truncate" style={{ color: homeColor }}>{snapshot.home_team.name} · {homePossession.toFixed(0)}%</span>
          <span className="min-w-0 truncate text-right" style={{ color: awayColor }}>{awayPossession.toFixed(0)}% · {snapshot.away_team.name}</span>
        </div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-navy-900" role="img" aria-label={t("match.possessionSplit")}>
          <span className="h-full transition-[width] duration-500" style={{ width: homePossession + "%", backgroundColor: homeColor }} />
          <span className="h-full flex-1 transition-[width] duration-500" style={{ backgroundColor: awayColor }} />
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{t("match.momentum")}</h3>
            <p className="text-[9px] text-gray-400">{t("match.momentumHint")}</p>
          </div>
          <div className="flex gap-3 text-[9px] font-semibold text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: homeColor }} />{snapshot.home_team.name}</span>
            <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-sm" style={{ backgroundColor: awayColor }} />{snapshot.away_team.name}</span>
          </div>
        </div>
        <div className="grid grid-cols-6 gap-2 sm:grid-cols-8">
          {matchMomentum.map((period) => (
            <div key={period.start} className="flex min-w-0 flex-col items-center gap-1">
              <div className="flex h-12 w-full items-end justify-center gap-1 rounded-t-md bg-gray-50 px-1 dark:bg-navy-900">
                <span
                  title={snapshot.home_team.name + ": " + period.home}
                  className="min-h-[2px] w-2.5 rounded-t-sm transition-[height] duration-300"
                  style={{ height: Math.max(3, (period.home / maxMomentum) * 100) + "%", backgroundColor: homeColor }}
                />
                <span
                  title={snapshot.away_team.name + ": " + period.away}
                  className="min-h-[2px] w-2.5 rounded-t-sm transition-[height] duration-300"
                  style={{ height: Math.max(3, (period.away / maxMomentum) * 100) + "%", backgroundColor: awayColor }}
                />
              </div>
              <span className="text-[9px] tabular-nums text-gray-400">{period.start}–{period.start + 15}'</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex min-w-0 items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-primary-500/20" style={{ backgroundColor: snapshot.possession === "Home" ? homeColor : awayColor }} />
          <span className="text-gray-500 dark:text-gray-400">{t("match.inPossession")}:</span>
          <strong className="max-w-52 truncate">{possessionTeam}</strong>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <span className="text-gray-500 dark:text-gray-400">{t("match.ballZone")}:</span>
          <strong>{ballZoneLabel}</strong>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        {renderBench(homeBench, "Home", homeColor)}
        {renderBench(awayBench, "Away", awayColor)}
      </div>

      {substitutions.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{t("match.substitutionHistory")}</h3>
            <span className="text-[10px] tabular-nums text-gray-400">{substitutions.length}</span>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {substitutions.slice(-6).reverse().map((substitution) => {
              const playerOn = playerIndex.get(substitution.player_on_id);
              const playerOff = playerIndex.get(substitution.player_off_id);
              const isHome = substitution.side === "Home";
              return (
                <div key={substitution.minute + "-" + substitution.player_on_id} className="flex min-w-0 items-center gap-2 rounded-lg bg-gray-50 px-2.5 py-2 dark:bg-navy-900">
                  <span className="shrink-0 text-[10px] font-bold tabular-nums text-gray-500">{substitution.minute}'</span>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: isHome ? homeColor : awayColor }} />
                  <span className="min-w-0 flex-1 truncate text-[10px] text-gray-700 dark:text-gray-200">
                    <strong>{playerOn?.name ?? substitution.player_on_id}</strong>
                    {" ← "}
                    {playerOff?.name ?? substitution.player_off_id}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {selectedPlayer && selectedSide && (
        <div className="rounded-xl border border-primary-300/60 bg-white p-4 shadow-sm dark:border-primary-500/30 dark:bg-navy-800">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{t("match.playerOverview")}</p>
              <h3 className="truncate font-heading text-lg font-bold text-gray-900 dark:text-white">{selectedPlayer.name}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {selectedSide === "Home" ? snapshot.home_team.name : snapshot.away_team.name}
                {" · "}{selectedPlayer.position}{" · "}{selectedPlayer.role}
                {playerJerseyMap.has(selectedPlayer.id) ? " · #" + playerJerseyMap.get(selectedPlayer.id) : ""}
              </p>
            </div>
            <button type="button" onClick={() => setSelectedPlayerId(null)} className="rounded-lg px-2 py-1 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-navy-700">
              {t("match.close")}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("match.overall")}</p>
              <p className="font-heading text-xl font-bold tabular-nums text-gray-900 dark:text-white">{selectedPlayer.ovr}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("match.fitness")}</p>
              <p className="mb-1 font-heading text-xl font-bold tabular-nums text-gray-900 dark:text-white">{selectedPlayer.condition}%</p>
              <PlayerCondition value={selectedPlayer.condition} label={t("match.fitness")} />
            </div>
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("match.pace")}</p>
              <p className="font-heading text-xl font-bold tabular-nums text-gray-900 dark:text-white">{selectedPlayer.pace}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("match.passing")}</p>
              <p className="font-heading text-xl font-bold tabular-nums text-gray-900 dark:text-white">{selectedPlayer.passing}</p>
            </div>
            {selectedRating !== undefined && (
              <div>
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{t("match.playerRating")}</p>
                <p className="font-heading text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">{selectedRating.toFixed(1)}</p>
              </div>
            )}
          </div>
          {selectedDuties.length > 0 && (
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
            {[
              {
                title: t("match.physical"),
                attributes: [
                  [t("match.pace"), selectedPlayer.pace],
                  [t("match.stamina"), selectedPlayer.stamina],
                  [t("match.strength"), selectedPlayer.strength],
                  [t("match.agility"), selectedPlayer.agility],
                ],
              },
              {
                title: t("match.attacking"),
                attributes: [
                  [t("match.passing"), selectedPlayer.passing],
                  [t("match.shooting"), selectedPlayer.shooting],
                  [t("match.dribbling"), selectedPlayer.dribbling],
                  [t("match.vision"), selectedPlayer.vision],
                  [t("match.aerial"), selectedPlayer.aerial],
                ],
              },
              {
                title: t("match.defending"),
                attributes: [
                  [t("match.tackling"), selectedPlayer.tackling],
                  [t("match.defending"), selectedPlayer.defending],
                  [t("match.positioning"), selectedPlayer.positioning],
                  [t("match.aggression"), selectedPlayer.aggression],
                ],
              },
              {
                title: t("match.mental"),
                attributes: [
                  [t("match.decisions"), selectedPlayer.decisions],
                  [t("match.composure"), selectedPlayer.composure],
                  [t("match.teamwork"), selectedPlayer.teamwork],
                  [t("match.leadership"), selectedPlayer.leadership],
                ],
              },
              {
                title: t("match.goalkeeping"),
                attributes: [
                  [t("match.handling"), selectedPlayer.handling],
                  [t("match.reflexes"), selectedPlayer.reflexes],
                ],
              },
            ].map((group) => (
              <div key={group.title} className="rounded-xl border border-gray-100 bg-gray-50 p-3 dark:border-navy-700 dark:bg-navy-900/70">
                <h4 className="mb-2 text-[9px] font-black uppercase tracking-widest text-gray-500 dark:text-gray-400">{group.title}</h4>
                <div className="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                  {group.attributes.map(([label, value]) => (
                    <div key={String(label)} className="min-w-0">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[9px]">
                        <span className="truncate text-gray-600 dark:text-gray-300">{label}</span>
                        <strong className="tabular-nums text-gray-800 dark:text-gray-100">{value}</strong>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-navy-700" role="meter" aria-label={String(label)} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Number(value)}>
                        <div className="h-full rounded-full bg-gradient-to-r from-primary-500 to-emerald-400" style={{ width: Math.max(0, Math.min(100, Number(value))) + "%" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
              {selectedDuties.map((duty) => (
                <span key={duty} className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">{duty}</span>
              ))}
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              [t("match.shooting"), selectedPlayer.shooting],
              [t("match.dribbling"), selectedPlayer.dribbling],
              [t("match.defending"), selectedPlayer.defending],
              [t("match.stamina"), selectedPlayer.stamina],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-navy-900">
                <p className="text-[10px] text-gray-500 dark:text-gray-400">{label}</p>
                <p className="font-bold tabular-nums text-gray-800 dark:text-gray-100">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(selectedPlayer.traits ?? []).map((trait) => (
              <span key={trait} className="rounded-full bg-primary-50 px-2 py-1 text-[9px] font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-200">{trait}</span>
            ))}
            {getPlayerCards(selectedPlayer.id, selectedSide) > 0 && (
              <span className="rounded-full bg-amber-100 px-2 py-1 text-[9px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                {t("match.yellowCards")}: {getPlayerCards(selectedPlayer.id, selectedSide)}
              </span>
            )}
            {selectedContribution.injuries > 0 && (
              <span className="rounded-full bg-orange-100 px-2 py-1 text-[9px] font-semibold text-orange-800 dark:bg-orange-900/40 dark:text-orange-200">
                {t("match.eventTypes.Injury")}: {selectedContribution.injuries}
              </span>
            )}
            {sentOff.includes(selectedPlayer.id) && (
              <span className="rounded-full bg-red-100 px-2 py-1 text-[9px] font-semibold text-red-800 dark:bg-red-900/40 dark:text-red-200">
                {t("match.sentOff")}
              </span>
            )}
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">{t("match.recentActions")}</h3>
            <span className="text-[10px] tabular-nums text-gray-400">{snapshot.events.length} {t("match.events").toLowerCase()}</span>
          </div>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t("match.eventFilter")}>
            {eventFilters.map((filter) => (
              <button
                type="button"
                key={filter.id}
                aria-pressed={eventFilter === filter.id}
                onClick={() => setEventFilter(filter.id)}
                className={
                  "rounded-full border px-2.5 py-1 text-[9px] font-bold transition-colors " +
                  (eventFilter === filter.id
                    ? "border-primary-500 bg-primary-500 text-white"
                    : "border-gray-200 text-gray-500 hover:bg-gray-100 dark:border-navy-600 dark:text-gray-300 dark:hover:bg-navy-700")
                }
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
        {recentEvents.length === 0 ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">{t("match.noEventsYet")}</p>
        ) : (
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {recentEvents.map((event, index) => {
              const player = event.player_id ? playerIndex.get(event.player_id) : null;
              const teamName = event.side === "Home" ? snapshot.home_team.name : snapshot.away_team.name;
              return (
                <div key={event.minute + "-" + event.event_type + "-" + index} className={"flex min-w-0 items-center gap-2 rounded-lg border px-2 py-1.5 " + getEventTone(event.event_type)}>
                  <span className="shrink-0 rounded bg-black/5 px-1.5 py-1 text-[10px] font-bold tabular-nums dark:bg-white/5">{event.minute}'</span>
                  <span className="min-w-0 flex-1 truncate text-[10px] font-semibold text-gray-700 dark:text-gray-200">
                    {eventLabel(event, t)}
                    {player && (
                      <>
                        {" · "}
                        <button
                          type="button"
                          onClick={() => setSelectedPlayerId(player.id)}
                          className="underline decoration-dotted underline-offset-2 hover:text-primary-600 dark:hover:text-primary-300"
                        >
                          {player.name}
                        </button>
                      </>
                    )}
                  </span>
                  <span className="max-w-20 truncate text-[9px] text-gray-400">{teamName}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[10px] text-gray-500 dark:text-gray-500">
        <span>{t("match.playersOnPitch", { home: homeOnPitch, away: awayOnPitch })}</span>
        <span>{t("match.pitchHint")}</span>
      </div>
    </section>
  );
}
