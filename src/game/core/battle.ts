import type { BattleEvent, Placement, Result, Unit } from "./types";
import { effectiveCharacter, effectiveSkill } from "./attributes";
import { distance, key, nextStep, targets } from "../ai/grid";
import { cast } from "../systems/skills";
export const STEP = 0.05;
export class Battle {
  units: Unit[];
  time = 0;
  paused = false;
  speed = 1;
  result: Result | null = null;
  events: BattleEvent[] = [];
  private accumulator = 0;
  private serial = 0;
  constructor(placements: Placement[]) {
    this.units = placements.map((p) => {
      const data = effectiveCharacter(p.characterId, p.starLevel ?? 1);
      return {
        ...p,
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
    if (target.hp <= 0) return;
    target.shield += value;
    this.emit("shield", source, target, value);
  }
  heal(source: Unit, target: Unit, value: number) {
    if (target.hp <= 0) return;
    const actual = Math.min(value, target.data.maxHP - target.hp);
    target.hp += actual;
    source.healing += actual;
    this.emit("heal", source, target, actual);
  }
  hit(source: Unit, target: Unit, power: number, magic = false) {
    if (target.hp <= 0) return;
    const defense =
      target.data.defense +
      (target.buff === "armor"
        ? effectiveSkill(target.data.skillId, target.starLevel ?? 1).power
        : 0);
    const damage = Math.max(
      1,
      Math.round((power * 100) / (100 + (magic ? defense * 0.5 : defense))),
    );
    const absorb = Math.min(target.shield, damage);
    target.shield -= absorb;
    const actual = Math.min(target.hp, damage - absorb);
    target.hp -= actual;
    source.damage += actual;
    target.taken += actual;
    target.mana = Math.min(target.data.maxMana, target.mana + 8);
    this.emit("damage", source, target, actual);
    if (target.hp === 0) this.emit("death", source, target, 0);
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
    for (const u of [...this.units].sort((a, b) => a.id.localeCompare(b.id))) {
      if (u.hp <= 0) continue;
      if (u.buffUntil <= this.time) u.buff = null;
      u.attackTimer = Math.max(0, u.attackTimer - STEP);
      u.moveTimer = Math.max(0, u.moveTimer - STEP);
      u.castTimer = Math.max(0, u.castTimer - STEP);
      const foes = targets(u, this.units),
        target = foes[0];
      if (!target) continue;
      if (u.mana >= u.data.maxMana && u.castTimer === 0) cast(this, u);
      if (target.hp <= 0) continue;
      if (distance(u, target) <= u.data.attackRange) {
        if (u.attackTimer === 0) {
          this.emit("attack", u, target, 0);
          this.hit(
            u,
            target,
            u.data.attack +
              (u.empowered
                ? effectiveSkill(u.data.skillId, u.starLevel ?? 1).power
                : 0),
          );
          u.empowered = false;
          u.mana = Math.min(u.data.maxMana, u.mana + 22);
          u.attackTimer =
            1 /
            (u.data.attackSpeed *
              (u.buff === "haste"
                ? 1 + effectiveSkill(u.data.skillId, u.starLevel ?? 1).power
                : 1));
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
      const ratio = (list: Unit[]) =>
        list.reduce((n, u) => n + u.hp / u.data.maxHP, 0);
      const score = p.length - e.length || (timeout ? ratio(p) - ratio(e) : 0);
      const mine = this.units.filter((u) => u.team === "player");
      this.result = {
        winner: score > 1e-9 ? "player" : score < -1e-9 ? "enemy" : "draw",
        reason: timeout ? "timeout" : "elimination",
        time: this.time,
        playerAlive: p.length,
        enemyAlive: e.length,
        damage: mine.reduce((n, u) => n + u.damage, 0),
        taken: mine.reduce((n, u) => n + u.taken, 0),
        healing: mine.reduce((n, u) => n + u.healing, 0),
      };
    }
    this.events = this.events.filter((e) => this.time - e.time < 2);
  }
}
