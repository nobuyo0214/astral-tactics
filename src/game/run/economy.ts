import type { RunState, Income } from "./types";
import type { Result } from "../core/types";
import { RULES, XP_REQUIRED } from "./config";
export const interest = (gold: number) => Math.min(5, Math.floor(gold / 10));
export const streakIncome = (count: number) =>
  count >= 6 ? 3 : count >= 4 ? 2 : count >= 2 ? 1 : 0;
export function addXP(state: RunState, amount: number): void {
  state.player.xp += amount;
  while (
    state.player.level < RULES.maxLevel &&
    state.player.xp >= XP_REQUIRED[state.player.level]
  ) {
    state.player.xp -= XP_REQUIRED[state.player.level];
    state.player.level++;
  }
  if (state.player.level === 9) state.player.xp = 0;
}
export function roundIncome(
  state: RunState,
  result: Result,
  special = 0,
): Income {
  state.economy.wins = result.winner === "player" ? state.economy.wins + 1 : 0;
  state.economy.losses =
    result.winner === "enemy" ? state.economy.losses + 1 : 0;
  state.stats.highestWinStreak = Math.max(
    state.stats.highestWinStreak,
    state.economy.wins,
  );
  const base = state.round.number === 1 ? 3 : state.round.number === 2 ? 4 : 5;
  const i = interest(state.economy.gold),
    streak = streakIncome(Math.max(state.economy.wins, state.economy.losses));
  return {
    base,
    interest: i,
    streak,
    special,
    total: base + i + streak + special,
  };
}
