import { useTranslation } from "react-i18next";
import type { MatchSnapshot } from "./types";
import { buildFormationSlots } from "./FormationPitch";

interface MatchPitchViewProps {
  snapshot: MatchSnapshot;
  homeColor: string;
  awayColor: string;
  playerJerseyMap: Map<string, number>;
}

const BALL_ZONE_X: Record<string, number> = {
  HomeBox: 9,
  HomeDefense: 28,
  Midfield: 50,
  AwayDefense: 72,
  AwayBox: 91,
};

export default function MatchPitchView({
  snapshot,
  homeColor,
  awayColor,
  playerJerseyMap,
}: MatchPitchViewProps) {
  const { t } = useTranslation();
  const sentOff = snapshot.sent_off ?? [];
  const homeSlots = buildFormationSlots(
    snapshot.home_team.formation,
    snapshot.home_team.players,
    sentOff,
  );
  const awaySlots = buildFormationSlots(
    snapshot.away_team.formation,
    snapshot.away_team.players,
    sentOff,
  );

  const markers = [
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

  const ballX = BALL_ZONE_X[snapshot.ball_zone] ?? 50;
  const possessionTeam =
    snapshot.possession === "Home" ? snapshot.home_team.name : snapshot.away_team.name;
  const ballZoneLabel = t(`match.ballZones.${snapshot.ball_zone}`, {
    defaultValue: snapshot.ball_zone,
  });

  return (
    <section
      aria-label={t("match.pitchView")}
      className="mx-auto flex w-full max-w-6xl flex-col gap-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full border border-white/80 shadow"
              style={{ backgroundColor: homeColor }}
            />
            <span className="max-w-40 truncate">{snapshot.home_team.name}</span>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-700 dark:text-gray-200">
            <span
              aria-hidden="true"
              className="h-3 w-3 rounded-full border border-white/80 shadow"
              style={{ backgroundColor: awayColor }}
            />
            <span className="max-w-40 truncate">{snapshot.away_team.name}</span>
          </div>
        </div>
        <span className="font-heading text-xs font-bold uppercase tracking-widest text-gray-500 dark:text-gray-400">
          {t("match.pitchView")} · {snapshot.current_minute}'
        </span>
      </div>

      <div className="relative isolate mx-auto aspect-[16/9] min-h-[330px] w-full overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-b from-[#277e4d] via-[#1d7042] to-[#165d38] shadow-xl">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            className="absolute inset-y-0 border-r border-white/[0.035] bg-white/[0.025]"
            style={{ left: `${(index * 100) / 6}%`, width: `${100 / 6}%` }}
          />
        ))}

        <div
          aria-hidden="true"
          className="absolute inset-[2.5%] rounded-sm border border-white/65"
        />
        <div
          aria-hidden="true"
          className="absolute bottom-[2.5%] left-1/2 top-[2.5%] border-l border-white/60"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 aspect-square h-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/60"
        />
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/75"
        />

        <div
          aria-hidden="true"
          className="absolute left-[2.5%] top-[27%] h-[46%] w-[14%] border border-white/60"
        />
        <div
          aria-hidden="true"
          className="absolute left-[2.5%] top-[39%] h-[22%] w-[6%] border border-white/60"
        />
        <div
          aria-hidden="true"
          className="absolute right-[2.5%] top-[27%] h-[46%] w-[14%] border border-white/60"
        />
        <div
          aria-hidden="true"
          className="absolute right-[2.5%] top-[39%] h-[22%] w-[6%] border border-white/60"
        />
        <div
          aria-hidden="true"
          className="absolute -left-1 top-[44%] h-[12%] w-2 rounded-l-sm border border-white/80 bg-white/10"
        />
        <div
          aria-hidden="true"
          className="absolute -right-1 top-[44%] h-[12%] w-2 rounded-r-sm border border-white/80 bg-white/10"
        />

        {markers.map((marker) => {
          const jersey = playerJerseyMap.get(marker.player.id);
          const initials = marker.player.name
            .split(/\s+/)
            .slice(0, 2)
            .map((part) => part[0] ?? "")
            .join("")
            .toUpperCase();
          const shortName = marker.player.name.trim().split(/\s+/).slice(-1)[0];

          return (
            <div
              key={marker.player.id}
              title={`${marker.player.name} · ${marker.side === "Home" ? snapshot.home_team.name : snapshot.away_team.name}`}
              aria-label={marker.player.name}
              className="absolute z-20 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-0.5 transition-[left,top] duration-700 ease-out hover:z-40 hover:scale-110"
              style={{ left: `${marker.left}%`, top: `${marker.top}%` }}
            >
              <span
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/90 text-[9px] font-black text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]"
                style={{ backgroundColor: marker.color }}
              >
                {jersey ?? initials}
              </span>
              <span className="max-w-[58px] truncate rounded bg-black/35 px-1 text-center text-[8px] font-semibold leading-3 text-white drop-shadow">
                {shortName}
              </span>
            </div>
          );
        })}

        <div
          aria-label={t("match.ballZone")}
          className="absolute z-30 flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center transition-[left] duration-700 ease-in-out"
          style={{ left: `${ballX}%`, top: "50%" }}
        >
          <span className="absolute inset-0 rounded-full bg-white/55 animate-ping" />
          <span className="relative flex h-5 w-5 items-center justify-center rounded-full border-2 border-gray-900/80 bg-white text-[11px] shadow-lg">
            ⚽
          </span>
        </div>

        <div className="pointer-events-none absolute left-3 top-3 rounded-md bg-black/25 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/80">
          {snapshot.home_team.formation}
        </div>
        <div className="pointer-events-none absolute right-3 top-3 rounded-md bg-black/25 px-2 py-1 text-[9px] font-bold uppercase tracking-widest text-white/80">
          {snapshot.away_team.formation}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-navy-700 dark:bg-navy-800">
        <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-full ring-2 ring-primary-500/20"
            style={{
              backgroundColor: snapshot.possession === "Home" ? homeColor : awayColor,
            }}
          />
          <span className="text-gray-500 dark:text-gray-400">{t("match.inPossession")}:</span>
          <strong className="max-w-52 truncate">{possessionTeam}</strong>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-200">
          <span className="text-gray-500 dark:text-gray-400">{t("match.ballZone")}:</span>
          <strong>{ballZoneLabel}</strong>
        </div>
      </div>

      <p className="px-1 text-[11px] leading-relaxed text-gray-500 dark:text-gray-500">
        {t("match.pitchHint")}
      </p>
    </section>
  );
}
