import type { Unit } from "../core/types";
import type { Battle } from "../core/battle";
import { applyStatus } from "./statuses";
import { dispatchTrait } from "../traits/effects";
import { distance, targets } from "../ai/grid";
export function cast(b: Battle, u: Unit): void {
  if (u.hp <= 0 || u.summon) return;
  const s = b.skill(u),
    foes = targets(u, b.units),
    target = foes[0];
  if (!target) return;
  u.mana = 0;
  u.castTimer = Math.max(0.6, 1.2 * u.modifier.cooldown);
  dispatchTrait(b, "onSkillCast", { unit: u });
  u.counters.casts++;
  b.emit("skill", u, u, 0, s.name);
  const hurt = (t: Unit, magic = true) => b.hit(u, t, s.power, magic, "skill");
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
    case "leech": {
      const actual = b.hit(u, target, s.power, false, "skill");
      b.heal(u, u, actual * 0.3);
      break;
    }
    case "summon":
      b.summon(u, s.power);
      break;
    case "energy":
      allies
        .filter((t) => t !== u)
        .forEach((t) => {
          t.mana = Math.min(t.data.maxMana, t.mana + s.power);
          b.emit("trait", u, t, 0, "能量支援");
        });
      break;
    case "multiheal":
      allies.slice(0, 3).forEach((t) => b.heal(u, t, s.power));
      break;
    case "froststrike":
      hurt(target);
      applyStatus(b, target, u, "slow", 0.2, 3);
      break;
    case "stun":
      hurt(target);
      if (b.time >= target.counters.freezeReady) {
        applyStatus(b, target, u, "freeze", 1, 1);
        target.counters.freezeReady = b.time + 5;
      }
      break;
    case "slowarea":
      foes
        .filter((t) => distance(t, target) <= 2)
        .forEach((t) => {
          hurt(t);
          applyStatus(b, t, u, "slow", 0.2, 3);
        });
      break;
    case "multihit":
      for (let i = 0; i < 3 && target.hp > 0; i++) hurt(target, false);
      break;
    case "areaward":
      allies
        .filter((t) => distance(t, u) <= 2)
        .forEach((t) => b.shield(u, t, s.power));
      break;
    case "execute":
      hurt(target, false);
      break;
  }
  if (
    [
      "area",
      "multi",
      "nova",
      "chain",
      "blast",
      "execute",
      "leech",
      "froststrike",
      "stun",
      "slowarea",
      "multihit",
    ].includes(s.kind)
  )
    u.counters.damageCasts++;
}
