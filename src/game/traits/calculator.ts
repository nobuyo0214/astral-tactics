import { characterById } from "../data/characters";
import type { Placement, Team } from "../core/types";
import { TraitRegistry } from "./registry";
import type { ActiveTrait, TraitKind, TraitSnapshot } from "./types";
/** Extension boundary for future trait-granting items; P3 supplies no grants. */
export interface TraitGrant {
  unitId: string;
  traitId: TraitKind;
}
export function calculateTraits(
  placements: readonly Placement[],
  team: Team,
  grants: readonly TraitGrant[] = [],
): ActiveTrait[] {
  const unique = new Map(
    placements
      .filter(
        (p) =>
          p.team === team &&
          !("summon" in p && p.summon) &&
          !("hp" in p && typeof p.hp === "number" && p.hp <= 0),
      )
      .map((p) => [p.characterId, p]),
  );
  return TraitRegistry.map((definition) => {
    const members = Array.from(unique.values())
      .filter((p) => {
        const c = characterById[p.characterId];
        return (
          (definition.type === "faction" ? c.faction : c.class) ===
            definition.name ||
          grants.some((g) => g.unitId === p.id && g.traitId === definition.id)
        );
      })
      .map((p) => p.characterId)
      .sort();
    const count = members.length,
      tier =
        [...definition.tiers].reverse().find((t) => count >= t.count) ?? null,
      next = definition.tiers.find((t) => t.count > count)?.count ?? null;
    return { definition, count, tier, next, members };
  })
    .filter((t) => t.count > 0)
    .sort(
      (a, b) =>
        (b.tier?.count ?? 0) - (a.tier?.count ?? 0) ||
        b.count / (b.next ?? b.count) - a.count / (a.next ?? a.count) ||
        a.definition.id.localeCompare(b.definition.id),
    );
}
export function snapshotTraits(
  placements: readonly Placement[],
): TraitSnapshot {
  const freeze = (team: Team) =>
    Object.freeze(
      calculateTraits(placements, team).map((t) =>
        Object.freeze({
          ...t,
          members: Object.freeze([...t.members]) as unknown as string[],
        }),
      ),
    );
  return Object.freeze({ player: freeze("player"), enemy: freeze("enemy") });
}
