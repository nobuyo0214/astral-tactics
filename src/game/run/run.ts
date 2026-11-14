import { validRun } from "./save";
import { Battle } from "../core/battle";
import { characterById } from "../data/characters";
import { RULES, copiesForStar } from "./config";
import { addXP, roundIncome } from "./economy";
import { initialPool, refillShop, slotPrice } from "./shop";
import {
  boardPlacements,
  firstBenchSlot,
  mergeUnits,
  moveUnit,
} from "./roster";
import { roundEnemies, rounds } from "./rounds";
import type { ActionResult, RunState, UnitLocation } from "./types";
export function createRun(seed: number): RunState {
  const normalized = seed >>> 0;
  const state: RunState = {
    player: { hp: 100, level: 2, xp: 0 },
    economy: { gold: 10, wins: 0, losses: 0, lastIncome: null },
    shop: { slots: [], locked: false },
    pool: initialPool(),
    units: [],
    bench: { capacity: 9 },
    round: {
      number: 1,
      phase: "preparation",
      settledThrough: 0,
      lastResult: null,
    },
    seed: normalized,
    rngState: normalized,
    nextUnitId: 0,
    stats: {
      highestWinStreak: 0,
      totalDamage: 0,
      highestStar: 1,
      completedRounds: 0,
    },
  };
  refillShop(state);
  return state;
}
export class Run {
  private current: RunState;
  private activeBattle: Battle | null = null;
  get state(): Readonly<RunState> {
    return this.current;
  }
  get battle(): Battle | null {
    return this.activeBattle;
  }
  constructor(state: RunState) {
    if (!validRun(state)) throw new Error("經營資料不完整，請重新開始。");
    this.current = structuredClone(state);
  }
  private transact(
    action: (draft: RunState) => string[] | void,
    onlyPreparation = true,
  ): ActionResult {
    if (onlyPreparation && this.current.round.phase !== "preparation")
      return { ok: false, message: "只能在準備階段操作。", upgrades: [] };
    const draft = structuredClone(this.current);
    try {
      const upgrades = action(draft) ?? [];
      if (!validRun(draft)) throw new Error("交易未通過完整性檢查，已回滾。");
      this.current = draft;
      return { ok: true, message: "操作完成。", upgrades };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "操作失敗。",
        upgrades: [],
      };
    }
  }
  buy(index: number): ActionResult {
    return this.transact((s) => {
      const cost = slotPrice(s, index),
        characterId = s.shop.slots[index]?.characterId;
      if (!characterId || cost === undefined)
        throw new Error("此商品已售出或不存在。");
      if (s.economy.gold < cost) throw new Error("金幣不足，無法購買。");
      const incoming = {
        id: `p${s.nextUnitId++}`,
        characterId,
        starLevel: 1 as const,
        location: { zone: "bench" as const, slot: 9 },
      };
      s.units.push(incoming);
      const upgrades = mergeUnits(s);
      if (
        s.units.includes(incoming) &&
        incoming.location.zone === "bench" &&
        incoming.location.slot === 9
      ) {
        const slot = firstBenchSlot(s.units);
        if (slot < 0)
          throw new Error("備戰席已滿，且此次購買無法合成騰出位置。");
        incoming.location.slot = slot;
      }
      s.economy.gold -= cost;
      s.shop.slots[index].characterId = null;
      return upgrades;
    });
  }
  refresh(): ActionResult {
    return this.transact((s) => {
      if (s.economy.gold < RULES.refreshCost)
        throw new Error("金幣不足，刷新需要 2 金幣。");
      s.economy.gold -= RULES.refreshCost;
      refillShop(s);
    });
  }
  toggleLock(): ActionResult {
    return this.transact((s) => {
      s.shop.locked = !s.shop.locked;
    });
  }
  buyXP(): ActionResult {
    return this.transact((s) => {
      if (s.player.level === 9) throw new Error("已達最高等級。");
      if (s.economy.gold < RULES.xpCost)
        throw new Error("金幣不足，購買經驗需要 4 金幣。");
      s.economy.gold -= RULES.xpCost;
      addXP(s, RULES.xpPurchase);
    });
  }
  move(id: string, location: UnitLocation): ActionResult {
    return this.transact((s) => moveUnit(s, id, location));
  }
  toBench(id: string): ActionResult {
    const slot = firstBenchSlot(this.current.units);
    if (slot < 0)
      return {
        ok: false,
        message: "備戰席已滿，請交換格位或出售角色。",
        upgrades: [],
      };
    return this.move(id, { zone: "bench", slot });
  }
  sell(id: string): ActionResult {
    return this.transact((s) => {
      const u = s.units.find((u) => u.id === id);
      if (!u) throw new Error("角色已售出或不存在。");
      const copies = copiesForStar(u.starLevel);
      s.economy.gold +=
        characterById[u.characterId].cost * copies * RULES.sellRatio;
      s.pool[u.characterId] += copies;
      s.units = s.units.filter((t) => t.id !== id);
    });
  }
  beginCombat(): ActionResult {
    if (this.current.round.phase !== "preparation")
      return { ok: false, message: "目前不能開始戰鬥。", upgrades: [] };
    const placements = boardPlacements(this.current);
    if (!placements.length)
      return { ok: false, message: "請先部署至少一名角色。", upgrades: [] };
    this.activeBattle = new Battle([
      ...placements,
      ...roundEnemies(this.current.round.number),
    ]);
    this.current.round.phase = "combat";
    return { ok: true, message: "戰鬥開始，商店與部署已鎖定。", upgrades: [] };
  }
  settle(): ActionResult {
    const result = this.activeBattle?.result;
    if (
      this.current.round.phase !== "combat" ||
      !result ||
      this.current.round.settledThrough >= this.current.round.number
    )
      return { ok: false, message: "本回合尚未完成或已結算。", upgrades: [] };
    const outcome = this.transact((s) => {
      s.round.settledThrough = s.round.number;
      s.round.lastResult = structuredClone(result);
      const damage =
        result.winner === "enemy"
          ? 2 + Math.floor(s.round.number / 3) + result.enemyAlive
          : result.winner === "draw"
            ? 2
            : 0;
      s.player.hp = Math.max(0, s.player.hp - damage);
      const income = roundIncome(
        s,
        result,
        rounds[s.round.number - 1].specialReward,
      );
      s.economy.lastIncome = income;
      s.economy.gold += income.total;
      addXP(s, RULES.naturalXP);
      s.stats.totalDamage += result.damage;
      s.stats.completedRounds = s.round.number;
      s.round.phase =
        s.player.hp === 0
          ? "gameOver"
          : s.round.number === 10
            ? "completed"
            : "settlement";
    }, false);
    return outcome;
  }
  nextRound(): ActionResult {
    if (this.current.round.phase !== "settlement")
      return { ok: false, message: "目前不能進入下一回合。", upgrades: [] };
    const result = this.transact((s) => {
      s.round.number++;
      s.round.phase = "preparation";
      if (!s.shop.locked) refillShop(s);
    }, false);
    if (result.ok) this.activeBattle = null;
    return result;
  }
}
