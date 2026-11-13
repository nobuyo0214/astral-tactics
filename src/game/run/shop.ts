import { characters, characterById } from "../data/characters";
import { POOL_SIZE, SHOP_ODDS, RULES } from "./config";
import type { CharacterPool, RunState } from "./types";
export const initialPool = (): CharacterPool =>
  Object.fromEntries(characters.map((c) => [c.id, POOL_SIZE[c.cost]]));
export function random(state: RunState): number {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let t = state.rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function weighted<T>(
  state: RunState,
  items: T[],
  weight: (item: T) => number,
): T | undefined {
  const total = items.reduce((n, i) => n + weight(i), 0);
  if (total <= 0) return;
  let roll = random(state) * total;
  for (const i of items) {
    roll -= weight(i);
    if (roll < 0) return i;
  }
  return items.at(-1);
}
export function refillShop(state: RunState): void {
  for (const slot of state.shop.slots)
    if (slot.characterId) state.pool[slot.characterId]++;
  state.shop.slots = [];
  for (let i = 0; i < RULES.shopSize; i++) {
    const costs = [1, 2, 3, 4, 5].filter((cost) =>
      characters.some((c) => c.cost === cost && state.pool[c.id] > 0),
    );
    // Renormalize eligible weighted tiers; if all allowed tiers are exhausted,
    // use remaining tiers uniformly. An entirely empty pool gives an empty slot.
    const odds = SHOP_ODDS[state.player.level];
    const cost =
      weighted(state, costs, (c) => odds[c - 1]) ??
      weighted(state, costs, () => 1);
    const character = weighted(
      state,
      characters.filter((c) => c.cost === cost && state.pool[c.id] > 0),
      (c) => state.pool[c.id],
    );
    if (character) state.pool[character.id]--;
    state.shop.slots.push({ characterId: character?.id ?? null });
  }
}
export function ownedCopies(state: RunState, id: string): number {
  return state.units
    .filter((u) => u.characterId === id)
    .reduce((n, u) => n + 3 ** (u.starLevel - 1), 0);
}
export const slotPrice = (state: RunState, index: number) =>
  characterById[state.shop.slots[index]?.characterId ?? ""]?.cost;
