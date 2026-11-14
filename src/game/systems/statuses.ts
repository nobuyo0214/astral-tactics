import type { Battle } from "../core/battle";
import type { Unit } from "../core/types";
import type { StatusEffect } from "../traits/types";
export function applyStatus(
  b: Battle,
  target: Unit,
  source: Unit,
  id: StatusEffect["id"],
  power: number,
  duration: number,
) {
  if (
    target.hp <= 0 ||
    !Number.isFinite(power) ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    return;
  const old = target.statuses.find((s) => s.id === id);
  if (old) {
    old.remaining = duration;
    old.duration = duration;
    if (power >= old.power) {
      old.source = source.id;
      old.power = power;
    }
  } else
    target.statuses.push({
      id,
      source: source.id,
      power,
      duration,
      remaining: duration,
      nextTick: b.time + 1,
      stacking: "refresh-strongest",
    });
  b.emit(
    "status",
    source,
    target,
    0,
    id === "burn" ? "燃燒" : id === "slow" ? "霜緩" : "冰凍",
  );
}
export function tickStatuses(b: Battle, dt: number) {
  for (const u of b.units) {
    if (u.hp <= 0) {
      u.statuses = [];
      continue;
    }
    for (const s of u.statuses) {
      s.remaining = Math.max(0, Math.round((s.remaining - dt) * 1000) / 1000);
      if (s.id === "burn" && b.time + 1e-8 >= s.nextTick) {
        const source = b.units.find((t) => t.id === s.source);
        if (source) b.hit(source, u, s.power, true, "dot");
        s.nextTick += 1;
      }
    }
    u.statuses = u.statuses.filter((s) => s.remaining > 0);
    if (u.summon && b.time >= u.summon.expires) {
      u.hp = 0;
      b.emit("death", u, u, 0, "靈體消散");
    }
  }
}
