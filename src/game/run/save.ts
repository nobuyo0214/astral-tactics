import { characterById, characters } from "../data/characters";
import { inside, key } from "../ai/grid";
import { copiesForStar, POOL_SIZE, XP_REQUIRED } from "./config";
import type { RunState, SaveData } from "./types";
export const SAVE_KEY = "astral-run-v2";
const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const integer = (
  v: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const finite = (
  v: unknown,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
function validResult(v: unknown): boolean {
  return (
    object(v) &&
    typeof v.winner === "string" &&
    ["player", "enemy", "draw"].includes(v.winner) &&
    typeof v.reason === "string" &&
    ["elimination", "timeout"].includes(v.reason) &&
    finite(v.time, 0, 60) &&
    integer(v.playerAlive, 0, 9) &&
    integer(v.enemyAlive, 0, 9) &&
    ["damage", "taken", "healing"].every((k) => finite(v[k]))
  );
}
export function validRun(value: unknown): value is RunState {
  if (!object(value)) return false;
  const {
    player: p,
    economy: e,
    shop,
    round: r,
    stats,
    bench,
    pool,
    units,
  } = value;
  if (
    !object(p) ||
    !integer(p.hp, 0, 100) ||
    !integer(p.level, 1, 9) ||
    !integer(p.xp, 0, p.level === 9 ? 0 : XP_REQUIRED[p.level] - 1)
  )
    return false;
  if (
    !object(e) ||
    !integer(e.gold) ||
    !integer(e.wins, 0, 10) ||
    !integer(e.losses, 0, 10) ||
    (e.wins > 0 && e.losses > 0)
  )
    return false;
  if (e.lastIncome !== null) {
    const i = e.lastIncome;
    if (
      !object(i) ||
      !["base", "interest", "streak", "special", "total"].every((k) =>
        integer(i[k]),
      ) ||
      !integer(i.interest, 0, 5) ||
      !integer(i.streak, 0, 3) ||
      i.total !==
        (i.base as number) +
          (i.interest as number) +
          (i.streak as number) +
          (i.special as number)
    )
      return false;
  }
  if (
    !object(r) ||
    !integer(r.number, 1, 10) ||
    typeof r.phase !== "string" ||
    !["preparation", "combat", "settlement", "completed", "gameOver"].includes(
      r.phase,
    ) ||
    !integer(r.settledThrough, 0, 10) ||
    (r.lastResult !== null && !validResult(r.lastResult))
  )
    return false;
  const unsettled = r.phase === "preparation" || r.phase === "combat";
  if (r.settledThrough !== (unsettled ? r.number - 1 : r.number)) return false;
  if (
    (r.settledThrough === 0) !== (r.lastResult === null) ||
    (r.settledThrough === 0) !== (e.lastIncome === null)
  )
    return false;
  if (r.phase === "completed" && (r.number !== 10 || p.hp === 0)) return false;
  if (r.phase === "settlement" && (r.number === 10 || p.hp === 0)) return false;
  if ((r.phase === "gameOver") !== (p.hp === 0)) return false;
  if (
    !object(stats) ||
    !integer(stats.highestWinStreak, 0, 10) ||
    !finite(stats.totalDamage) ||
    !integer(stats.highestStar, 1, 3) ||
    stats.completedRounds !== r.settledThrough ||
    e.wins > r.settledThrough ||
    e.losses > r.settledThrough ||
    stats.highestWinStreak < e.wins
  )
    return false;
  if (
    !object(bench) ||
    bench.capacity !== 9 ||
    !object(shop) ||
    typeof shop.locked !== "boolean" ||
    !Array.isArray(shop.slots) ||
    shop.slots.length !== 5 ||
    !object(pool) ||
    Object.keys(pool).length !== characters.length
  )
    return false;
  if (
    !["seed", "rngState"].every((k) => integer(value[k], 0, 4294967295)) ||
    !integer(value.nextUnitId)
  )
    return false;
  if (!Array.isArray(units) || units.length > 18) return false;
  const stock = Object.fromEntries(characters.map((c) => [c.id, 0])),
    ids = new Set<string>(),
    cells = new Set<string>(),
    slots = new Set<number>();
  let board = 0;
  for (const u of units) {
    if (
      !object(u) ||
      typeof u.id !== "string" ||
      !/^p\d+$/.test(u.id) ||
      ids.has(u.id) ||
      !integer(Number(u.id.slice(1)), 0, (value.nextUnitId as number) - 1) ||
      typeof u.characterId !== "string" ||
      !Object.hasOwn(characterById, u.characterId) ||
      !integer(u.starLevel, 1, 3) ||
      u.starLevel > stats.highestStar ||
      !object(u.location)
    )
      return false;
    ids.add(u.id);
    stock[u.characterId] += copiesForStar(u.starLevel as 1 | 2 | 3);
    const l = u.location;
    if (l.zone === "board") {
      if (
        !object(l.cell) ||
        !integer(l.cell.x, 0, 6) ||
        !integer(l.cell.y, 4, 7)
      )
        return false;
      const cell = { x: l.cell.x, y: l.cell.y };
      if (!inside(cell) || cells.has(key(cell))) return false;
      cells.add(key(cell));
      board++;
    } else if (l.zone === "bench") {
      if (!integer(l.slot, 0, 8) || slots.has(l.slot)) return false;
      slots.add(l.slot);
    } else return false;
  }
  if (board > p.level) return false;
  for (const slot of shop.slots) {
    if (
      !object(slot) ||
      (slot.characterId !== null &&
        (typeof slot.characterId !== "string" ||
          !Object.hasOwn(characterById, slot.characterId)))
    )
      return false;
    if (typeof slot.characterId === "string") stock[slot.characterId]++;
  }
  for (const c of characters) {
    const remaining = pool[c.id];
    if (
      !integer(remaining, 0, POOL_SIZE[c.cost]) ||
      remaining + stock[c.id] !== POOL_SIZE[c.cost]
    )
      return false;
  }
  return true;
}
export function encodeSave(state: Readonly<RunState>): string {
  const run = structuredClone(state);
  if (run.round.phase === "combat") run.round.phase = "preparation";
  return JSON.stringify({ version: 2, run } satisfies SaveData);
}
export type LoadResult =
  | { status: "loaded"; state: RunState }
  | {
      status: "empty" | "invalid" | "incompatible" | "unavailable";
      message: string;
    };
export function decodeSave(raw: string | null): LoadResult {
  if (raw === null) return { status: "empty", message: "尚無經營試煉存檔。" };
  try {
    if (raw.length > 1_000_000) throw new Error();
    const data: unknown = JSON.parse(raw);
    if (!object(data)) throw new Error();
    if (data.version !== 2)
      return {
        status: "incompatible",
        message: "存檔版本不相容，請重新開始經營試煉。",
      };
    if (!validRun(data.run)) throw new Error();
    const state = structuredClone(data.run);
    if (state.round.phase === "combat") state.round.phase = "preparation";
    return { status: "loaded", state };
  } catch {
    return {
      status: "invalid",
      message: "存檔已損壞或內容不完整。可重新開始；自由戰鬥不受影響。",
    };
  }
}
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}
export function loadRun(storage: SaveStorage): LoadResult {
  try {
    return decodeSave(storage.getItem(SAVE_KEY));
  } catch {
    return {
      status: "unavailable",
      message: "瀏覽器不允許讀取存檔，本次可繼續遊玩，但無法保證保存。",
    };
  }
}
export function saveRun(
  storage: SaveStorage,
  state: Readonly<RunState>,
): boolean {
  try {
    storage.setItem(SAVE_KEY, encodeSave(state));
    return true;
  } catch {
    return false;
  }
}
