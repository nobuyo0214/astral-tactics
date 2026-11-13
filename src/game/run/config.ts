export const SHOP_ODDS: Readonly<Record<number, readonly number[]>> = {
  1: [100, 0, 0, 0, 0],
  2: [100, 0, 0, 0, 0],
  3: [75, 25, 0, 0, 0],
  4: [55, 30, 15, 0, 0],
  5: [45, 33, 20, 2, 0],
  6: [30, 40, 25, 5, 0],
  7: [19, 30, 35, 15, 1],
  8: [15, 25, 30, 25, 5],
  9: [10, 20, 30, 30, 10],
};
export const XP_REQUIRED: Readonly<Record<number, number>> = {
  1: 2,
  2: 2,
  3: 6,
  4: 10,
  5: 20,
  6: 32,
  7: 48,
  8: 64,
  9: 0,
};
export const POOL_SIZE: Readonly<Record<number, number>> = {
  1: 30,
  2: 25,
  3: 20,
  4: 15,
  5: 12,
};
export const STAR_HP = [1, 1.8, 3.2] as const;
export const STAR_ATTACK = [1, 1.5, 2.3] as const;
export const STAR_SKILL = [1, 1.35, 1.8] as const;
export const RULES = {
  benchSize: 9,
  shopSize: 5,
  refreshCost: 2,
  xpCost: 4,
  xpPurchase: 4,
  naturalXP: 2,
  sellRatio: 1,
  maxLevel: 9,
  rounds: 10,
} as const;
export const copiesForStar = (star: 1 | 2 | 3): number => 3 ** (star - 1);
