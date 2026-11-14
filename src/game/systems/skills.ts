import type { Unit } from "../core/types";
import type { Battle } from "../core/battle";
import { effectiveSkill } from "../core/attributes";
import { distance, targets } from "../ai/grid";
export function cast(b: Battle, u: Unit): void {
  const s = effectiveSkill(u.data.skillId, u.starLevel ?? 1),
    foes = targets(u, b.units),
    target = foes[0];
  if (!target) return;
  u.mana = 0;
  u.castTimer = 1.2;
  b.emit("skill", u, u, 0, s.name);
  const hurt = (t: Unit, magic = true) => b.hit(u, t, s.power, magic);
  const allies = b.units
    .filter((t) => t.team === u.team && t.hp > 0)
    .sort(
      (a, b) =>
        a.hp / a.data.maxHP - b.hp / b.data.maxHP || a.id.localeCompare(b.id),
    );
  switch (s.kind) {
    case "empower":
      u.empowered = true;
      break;
    case "shield":
      b.shield(u, u, s.power);
      break;
    case "area":
      foes.filter((t) => distance(t, target) <= 2).forEach((t) => hurt(t));
      break;
    case "heal":
      b.heal(u, allies[0], s.power);
      break;
    case "haste":
    case "armor":
      u.buff = s.kind;
      u.buffUntil = b.time + s.duration;
      break;
    case "multi":
      foes.slice(0, 2).forEach((t) => hurt(t, false));
      break;
    case "nova":
      foes.filter((t) => distance(u, t) <= 2).forEach((t) => hurt(t, false));
      break;
    case "chain":
      foes.slice(0, 3).forEach((t) => hurt(t));
      break;
    case "blast":
      hurt(target);
      break;
    case "ward":
      [...new Set([u, allies[0]])].forEach((t) => b.shield(u, t, s.power));
      break;
    case "execute":
      hurt(target, false);
      break;
  }
}
