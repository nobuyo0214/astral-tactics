import type { Cell, Unit } from "../core/types";
export const COLS = 7,
  ROWS = 8;
export const key = (c: Cell) => `${c.x},${c.y}`;
export const inside = (c: Cell) =>
  Number.isInteger(c.x) &&
  Number.isInteger(c.y) &&
  c.x >= 0 &&
  c.x < COLS &&
  c.y >= 0 &&
  c.y < ROWS;
export const distance = (a: Cell, b: Cell) =>
  Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export function targets(u: Unit, units: Unit[]): Unit[] {
  return units
    .filter((t) => t.team !== u.team && t.hp > 0)
    .sort(
      (a, b) =>
        distance(u, a) - distance(u, b) ||
        a.hp - b.hp ||
        a.id.localeCompare(b.id),
    );
}
export function nextStep(
  start: Cell,
  target: Cell,
  range: number,
  blocked: Set<string>,
): Cell | null {
  const queue = [start],
    seen = new Set([key(start)]),
    first = new Map<string, Cell>();
  for (let i = 0; i < queue.length; i++) {
    const c = queue[i];
    if (i > 0 && distance(c, target) <= range) return first.get(key(c))!;
    for (const [dx, dy] of [
      [0, -1],
      [-1, 0],
      [1, 0],
      [0, 1],
    ]) {
      const n = { x: c.x + dx, y: c.y + dy },
        k = key(n);
      if (!inside(n) || seen.has(k) || blocked.has(k)) continue;
      seen.add(k);
      first.set(k, i === 0 ? n : first.get(key(c))!);
      queue.push(n);
    }
  }
  return null;
}
