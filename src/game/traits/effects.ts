import type { Battle } from "../core/battle";
import type { Unit } from "../core/types";
import { distance, targets } from "../ai/grid";
import { applyStatus } from "../systems/statuses";
import type {
  ActiveTrait,
  HookName,
  TraitEffectContext,
  TraitKind,
} from "./types";
type Handler = (b: Battle, t: ActiveTrait, c: TraitEffectContext) => void;
function member(t: ActiveTrait, u: Unit) {
  return !u.summon && t.members.includes(u.characterId);
}
const start: Partial<Record<TraitKind, Handler>> = {
  steel: (b, t, { unit: u }) => {
    u.modifier.defense += t.tier!.effect.value;
    if (t.tier!.effect.secondary)
      b.shield(u, u, u.data.maxHP * t.tier!.effect.secondary);
  },
  guardian: (b, t, { unit: u }) => {
    u.modifier.defense += t.tier!.effect.value;
    const shield = t.tier!.effect.secondary ?? 0;
    if (shield)
      b.units
        .filter(
          (a) =>
            a.team === u.team &&
            a !== u &&
            distance(a, u) <= (t.tier!.effect.radius ?? 1),
        )
        .forEach((a) => b.shield(u, a, u.data.maxHP * shield));
  },
  warrior: (_b, t, { unit: u }) => {
    u.modifier.attack += t.tier!.effect.value;
  },
  assassin: (_b, t, { unit: u }) => {
    u.modifier.attackSpeed += t.tier!.effect.value;
  },
  ranger: (_b, t, { unit: u }) => {
    u.modifier.attackSpeed += t.tier!.effect.value;
  },
  gold: (_b, t, { unit: u }) => {
    u.modifier.attackSpeed += t.tier!.effect.secondary ?? 0;
  },
  astral: (_b, t, { unit: u }) => {
    u.modifier.skill += t.tier!.effect.secondary ?? 0;
  },
  mage: (_b, t, { unit: u }) => {
    u.modifier.skillDamage += t.tier!.effect.value;
  },
  healer: (_b, t, { unit: u }) => {
    u.modifier.healing += t.tier!.effect.value;
  },
};
const attack: Partial<Record<TraitKind, Handler>> = {
  frost: (b, t, { unit: u, target }) => {
    if (!target || target.hp <= 0) return;
    const slowed = target.statuses.some((s) => s.id === "slow");
    applyStatus(
      b,
      target,
      u,
      "slow",
      t.tier!.effect.value,
      t.tier!.effect.duration ?? 3,
    );
    if (t.tier!.count === 4 && slowed) {
      target.counters.frostHits++;
      if (
        target.counters.frostHits >= (t.tier!.effect.secondary ?? 3) &&
        b.time >= target.counters.freezeReady
      ) {
        target.counters.frostHits = 0;
        target.counters.freezeReady = b.time + (t.tier!.effect.cooldown ?? 5);
        applyStatus(
          b,
          target,
          u,
          "freeze",
          1,
          t.tier!.effect.freezeDuration ?? 1,
        );
      }
    }
  },
  lightning: (b, t, { unit: u, target }) => {
    const e = t.tier!.effect;
    if (u.counters.attacks % (e.interval ?? 4) !== 0 || !target) return;
    const seen = new Set([target.id]);
    let origin = target;
    for (let i = 0; i < (e.secondary ?? 1); i++) {
      const next = targets(u, b.units)
        .filter(
          (v) => !seen.has(v.id) && distance(origin, v) <= (e.radius ?? 3),
        )
        .sort(
          (a, c) =>
            distance(origin, a) - distance(origin, c) ||
            a.id.localeCompare(c.id),
        )[0];
      if (!next) break;
      seen.add(next.id);
      b.emit("trait", origin, next, 0, "連鎖閃電");
      b.hit(u, next, e.value, true, "trigger");
      origin = next;
    }
  },
  ranger: (b, t, { unit: u, target }) => {
    if (
      t.tier!.count === 4 &&
      u.counters.attacks % (t.tier!.effect.interval ?? 4) === 0 &&
      target &&
      target.hp > 0
    ) {
      b.emit("trait", u, target, 0, "追擊");
      b.hit(
        u,
        target,
        b.attackValue(u) * (t.tier!.effect.secondary ?? 0),
        false,
        "trigger",
      );
    }
  },
};
export function dispatchTrait(
  b: Battle,
  hook: HookName,
  context: TraitEffectContext,
) {
  const u = context.unit;
  for (const t of b.traits[u.team]) {
    if (!t.tier || !member(t, u)) continue;
    if (hook === "onBattleStart") start[t.definition.id]?.(b, t, context);
    if (hook === "onAttack") attack[t.definition.id]?.(b, t, context);
    if (
      hook === "onDamageDealt" &&
      context.target &&
      context.amount !== undefined
    ) {
      if (
        t.definition.id === "burn" &&
        (context.kind === "attack" || context.kind === "skill")
      )
        applyStatus(
          b,
          context.target,
          u,
          "burn",
          b.attackValue(u) * t.tier.effect.value,
          4,
        );
      if (t.definition.id === "abyss" && u.hp > 0 && context.amount > 0) {
        b.heal(u, u, context.amount * t.tier.effect.value);
        b.emit("trait", u, u, 0, "吸血");
      }
    }
    if (
      hook === "onHeal" &&
      t.definition.id === "healer" &&
      t.tier.count === 4 &&
      context.first &&
      context.target
    )
      b.shield(
        u,
        context.target,
        (context.amount ?? 0) * (t.tier.effect.secondary ?? 0),
      );
  }
}
const initialized = new WeakSet<Battle>();
export function startTraits(b: Battle) {
  if (initialized.has(b)) return;
  initialized.add(b);
  // Static bonuses are applied exactly once to per-battle modifiers, never definitions.
  for (const u of [...b.units]) dispatchTrait(b, "onBattleStart", { unit: u });
  for (const team of ["player", "enemy"] as const) {
    const tact = b.traits[team].find(
      (t) => t.definition.id === "tactician" && t.tier,
    );
    if (tact?.tier)
      for (const u of b.units.filter((u) => u.team === team)) {
        u.mana = Math.min(u.data.maxMana, u.mana + tact.tier.effect.value);
        u.modifier.cooldown = 1 - (tact.tier.effect.secondary ?? 0);
      }
    const summon = b.traits[team].find(
      (t) => t.definition.id === "summoner" && t.tier,
    );
    if (summon?.tier) {
      const source = b.units
        .filter((u) => u.team === team && member(summon, u))
        .sort((a, c) => a.id.localeCompare(c.id))[0];
      for (let i = 0; i < summon.tier.effect.value; i++)
        b.summon(source, summon.tier.effect.secondary ?? 1);
    }
    for (const u of b.units.filter((u) => u.team === team && !u.summon))
      for (const t of b.traits[team].filter((t) => t.tier && member(t, u)))
        b.emit("trait", u, u, 0, `${t.definition.name} ${t.tier!.count}`);
  }
}
export function tickTraits(b: Battle, dt: number) {
  for (const u of b.units) {
    if (u.hp <= 0 || u.summon) continue;
    for (const t of b.traits[u.team]) {
      if (!t.tier || !member(t, u)) continue;
      const e = t.tier.effect;
      if (t.definition.id === "astral") {
        u.mana = Math.min(u.data.maxMana, u.mana + e.value * dt);
        if (Math.floor(b.time - dt + 1e-6) < Math.floor(b.time + 1e-6))
          b.emit("trait", u, u, 0, "星能");
      }
      if (
        t.definition.id === "nature" &&
        Math.floor((b.time - dt) / (e.interval ?? 3) + 1e-6) <
          Math.floor(b.time / (e.interval ?? 3) + 1e-6)
      ) {
        b.heal(u, u, u.data.maxHP * e.value);
        b.emit("trait", u, u, 0, "森之回復");
      }
    }
  }
}
export function traitTier(b: Battle, u: Unit, id: TraitKind) {
  return !u.summon
    ? (b.traits[u.team].find(
        (t) => t.definition.id === id && t.members.includes(u.characterId),
      )?.tier ?? null)
    : null;
}
export function outgoingMultiplier(
  b: Battle,
  u: Unit,
  target: Unit,
  kind: import("./types").DamageKind,
): number {
  let bonus = 0;
  const burn = traitTier(b, u, "burn"),
    abyss = traitTier(b, u, "abyss"),
    war = traitTier(b, u, "warrior"),
    assassin = traitTier(b, u, "assassin"),
    mage = traitTier(b, u, "mage");
  if (
    kind !== "dot" &&
    burn?.count === 4 &&
    target.statuses.some((s) => s.id === "burn")
  )
    bonus += burn.effect.secondary ?? 0;
  if (
    abyss?.count === 4 &&
    target.hp / target.data.maxHP < (abyss.effect.threshold ?? 0.35)
  )
    bonus += abyss.effect.secondary ?? 0;
  if (
    kind === "attack" &&
    war?.count === 4 &&
    target.hp / target.data.maxHP < (war.effect.threshold ?? 0.4)
  )
    bonus += war.effect.secondary ?? 0;
  if (kind === "attack" && assassin?.count === 4 && u.counters.attacks === 0)
    bonus += assassin.effect.secondary ?? 0;
  if (kind === "skill") {
    bonus += u.modifier.skillDamage;
    if (mage?.count === 4 && u.counters.damageCasts === 0)
      bonus += mage.effect.secondary ?? 0;
  }
  return 1 + bonus;
}

export function victoryGold(b: Battle): number {
  return (
    b.traits.player.find((t) => t.definition.id === "gold")?.tier?.effect
      .value ?? 0
  );
}
