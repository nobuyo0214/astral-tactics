import { snapshotTraits } from "../traits/calculator";
import {
  dispatchTrait,
  startTraits,
  tickTraits,
  traitTier,
  outgoingMultiplier,
  victoryGold,
} from "../traits/effects";
import { tickStatuses } from "../systems/statuses";
import type { DamageKind, TraitSnapshot } from "../traits/types";
import { inside } from "../ai/grid";
import type { BattleEvent, Placement, Result, Unit } from "./types";
import { effectiveCharacter, effectiveSkill } from "./attributes";
import { distance, key, nextStep, targets, combatTargets } from "../ai/grid";
import { cast } from "../systems/skills";
export const STEP = 0.05;
export class Battle {
  units: Unit[];
  readonly traits: TraitSnapshot;
  private summonSerial = 0;
  time = 0;
  paused = false;
  speed = 1;
  result: Result | null = null;
  events: BattleEvent[] = [];
  private accumulator = 0;
  private serial = 0;
  constructor(placements: Placement[]) {
    this.traits = snapshotTraits(placements);
    this.units = placements.map((p) => {
      const data = effectiveCharacter(p.characterId, p.starLevel ?? 1);
      return {
        ...p,
        statuses: [],
        modifier: {
          defense: 0,
          attack: 0,
          attackSpeed: 0,
          skill: 1,
          skillDamage: 0,
          healing: 0,
          cooldown: 1,
        },
        counters: {
          attacks: 0,
          casts: 0,
          damageCasts: 0,
          heals: 0,
          frostHits: 0,
          freezeReady: 0,
        },
        data,
        hp: data.maxHP,
        mana: data.startingMana,
        shield: 0,
        attackTimer: 0,
        moveTimer: 0,
        castTimer: 0,
        buffUntil: 0,
        buff: null,
        empowered: false,
        damage: 0,
        taken: 0,
        healing: 0,
      };
    });
    startTraits(this);
  }
  emit(
    kind: BattleEvent["kind"],
    source: Unit,
    target: Unit,
    value: number,
    label?: string,
  ) {
    this.events.push({
      id: this.serial++,
      time: this.time,
      kind,
      source: source.id,
      target: target.id,
      value,
      label,
      x: target.x,
      y: target.y,
    });
  }
  shield(source: Unit, target: Unit, value: number) {
    if (target.hp <= 0 || !Number.isFinite(value) || value <= 0) return;
    target.shield += value;
    this.emit("shield", source, target, value);
  }
  heal(source: Unit, target: Unit, value: number) {
    if (target.hp <= 0 || !Number.isFinite(value) || value <= 0) return;
    const nature = traitTier(this, target, "nature");
    const actual = Math.min(
      Math.max(0, value) *
        (1 + source.modifier.healing) *
        (1 + (nature?.effect.secondary ?? 0)),
      target.data.maxHP - target.hp,
    );
    if (actual <= 0) return;
    target.hp += actual;
    source.healing += actual;
    this.emit("heal", source, target, actual);
    const first = source.counters.heals === 0;
    source.counters.heals++;
    dispatchTrait(this, "onHeal", {
      unit: source,
      target,
      amount: actual,
      first,
    });
  }
  hit(
    source: Unit,
    target: Unit,
    power: number,
    magic = false,
    kind: DamageKind = "attack",
  ): number {
    if (target.hp <= 0 || !Number.isFinite(power)) return 0;
    const defense = this.defenseValue(target);
    const damage = Math.max(
      1,
      Math.round(
        (power * outgoingMultiplier(this, source, target, kind) * 100) /
          (100 + (magic ? defense * 0.5 : defense)),
      ),
    );
    const absorb = Math.min(target.shield, damage);
    target.shield -= absorb;
    const actual = Math.min(target.hp, damage - absorb);
    target.hp -= actual;
    source.damage += actual;
    target.taken += actual;
    target.mana = Math.min(target.data.maxMana, target.mana + 8);
    this.emit("damage", source, target, actual);
    dispatchTrait(this, "onDamageDealt", {
      unit: source,
      target,
      amount: actual,
      kind,
    });
    dispatchTrait(this, "onDamageTaken", {
      unit: target,
      target: source,
      amount: actual,
      kind,
    });
    if (target.hp === 0) {
      this.emit("death", source, target, 0);
      dispatchTrait(this, "onUnitDeath", { unit: target });
    }
    return actual;
  }
  defenseValue(u: Unit) {
    return (
      u.data.defense +
      u.modifier.defense +
      (u.buff === "armor" ? this.skill(u).power : 0)
    );
  }
  attackValue(u: Unit) {
    return Math.round(u.data.attack * (1 + u.modifier.attack));
  }
  attackSpeed(u: Unit) {
    const slow = Math.max(
      0,
      ...u.statuses.filter((s) => s.id === "slow").map((s) => s.power),
    );
    return Math.max(
      0.1,
      u.data.attackSpeed *
        (1 + u.modifier.attackSpeed) *
        (u.buff === "haste" ? 1 + this.skill(u).power : 1) *
        (1 - slow),
    );
  }
  skill(u: Unit) {
    const s = effectiveSkill(u.data.skillId, u.starLevel ?? 1);
    return { ...s, power: s.power * u.modifier.skill };
  }
  attack(u: Unit, target: Unit) {
    if (u.hp <= 0 || target.hp <= 0) return;
    this.emit("attack", u, target, 0);
    this.hit(
      u,
      target,
      this.attackValue(u) + (u.empowered ? this.skill(u).power : 0),
      false,
      "attack",
    );
    u.empowered = false;
    u.counters.attacks++;
    u.mana = Math.min(u.data.maxMana, u.mana + 22);
    dispatchTrait(this, "onAttack", { unit: u, target });
  }
  summon(source: Unit, strength = 1): Unit | null {
    if (
      !source ||
      source.hp <= 0 ||
      source.summon ||
      this.units.filter((u) => u.team === source.team && u.summon && u.hp > 0)
        .length >= 2
    )
      return null;
    const occupied = new Set(this.units.filter((u) => u.hp > 0).map(key));
    const cells = Array.from({ length: 56 }, (_, i) => ({
      x: i % 7,
      y: Math.floor(i / 7),
    }))
      .filter((c) => inside(c) && !occupied.has(key(c)))
      .sort(
        (a, b) =>
          distance(source, a) - distance(source, b) || a.y - b.y || a.x - b.x,
      );
    if (!cells.length) return null;
    const scale = Math.min(2, Math.max(0.5, strength));
    const data = {
      ...source.data,
      name: "星契靈體",
      symbol: "靈",
      maxHP: Math.round(320 * scale),
      attack: Math.round(42 * scale),
      defense: 18,
      attackSpeed: 0.85,
      attackRange: 1,
      moveSpeed: 2,
      startingMana: 0,
      maxMana: 999,
    };
    const unit: Unit = {
      ...source,
      ...cells[0],
      id: `s${source.team}-${this.summonSerial++}`,
      data,
      hp: data.maxHP,
      mana: 0,
      shield: 0,
      statuses: [],
      modifier: {
        defense: 0,
        attack: 0,
        attackSpeed: 0,
        skill: 1,
        skillDamage: 0,
        healing: 0,
        cooldown: 1,
      },
      counters: {
        attacks: 0,
        casts: 0,
        damageCasts: 0,
        heals: 0,
        frostHits: 0,
        freezeReady: 0,
      },
      attackTimer: 0.3,
      moveTimer: 0,
      castTimer: 0,
      buff: null,
      buffUntil: 0,
      empowered: false,
      damage: 0,
      taken: 0,
      healing: 0,
      summon: { ownerId: source.id, expires: this.time + 12 },
    };
    this.units.push(unit);
    this.emit("summon", source, unit, 0, "靈體降臨");
    return unit;
  }

  advance(realSeconds: number) {
    if (
      this.paused ||
      this.result ||
      !Number.isFinite(realSeconds) ||
      realSeconds < 0
    )
      return;
    this.accumulator += realSeconds * this.speed;
    while (this.accumulator + 1e-9 >= STEP && !this.result) {
      this.accumulator -= STEP;
      this.tick();
    }
  }
  tick() {
    if (this.paused || this.result) return;
    this.time = Math.round((this.time + STEP) * 1000) / 1000;
    tickStatuses(this, STEP);
    tickTraits(this, STEP);
    for (const u of [...this.units].sort((a, b) => a.id.localeCompare(b.id))) {
      if (u.hp <= 0) continue;
      if (u.buffUntil <= this.time) u.buff = null;
      u.attackTimer = Math.max(0, u.attackTimer - STEP);
      u.moveTimer = Math.max(0, u.moveTimer - STEP);
      u.castTimer = Math.max(0, u.castTimer - STEP);
      if (u.hp <= 0 || u.statuses.some((s) => s.id === "freeze")) continue;
      const foes = combatTargets(u, this.units);
      let target = foes[0];
      if (!target) continue;
      if (
        !u.summon &&
        u.data.class === "刺客" &&
        u.counters.attacks === 0 &&
        distance(u, target) > u.data.attackRange
      ) {
        const occupied = new Set(
          this.units.filter((t) => t.hp > 0 && t !== u).map(key),
        );
        if (!nextStep(u, target, u.data.attackRange, occupied))
          target =
            foes.find((t) => distance(u, t) <= u.data.attackRange) ?? target;
      }
      if (!u.summon && u.mana >= u.data.maxMana && u.castTimer === 0)
        cast(this, u);
      if (target.hp <= 0) continue;
      if (distance(u, target) <= u.data.attackRange) {
        if (u.attackTimer === 0) {
          this.attack(u, target);
          u.attackTimer = 1 / this.attackSpeed(u);
        }
      } else if (u.moveTimer === 0) {
        const blocked = new Set(
          this.units.filter((t) => t.hp > 0 && t !== u).map(key),
        );
        // A surrounded nearest target must not prevent reaching another available enemy.
        const step = foes
          .map((t) => nextStep(u, t, u.data.attackRange, blocked))
          .find(Boolean);
        if (step) {
          Object.assign(u, step);
          this.emit("move", u, u, 0);
        }
        u.moveTimer = 1 / u.data.moveSpeed;
      }
    }
    const p = this.units.filter((u) => u.team === "player" && u.hp > 0),
      e = this.units.filter((u) => u.team === "enemy" && u.hp > 0);
    if (!p.length || !e.length || this.time >= 60) {
      const timeout = this.time >= 60 && p.length > 0 && e.length > 0;
      const realP = p.filter((u) => !u.summon),
        realE = e.filter((u) => !u.summon);
      const ratio = (list: Unit[]) =>
        list.reduce((n, u) => n + u.hp / u.data.maxHP, 0);
      const score = timeout
        ? realP.length - realE.length || ratio(realP) - ratio(realE)
        : p.length
          ? 1
          : e.length
            ? -1
            : 0;
      const mine = this.units.filter((u) => u.team === "player");
      this.result = {
        winner: score > 1e-9 ? "player" : score < -1e-9 ? "enemy" : "draw",
        reason: timeout ? "timeout" : "elimination",
        time: this.time,
        playerAlive: realP.length,
        enemyAlive: realE.length,
        damage: mine.reduce((n, u) => n + u.damage, 0),
        taken: mine.reduce((n, u) => n + u.taken, 0),
        healing: mine.reduce((n, u) => n + u.healing, 0),
        ...(score > 0 && victoryGold(this) > 0
          ? { traitGold: victoryGold(this) }
          : {}),
      };
      for (const u of this.units)
        dispatchTrait(this, "onBattleEnd", { unit: u });
    }
    this.events = this.events.filter((e) => this.time - e.time < 2);
  }
}
