import type { Placement } from "../core/types";
import type { UnitStarLevel } from "./types";
export interface RoundDefinition {
  name: string;
  specialReward: number;
  enemies: {
    characterId: string;
    starLevel: UnitStarLevel;
    x: number;
    y: number;
  }[];
}
const lineup = (ids: string[], stars: UnitStarLevel[] = []) =>
  ids.map((characterId, i) => ({
    characterId,
    starLevel: stars[i] ?? 1,
    x: [2, 4, 1, 5, 3, 0, 6, 2, 4][i],
    y: i < 2 ? 2 : i < 7 ? 0 : 1,
  }));
export const rounds: RoundDefinition[] = [
  { name: "初階敵人 · 灰燼偵察", specialReward: 0, enemies: lineup(["flame"]) },
  {
    name: "普通敵人 · 翠風前線",
    specialReward: 0,
    enemies: lineup(["flame", "leaf"]),
  },
  {
    name: "普通敵人 · 雷光巡衛",
    specialReward: 0,
    enemies: lineup(["ember", "bolt", "thunder"]),
  },
  {
    name: "強化敵人 · 森林壁壘",
    specialReward: 0,
    enemies: lineup(["oak", "bolt", "leaf", "grove"]),
  },
  {
    name: "精英敵人 · 熾羽軍團",
    specialReward: 0,
    enemies: lineup(["ember", "flame", "plume", "leaf", "grove"]),
  },
  {
    name: "普通敵人 · 群星集結",
    specialReward: 0,
    enemies: lineup(["lumen", "bolt", "spark", "thunder", "grove"]),
  },
  {
    name: "強化敵人 · 年輪之誓",
    specialReward: 0,
    enemies: lineup(["oak", "bolt", "spark", "thunder", "grove"], [2]),
  },
  {
    name: "精英敵人 · 裁決前夕",
    specialReward: 0,
    enemies: lineup(
      ["oak", "judge", "spark", "thunder", "grove", "astral"],
      [2],
    ),
  },
  {
    name: "強化敵人 · 破碎星門",
    specialReward: 0,
    enemies: lineup(
      ["oak", "judge", "spark", "thunder", "grove", "astral"],
      [2, 2],
    ),
  },
  {
    name: "最終試煉 · 星環重鑄",
    specialReward: 0,
    enemies: lineup(
      ["oak", "judge", "spark", "thunder", "grove", "astral", "lumen"],
      [2, 2, 2, 1, 1, 1, 1],
    ),
  },
];
export function roundEnemies(round: number): Placement[] {
  return rounds[round - 1].enemies.map((u, i) => ({
    ...u,
    id: `e${i}`,
    team: "enemy",
  }));
}
