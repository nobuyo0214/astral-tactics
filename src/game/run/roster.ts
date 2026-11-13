import { inside, key } from "../ai/grid";
import type { Placement } from "../core/types";
import { RULES } from "./config";
import type { OwnedUnit, RunState, UnitLocation } from "./types";
export function boardPlacements(state: RunState): Placement[] {
  return state.units.flatMap((u) =>
    u.location.zone === "board"
      ? [
          {
            id: u.id,
            characterId: u.characterId,
            starLevel: u.starLevel,
            team: "player" as const,
            ...u.location.cell,
          },
        ]
      : [],
  );
}
export function firstBenchSlot(units: OwnedUnit[]): number {
  return (
    Array.from({ length: RULES.benchSize }, (_, i) => i).find(
      (i) =>
        !units.some(
          (u) => u.location.zone === "bench" && u.location.slot === i,
        ),
    ) ?? -1
  );
}
export function mergeUnits(state: RunState): string[] {
  const upgrades: string[] = [];
  for (const id of [...new Set(state.units.map((u) => u.characterId))].sort())
    for (const star of [1, 2] as const) {
      while (true) {
        const candidates = state.units
          .filter((u) => u.characterId === id && u.starLevel === star)
          .sort((a, b) => {
            const rank = (u: OwnedUnit) =>
              u.location.zone === "board"
                ? u.location.cell.y * 7 + u.location.cell.x
                : 100 + u.location.slot;
            return rank(a) - rank(b) || a.id.localeCompare(b.id);
          });
        if (candidates.length < 3) break;
        const [keep, ...consume] = candidates.slice(0, 3);
        keep.starLevel = star === 1 ? 2 : 3;
        state.units = state.units.filter((u) => !consume.includes(u));
        upgrades.push(keep.id);
        state.stats.highestStar = Math.max(
          state.stats.highestStar,
          keep.starLevel,
        ) as 1 | 2 | 3;
      }
    }
  return upgrades;
}
export function moveUnit(
  state: RunState,
  id: string,
  destination: UnitLocation,
): void {
  const unit = state.units.find((u) => u.id === id);
  if (!unit) throw new Error("找不到角色。");
  if (
    destination.zone === "board" &&
    (!inside(destination.cell) || destination.cell.y < 4)
  )
    throw new Error("只能部署在我方下半場。");
  if (
    destination.zone === "bench" &&
    (!Number.isInteger(destination.slot) ||
      destination.slot < 0 ||
      destination.slot >= 9)
  )
    throw new Error("備戰席格位無效。");
  const target = state.units.find(
    (u) =>
      u.location.zone === destination.zone &&
      (u.location.zone === "board" && destination.zone === "board"
        ? key(u.location.cell) === key(destination.cell)
        : u.location.zone === "bench" &&
          destination.zone === "bench" &&
          u.location.slot === destination.slot),
  );
  if (
    unit.location.zone === "bench" &&
    destination.zone === "board" &&
    !target &&
    boardPlacements(state).length >= state.player.level
  )
    throw new Error("上場人數已達等級上限，請先升級。");
  const previous = structuredClone(unit.location);
  if (target && target !== unit) target.location = previous;
  unit.location = structuredClone(destination);
}
