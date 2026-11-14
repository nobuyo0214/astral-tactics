import { describe, it, expect } from "vitest";
import { Run, createRun } from "../src/game/run/run";
import { initialPool, refillShop, ownedCopies } from "../src/game/run/shop";
import { boardPlacements, mergeUnits } from "../src/game/run/roster";
import { addXP, interest, streakIncome } from "../src/game/run/economy";
import {
  SHOP_ODDS,
  XP_REQUIRED,
  copiesForStar,
  POOL_SIZE,
} from "../src/game/run/config";
import { roundEnemies, rounds } from "../src/game/run/rounds";
import {
  decodeSave,
  encodeSave,
  validRun,
  saveRun,
  loadRun,
  SAVE_KEY,
  type SaveStorage,
} from "../src/game/run/save";
import { characters, characterById, skills } from "../src/game/data/characters";
import {
  effectiveCharacter,
  effectiveSkill,
} from "../src/game/core/attributes";
import { Battle } from "../src/game/core/battle";
import { cast } from "../src/game/systems/skills";
import type { RunState, UnitStarLevel, OwnedUnit } from "../src/game/run/types";
function owned(
  i: number,
  id = "flame",
  star: UnitStarLevel = 1,
  board = false,
): OwnedUnit {
  return {
    id: `p${i}`,
    characterId: id,
    starLevel: star,
    location: board
      ? { zone: "board", cell: { x: i % 7, y: 4 + Math.floor(i / 7) } }
      : { zone: "bench", slot: i % 9 },
  };
}
function fixture(
  units: OwnedUnit[] = [],
  shop: (string | null)[] = ["flame", "leaf", "flame", "leaf", "flame"],
  gold = 100,
): RunState {
  const s = createRun(42);
  s.pool = initialPool();
  s.shop.slots = shop.map((characterId) => ({ characterId }));
  s.economy.gold = gold;
  s.units = structuredClone(units);
  s.nextUnitId = Math.max(0, ...units.map((u) => Number(u.id.slice(1)) + 1));
  s.stats.highestStar = Math.max(
    1,
    ...units.map((u) => u.starLevel),
  ) as UnitStarLevel;
  for (const u of units) s.pool[u.characterId] -= copiesForStar(u.starLevel);
  for (const id of shop) if (id) s.pool[id]--;
  expect(validRun(s)).toBe(true);
  return s;
}
function forceRound(run: Run, winner: "player" | "enemy" | "draw" = "player") {
  expect(run.beginCombat().ok).toBe(true);
  const b = run.battle!;
  for (const u of b.units) if (winner === "draw" || u.team !== winner) u.hp = 0;
  b.advance(0.05);
  expect(b.result).not.toBeNull();
  expect(run.settle().ok).toBe(true);
}
function forceShop(run: Run, id = "flame") {
  const s = structuredClone(run.state);
  for (const slot of s.shop.slots)
    if (slot.characterId) s.pool[slot.characterId]++;
  s.shop.slots = Array.from({ length: 5 }, () => ({ characterId: id }));
  s.pool[id] -= 5;
  return new Run(s);
}
class MemoryStorage implements SaveStorage {
  data: Record<string, string> = {};
  getItem(k: string) {
    return this.data[k] ?? null;
  }
  setItem(k: string, v: string) {
    this.data[k] = v;
  }
  removeItem(k: string) {
    delete this.data[k];
  }
}
describe("商店及有限卡池", () => {
  it("初始資源、空隊、5 格，機率各級總和100%", () => {
    const s = createRun(123);
    expect(s.player).toEqual({ hp: 100, level: 2, xp: 0 });
    expect(s.economy.gold).toBe(10);
    expect(s.units).toEqual([]);
    expect(s.bench.capacity).toBe(9);
    expect(s.shop.slots).toHaveLength(5);
    expect(validRun(s)).toBe(true);
    for (const odds of Object.values(SHOP_ODDS))
      expect(odds.reduce((a, b) => a + b, 0)).toBe(100);
    expect(SHOP_ODDS[2]).not.toEqual(SHOP_ODDS[3]);
  });
  it("種子與 RNG 狀態可重現連續刷新", () => {
    const a = new Run(createRun(7)),
      b = new Run(createRun(7));
    for (let i = 0; i < 4; i++) {
      expect(a.state.shop).toEqual(b.state.shop);
      a.refresh();
      b.refresh();
    }
    expect(a.state.rngState).toBe(b.state.rngState);
  });
  it("費用與等級抽取，耗盡後安全降階／升階備援", () => {
    const s = createRun(1);
    expect(
      s.shop.slots.every((slot) => characterById[slot.characterId!].cost === 1),
    ).toBe(true);
    s.shop.slots = [];
    for (const c of characters) s.pool[c.id] = c.cost === 5 ? 1 : 0;
    refillShop(s);
    expect(s.shop.slots.filter((x) => x.characterId)).toHaveLength(1);
    expect(s.shop.slots.find((x) => x.characterId)?.characterId).toBe("judge");
    expect(Object.values(s.pool).every((n) => n >= 0)).toBe(true);
    refillShop(s);
    expect(s.shop.slots.filter((x) => x.characterId)).toHaveLength(1);
  });
  it("購買扣款、售出欄位不可再次購買", () => {
    const r = new Run(fixture([], undefined, 10));
    expect(r.buy(0).ok).toBe(true);
    expect(r.state.economy.gold).toBe(9);
    expect(r.state.units).toHaveLength(1);
    expect(r.state.shop.slots[0].characterId).toBeNull();
    const before = structuredClone(r.state);
    expect(r.buy(0).ok).toBe(false);
    expect(r.state).toEqual(before);
    expect(validRun(r.state)).toBe(true);
  });
  it("金幣不足／無效商品不改動任何交易狀態", () => {
    const r = new Run(fixture([], undefined, 0));
    const before = structuredClone(r.state);
    for (const index of [0, -1, 9, NaN]) expect(r.buy(index).ok).toBe(false);
    expect(r.refresh().ok).toBe(false);
    expect(r.state).toEqual(before);
  });
  it("刷新扣2，退回未購買卡，保持庫存守恆", () => {
    const r = new Run(fixture());
    r.buy(0);
    expect(r.refresh().ok).toBe(true);
    expect(r.state.economy.gold).toBe(97);
    expect(r.state.shop.slots).toHaveLength(5);
    expect(validRun(r.state)).toBe(true);
  });
  it("鎖定保留商品和 RNG，手動刷新仍可更換，解除後次回合自動刷新", () => {
    const r = new Run(fixture([owned(0, "leaf", 1, true)]));
    r.buy(0);
    r.toggleLock();
    const shop = structuredClone(r.state.shop),
      rng = r.state.rngState;
    forceRound(r);
    expect(r.nextRound().ok).toBe(true);
    expect(r.state.shop).toEqual(shop);
    expect(r.state.rngState).toBe(rng);
    r.refresh();
    expect(r.state.rngState).not.toBe(rng);
    r.toggleLock();
    const after = r.state.rngState;
    forceRound(r);
    r.nextRound();
    expect(r.state.rngState).not.toBe(after);
    expect(validRun(r.state)).toBe(true);
  });
});
describe("備戰席、升星與原子性", () => {
  it("滿席且無法合成時完全回滾（金幣、商品、卡池、ID）", () => {
    const units = characters.slice(0, 9).map((c, i) => owned(i, c.id));
    const r = new Run(fixture(units));
    const before = structuredClone(r.state);
    expect(r.buy(0).ok).toBe(false);
    expect(r.state).toEqual(before);
  });
  it("滿9格但購買後可合成時允許，優先保留棋盤位置", () => {
    const units = [
      owned(0, "flame", 1, true),
      { ...owned(1), location: { zone: "bench" as const, slot: 0 } },
      ...characters
        .slice(1, 9)
        .map((c, i) => ({
          ...owned(i + 2, c.id),
          location: { zone: "bench" as const, slot: i + 1 },
        })),
    ];
    const r = new Run(fixture(units));
    const result = r.buy(0);
    expect(result.ok).toBe(true);
    expect(r.state.units.find((u) => u.id === "p0")).toMatchObject({
      starLevel: 2,
      location: { zone: "board", cell: { x: 0, y: 4 } },
    });
    expect(r.state.units).toHaveLength(9);
    expect(ownedCopies(r.state, "flame")).toBe(3);
    expect(validRun(r.state)).toBe(true);
  });
  it("九張一星連鎖合成三星，不誤合其他角色，三星不再合成", () => {
    let r = new Run(fixture());
    for (let i = 0; i < 9; i++) {
      r = forceShop(r);
      expect(r.buy(0).ok).toBe(true);
    }
    expect(r.state.units).toHaveLength(1);
    expect(r.state.units[0].starLevel).toBe(3);
    expect(ownedCopies(r.state, "flame")).toBe(9);
    expect(validRun(r.state)).toBe(true);
    const s = fixture([owned(0, "flame", 3), owned(1, "leaf", 1)]);
    expect(mergeUnits(s)).toEqual([]);
    expect(s.units).toHaveLength(2);
  });
  it("三隻二星直接升三星，多個棋盤符合時按列、欄穩定保留", () => {
    const s = fixture([
      owned(0, "flame", 2, true),
      owned(1, "flame", 2, true),
      owned(2, "flame", 2),
    ]);
    const original = structuredClone(s.units[0].location);
    mergeUnits(s);
    expect(s.units).toHaveLength(1);
    expect(s.units[0]).toMatchObject({
      id: "p0",
      starLevel: 3,
      location: original,
    });
    expect(validRun(s)).toBe(true);
  });
  it("備戰席與棋盤部署、交換、9格容量、非法區域及等級限制", () => {
    const r = new Run(fixture([owned(0), owned(1, "leaf"), owned(2, "ember")]));
    expect(r.move("p0", { zone: "board", cell: { x: 1, y: 4 } }).ok).toBe(true);
    expect(r.move("p1", { zone: "board", cell: { x: 2, y: 4 } }).ok).toBe(true);
    expect(r.move("p2", { zone: "board", cell: { x: 3, y: 4 } }).ok).toBe(
      false,
    );
    expect(r.move("p2", { zone: "board", cell: { x: 2, y: 4 } }).ok).toBe(true);
    expect(r.state.units.find((u) => u.id === "p1")?.location).toEqual({
      zone: "bench",
      slot: 2,
    });
    expect(r.move("p0", { zone: "bench", slot: 2 }).ok).toBe(true);
    expect(r.state.units.find((u) => u.id === "p1")?.location).toEqual({
      zone: "board",
      cell: { x: 1, y: 4 },
    });
    const before = structuredClone(r.state);
    for (const cell of [
      { x: 0, y: 3 },
      { x: 7, y: 5 },
      { x: NaN, y: 6 },
    ])
      expect(r.move("p0", { zone: "board", cell }).ok).toBe(false);
    expect(r.move("p0", { zone: "bench", slot: 9 }).ok).toBe(false);
    expect(r.state).toEqual(before);
    expect(validRun(r.state)).toBe(true);
  });
  it("出售按原卡數全額退還，歸還卡池，不可重複出售", () => {
    for (const star of [1, 2, 3] as const) {
      const r = new Run(fixture([owned(0, "plume", star)]));
      const gold = r.state.economy.gold;
      expect(r.sell("p0").ok).toBe(true);
      expect(r.state.economy.gold).toBe(gold + 3 * copiesForStar(star));
      expect(r.state.pool.plume).toBe(POOL_SIZE[3]);
      expect(r.sell("p0").ok).toBe(false);
      expect(validRun(r.state)).toBe(true);
    }
  });
  it("出售最後一個上場單位後不能空隊開戰", () => {
    const r = new Run(fixture([owned(0, "leaf", 1, true)]));
    r.sell("p0");
    expect(r.beginCombat().ok).toBe(false);
  });
  it("大量買賣刷新仍保持資產守恆、ID唯一、庫存不負數", () => {
    const r = new Run(createRun(881));
    for (let i = 0; i < 400; i++) {
      const slot = r.state.shop.slots.findIndex((s) => s.characterId);
      if (slot >= 0) r.buy(slot);
      if (i % 3 === 0 && r.state.units.length) r.sell(r.state.units[0].id);
      if (i % 2 === 0) r.refresh();
      if (r.state.economy.gold < 2)
        for (const u of [...r.state.units]) r.sell(u.id);
      expect(validRun(r.state)).toBe(true);
      expect(new Set(r.state.units.map((u) => u.id)).size).toBe(
        r.state.units.length,
      );
    }
  });
});
describe("星級有效屬性與共用戰鬥", () => {
  it("HP、普攻、技能按星級計算，不污染原始資料", () => {
    const original = structuredClone(characterById.flame);
    expect(effectiveCharacter("flame", 2).maxHP).toBe(1368);
    expect(effectiveCharacter("flame", 3).attack).toBe(170);
    expect(effectiveSkill("flame", 2).power).toBe(189);
    expect(characterById.flame).toEqual(original);
  });
  it("升星治療上限、盾值、技能傷害與統計使用有效數值", () => {
    const b = new Battle([
      {
        id: "p",
        characterId: "grove",
        starLevel: 3,
        team: "player",
        x: 1,
        y: 4,
      },
      {
        id: "a",
        characterId: "ember",
        starLevel: 2,
        team: "player",
        x: 2,
        y: 4,
      },
      { id: "e", characterId: "oak", team: "enemy", x: 2, y: 3 },
    ]);
    const [healer, ally, enemy] = b.units;
    ally.hp = 1;
    cast(b, healer);
    expect(ally.hp).toBeCloseTo(1 + skills.grove.power * 1.8);
    b.heal(healer, ally, 99999);
    expect(ally.hp).toBe(effectiveCharacter("ember", 2).maxHP);
    cast(b, ally);
    expect(ally.shield).toBeCloseTo(skills.ember.power * 1.35);
    b.hit(healer, enemy, 100);
    expect(healer.damage).toBe(enemy.data.maxHP - enemy.hp);
  });
  it("二星普攻強化、護甲與攻速技能也使用升星強度", () => {
    const b = new Battle([
      {
        id: "p",
        characterId: "flame",
        starLevel: 2,
        team: "player",
        x: 3,
        y: 4,
      },
      { id: "e", characterId: "oak", starLevel: 3, team: "enemy", x: 3, y: 3 },
    ]);
    const [p, e] = b.units;
    p.mana = 100;
    b.advance(0.05);
    const expected = Math.round(((111 + 189) * 100) / (100 + 58));
    expect(p.damage).toBe(expected);
    expect(e.hp).toBe(e.data.maxHP - expected);
  });
});
describe("經濟、等級與回合狀態機", () => {
  it("利息邊界上限與連勝連敗級距", () => {
    expect([0, 9, 10, 19, 20, 49, 50, 999].map(interest)).toEqual([
      0, 0, 1, 1, 2, 4, 5, 5,
    ]);
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(streakIncome)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3,
    ]);
  });
  it("收入先算舊金幣、更新連勝後再獎勵，平局重設", () => {
    const r = new Run(fixture([owned(0, "flame", 1, true)], undefined, 19));
    forceRound(r);
    expect(r.state.economy.lastIncome).toEqual({
      base: 3,
      interest: 1,
      streak: 0,
      special: 0,
      total: 4,
    });
    expect(r.state.economy.gold).toBe(23);
    r.nextRound();
    forceRound(r);
    expect(r.state.economy.lastIncome?.streak).toBe(1);
    expect(r.state.economy.lastIncome?.base).toBe(4);
    r.nextRound();
    forceRound(r, "enemy");
    expect(r.state.economy.wins).toBe(0);
    expect(r.state.economy.losses).toBe(1);
    r.nextRound();
    forceRound(r, "enemy");
    expect(r.state.economy.lastIncome?.streak).toBe(1);
    r.nextRound();
    const hp = r.state.player.hp;
    forceRound(r, "draw");
    expect(r.state.player.hp).toBe(hp - 2);
    expect(r.state.economy.wins + r.state.economy.losses).toBe(0);
  });
  it("XP門檻、超額、多等級跨越、滿級、扣款與上場限制提高", () => {
    const r = new Run(fixture([], undefined, 10));
    expect(r.buyXP().ok).toBe(true);
    expect(r.state.economy.gold).toBe(6);
    expect(r.state.player).toMatchObject({ level: 3, xp: 2 });
    const s = structuredClone(r.state);
    addXP(s, 1000);
    expect(s.player).toMatchObject({ level: 9, xp: 0 });
    const max = new Run(s);
    expect(max.buyXP().ok).toBe(false);
    expect(max.state.economy.gold).toBe(6);
    for (let lv = 2; lv <= 8; lv++) {
      const state = createRun(1);
      state.player.level = lv;
      addXP(state, XP_REQUIRED[lv]);
      expect(state.player.level).toBe(lv + 1);
      expect(state.player.xp).toBe(0);
    }
  });
  it("所有經營操作在戰鬥與結算階段被禁止，獎勵只發一次", () => {
    const r = new Run(fixture([owned(0, "flame", 1, true)]));
    expect(r.beginCombat().ok).toBe(true);
    const before = structuredClone(r.state);
    expect(r.buy(0).ok).toBe(false);
    expect(r.refresh().ok).toBe(false);
    expect(r.buyXP().ok).toBe(false);
    expect(r.toggleLock().ok).toBe(false);
    expect(r.sell("p0").ok).toBe(false);
    expect(r.move("p0", { zone: "bench", slot: 0 }).ok).toBe(false);
    expect(r.nextRound().ok).toBe(false);
    expect(r.settle().ok).toBe(false);
    expect(r.state).toEqual(before);
    r.battle!.units.filter((u) => u.team === "enemy").forEach(
      (u) => (u.hp = 0),
    );
    r.battle!.advance(0.05);
    expect(r.settle().ok).toBe(true);
    const settled = structuredClone(r.state);
    for (let i = 0; i < 5; i++) expect(r.settle().ok).toBe(false);
    expect(r.buy(1).ok).toBe(false);
    expect(r.state).toEqual(settled);
    expect(r.nextRound().ok).toBe(true);
    expect(r.nextRound().ok).toBe(false);
  });
  it("10回合推進與最終統計、資料成長及全新旅程隔離", () => {
    const r = new Run(fixture([owned(0, "flame", 1, true)]));
    for (let round = 1; round <= 10; round++) {
      expect(r.state.round.number).toBe(round);
      forceRound(r);
      expect(validRun(r.state)).toBe(true);
      if (round < 10) {
        expect(r.state.round.phase).toBe("settlement");
        r.nextRound();
        expect(r.battle).toBeNull();
      }
    }
    expect(r.state.round.phase).toBe("completed");
    expect(r.state.stats.completedRounds).toBe(10);
    expect(r.state.stats.highestWinStreak).toBe(10);
    expect(r.nextRound().ok).toBe(false);
    expect(createRun(1).stats.completedRounds).toBe(0);
    let lastPower = 0;
    for (let round = 1; round <= 10; round++) {
      const power = roundEnemies(round).reduce(
        (n, p) =>
          n +
          effectiveCharacter(p.characterId, p.starLevel).maxHP +
          effectiveCharacter(p.characterId, p.starLevel).attack * 10,
        0,
      );
      expect(power).toBeGreaterThanOrEqual(lastPower);
      lastPower = power;
      expect(rounds[round - 1].enemies.length).toBeLessThanOrEqual(9);
    }
  });
  it("第6回合失敗扣2+2+敵存活，HP歸零立即結束", () => {
    const s = fixture([owned(0, "flame", 1, true)]);
    const r = new Run(s);
    for (let i = 1; i <= 5; i++) {
      forceRound(r);
      r.nextRound();
    }
    const before = r.state.player.hp;
    forceRound(r, "enemy");
    expect(r.state.player.hp).toBe(before - 4 - roundEnemies(6).length);
    const low = structuredClone(r.state);
    r.nextRound();
    const state = structuredClone(r.state);
    state.player.hp = 1;
    const dying = new Run(state);
    forceRound(dying, "enemy");
    expect(dying.state.player.hp).toBe(0);
    expect(dying.state.round.phase).toBe("gameOver");
    expect(validRun(dying.state)).toBe(true);
    expect(dying.nextRound().ok).toBe(false);
    expect(low.player.hp).toBeGreaterThan(0);
  });
  it("完整十回合真正戰鬥，在4倍速度有限結束且無上場資料污染", () => {
    const units = [owned(0, "flame", 3, true), owned(1, "leaf", 3, true)];
    const r = new Run(fixture(units));
    for (let i = 1; i <= 10; i++) {
      const team = structuredClone(r.state.units);
      expect(r.beginCombat().ok).toBe(true);
      r.battle!.speed = 4;
      for (let j = 0; j < 301 && !r.battle!.result; j++)
        r.battle!.advance(0.05);
      expect(r.battle!.result).not.toBeNull();
      expect(r.settle().ok).toBe(true);
      expect(r.state.units).toEqual(team);
      expect(validRun(r.state)).toBe(true);
      expect(r.state.player.hp).toBeGreaterThan(0);
      if (i < 10) r.nextRound();
    }
    expect(r.state.round.phase).toBe("completed");
    expect(r.state.stats.totalDamage).toBeGreaterThan(0);
  });
});
describe("存檔與恢復", () => {
  it("完整 JSON 往返、池／隨機／商店鎖定及下一抽一致", () => {
    const r = new Run(fixture([owned(0, "leaf", 1, true)]));
    r.buy(0);
    r.toggleLock();
    const loaded = decodeSave(encodeSave(r.state));
    expect(loaded.status).toBe("loaded");
    if (loaded.status !== "loaded") throw Error();
    expect(loaded.state).toEqual(r.state);
    const next = new Run(loaded.state);
    r.refresh();
    next.refresh();
    expect(next.state).toEqual(r.state);
  });
  it("戰鬥存為開戰前準備，購買部署保留，重播不複製收入", () => {
    const r = new Run(fixture([owned(0, "leaf", 1, true)]));
    r.buy(0);
    r.beginCombat();
    r.battle!.advance(1);
    const loaded = decodeSave(encodeSave(r.state));
    if (loaded.status !== "loaded") throw Error();
    expect(loaded.state.round.phase).toBe("preparation");
    expect(loaded.state.units).toEqual(r.state.units);
    expect(loaded.state.economy.gold).toBe(r.state.economy.gold);
    const replay = new Run(loaded.state);
    forceRound(replay);
    const after = decodeSave(encodeSave(replay.state));
    if (after.status !== "loaded") throw Error();
    const resumed = new Run(after.state);
    expect(resumed.state.round.phase).toBe("settlement");
    const before = structuredClone(resumed.state);
    expect(resumed.settle().ok).toBe(false);
    expect(resumed.state).toEqual(before);
    expect(resumed.nextRound().ok).toBe(true);
  });
  it("損壞、版本不相容、無效數值／ID／卡池／格位／階段都安全拒絕", () => {
    expect(decodeSave(null).status).toBe("empty");
    expect(decodeSave("{").status).toBe("invalid");
    expect(decodeSave('{"version":1}').status).toBe("incompatible");
    const good = fixture([owned(0)]);
    const changes: ((s: RunState) => void)[] = [
      (s) => (s.economy.gold = -1),
      (s) => (s.player.level = 99),
      (s) => (s.player.xp = 999),
      (s) => s.units.push(structuredClone(s.units[0])),
      (s) => s.pool.flame++,
      (s) => (s.units[0].starLevel = 4 as UnitStarLevel),
      (s) => (s.units[0].location = { zone: "bench", slot: 9 }),
      (s) => (s.round.phase = "completed"),
      (s) => (s.shop.slots = []),
      (s) => (s.rngState = -1),
      (s) => (s.nextUnitId = 0),
      (s) => (s.player.hp = 0),
      (s) => (s.round.settledThrough = 1),
    ];
    for (const change of changes) {
      const s = structuredClone(good);
      change(s);
      expect(decodeSave(JSON.stringify({ version: 2, run: s })).status).toBe(
        "invalid",
      );
    }
  });
  it("儲存失敗不丟例外；重新開始覆寫舊進度", () => {
    const storage = new MemoryStorage(),
      r = new Run(fixture());
    saveRun(storage, r.state);
    r.buy(0);
    saveRun(storage, r.state);
    expect(loadRun(storage).status).toBe("loaded");
    saveRun(storage, createRun(99));
    const loaded = loadRun(storage);
    if (loaded.status !== "loaded") throw Error();
    expect(loaded.state.units).toHaveLength(0);
    expect(loaded.state.economy.gold).toBe(10);
    const broken = {
      getItem() {
        throw Error();
      },
      setItem() {
        throw Error();
      },
      removeItem() {
        throw Error();
      },
    };
    expect(saveRun(broken, r.state)).toBe(false);
    expect(loadRun(broken).status).toBe("unavailable");
    expect(storage.data[SAVE_KEY]).toBeDefined();
  });
});
describe("補充資產與數值邊界", () => {
  it("三個三星維持三星，無法再合成或複製卡片", () => {
    const s = fixture([
      owned(0, "flame", 3),
      owned(1, "flame", 3),
      owned(2, "flame", 3),
    ]);
    expect(mergeUnits(s)).toEqual([]);
    expect(s.units.map((u) => u.starLevel)).toEqual([3, 3, 3]);
    expect(ownedCopies(s, "flame")).toBe(27);
    expect(validRun(s)).toBe(true);
  });
  it("滿席時可跨區交換，但移回無空格時安全拒絕", () => {
    const units = [
      owned(0, "flame", 1, true),
      ...characters
        .slice(1, 10)
        .map((c, i) => ({
          ...owned(i + 1, c.id),
          location: { zone: "bench" as const, slot: i },
        })),
    ];
    const r = new Run(fixture(units));
    const before = structuredClone(r.state);
    expect(r.toBench("p0").ok).toBe(false);
    expect(r.state).toEqual(before);
    expect(r.move("p0", { zone: "bench", slot: 8 }).ok).toBe(true);
    expect(boardPlacements(r.state)[0].id).toBe("p9");
    expect(validRun(r.state)).toBe(true);
  });
  it("安全整數溢位也會回滾，非法原型名稱不能成為角色", () => {
    const r = new Run(fixture([owned(0)], undefined, Number.MAX_SAFE_INTEGER));
    const before = structuredClone(r.state);
    expect(r.sell("p0").ok).toBe(false);
    expect(r.state).toEqual(before);
    const state = fixture([owned(0)]);
    state.units[0].characterId = "constructor";
    state.pool.flame++;
    expect(validRun(state)).toBe(false);
    state.units[0].characterId = "__proto__";
    expect(validRun(state)).toBe(false);
    expect(() => effectiveCharacter("constructor")).toThrow();
  });
  it("角色血量及普攻成長涵蓋所有角色星級，原始技能不受改寫", () => {
    for (const c of characters)
      for (const star of [1, 2, 3] as const) {
        const base = structuredClone(c),
          skill = structuredClone(skills[c.skillId]),
          effective = effectiveCharacter(c.id, star);
        expect(effective.maxHP).toBe(
          Math.round(c.maxHP * [1, 1.8, 3.2][star - 1]),
        );
        expect(effective.attack).toBe(
          Math.round(c.attack * [1, 1.5, 2.3][star - 1]),
        );
        expect(effectiveSkill(c.skillId, star).power).toBeCloseTo(
          skill.power * [1, 1.35, 1.8][star - 1],
        );
        expect(c).toEqual(base);
        expect(skills[c.skillId]).toEqual(skill);
      }
  });
  it("重新開始覆寫已結算旅程後，回合與商店回到初始狀態", () => {
    const r = new Run(fixture([owned(0, "leaf", 1, true)]));
    forceRound(r);
    const storage = new MemoryStorage();
    saveRun(storage, r.state);
    saveRun(storage, createRun(43));
    const restored = loadRun(storage);
    if (restored.status !== "loaded") throw Error();
    expect(restored.state.round).toEqual({
      number: 1,
      phase: "preparation",
      settledThrough: 0,
      lastResult: null,
    });
    expect(restored.state.economy).toMatchObject({
      gold: 10,
      wins: 0,
      losses: 0,
      lastIncome: null,
    });
    expect(restored.state.units).toEqual([]);
    expect(validRun(restored.state)).toBe(true);
  });
});
describe("等級上限與星級技能回歸", () => {
  it("Lv.9 可部署九名，額外備戰席仍可保存，敵方支援九名", () => {
    const state = fixture(characters.slice(0, 9).map((c, i) => owned(i, c.id)));
    state.player.level = 9;
    const r = new Run(state);
    for (let i = 0; i < 9; i++)
      expect(
        r.move(`p${i}`, {
          zone: "board",
          cell: { x: i % 7, y: 4 + Math.floor(i / 7) },
        }).ok,
      ).toBe(true);
    expect(boardPlacements(r.state)).toHaveLength(9);
    const enemy = characters
      .slice(0, 9)
      .map((c, i) => ({
        id: `e${i}`,
        characterId: c.id,
        team: "enemy" as const,
        x: i % 7,
        y: Math.floor(i / 7),
      }));
    const b = new Battle([...boardPlacements(r.state), ...enemy]);
    b.speed = 4;
    for (let i = 0; i < 301 && !b.result; i++) b.advance(0.05);
    expect(b.result).not.toBeNull();
    expect(b.units).toHaveLength(18);
    expect(validRun(r.state)).toBe(true);
  });
  it("三星古樹防禦與翠葉攻速增益使用放大後技能效果", () => {
    const placements = [
      {
        id: "p",
        characterId: "leaf",
        starLevel: 3 as const,
        team: "player" as const,
        x: 3,
        y: 4,
      },
      {
        id: "e",
        characterId: "oak",
        starLevel: 3 as const,
        team: "enemy" as const,
        x: 3,
        y: 3,
      },
    ];
    const b = new Battle(placements),
      [p, e] = b.units;
    e.mana = 100;
    p.mana = 100;
    b.advance(0.05);
    expect(e.buff).toBe("armor");
    expect(p.buff).toBe("haste");
    expect(p.attackTimer).toBeCloseTo(1 / (1.1 * (1 + 0.65 * 1.8)));
    expect(p.damage).toBe(
      Math.round((p.data.attack * 100) / (100 + 58 + 80 * 1.8)),
    );
  });
});
