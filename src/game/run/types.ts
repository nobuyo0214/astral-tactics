import type { Cell, Result } from "../core/types";
export type UnitStarLevel = 1 | 2 | 3;
export type GamePhase =
  | "preparation"
  | "combat"
  | "settlement"
  | "completed"
  | "gameOver";
export type UnitLocation =
  | { zone: "board"; cell: Cell }
  | { zone: "bench"; slot: number };
export interface OwnedUnit {
  id: string;
  characterId: string;
  starLevel: UnitStarLevel;
  location: UnitLocation;
}
export interface BenchState {
  capacity: 9;
}
export interface PlayerState {
  hp: number;
  level: number;
  xp: number;
}
export interface Income {
  base: number;
  interest: number;
  streak: number;
  special: number;
  total: number;
}
export interface EconomyState {
  gold: number;
  wins: number;
  losses: number;
  lastIncome: Income | null;
}
export interface ShopSlot {
  characterId: string | null;
}
export interface ShopState {
  slots: ShopSlot[];
  locked: boolean;
}
export type CharacterPool = Record<string, number>;
export interface RoundState {
  number: number;
  phase: GamePhase;
  settledThrough: number;
  lastResult: Result | null;
}
export interface RunState {
  player: PlayerState;
  economy: EconomyState;
  shop: ShopState;
  pool: CharacterPool;
  units: OwnedUnit[];
  bench: BenchState;
  round: RoundState;
  seed: number;
  rngState: number;
  nextUnitId: number;
  stats: {
    highestWinStreak: number;
    totalDamage: number;
    highestStar: UnitStarLevel;
    completedRounds: number;
  };
}
export interface SaveData {
  version: 2;
  run: RunState;
}
export interface ActionResult {
  ok: boolean;
  message: string;
  upgrades: string[];
}
