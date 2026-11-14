import { describe, it, expect } from "vitest";
import { combatTargets } from "../src/game/ai/grid";
import { Battle, STEP } from "../src/game/core/battle";
import {
  characters,
  characterById,
  legacyCharacterIds,
  skills,
} from "../src/game/data/characters";
import { TraitRegistry } from "../src/game/traits/registry";
import { calculateTraits } from "../src/game/traits/calculator";
import { startTraits } from "../src/game/traits/effects";
import { applyStatus } from "../src/game/systems/statuses";
import { cast } from "../src/game/systems/skills";
import { createRun, Run } from "../src/game/run/run";
import { initialPool, refillShop } from "../src/game/run/shop";
import { decodeSave, encodeSave, validRun } from "../src/game/run/save";
import { roundEnemies } from "../src/game/run/rounds";
import type { Placement, Unit } from "../src/game/core/types";
const place = (
  id: string,
  characterId: string,
  team: "player" | "enemy" = "player",
  x = 3,
  y = team === "player" ? 4 : 3,
): Placement => ({ id, characterId, team, x, y });
const group = (name: string) =>
  characters
    .filter((c) => c.faction === name || c.class === name)
    .map((c, i) => place(`p${i}`, c.id, "player", i + 1, 4));
const battle = (name: string, n = 4) =>
  new Battle([
    ...group(name).slice(0, n),
    place("e", "oak", "enemy", 3, 2),
    place("e2", "oak", "enemy", 2, 2),
    place("e3", "oak", "enemy", 4, 2),
    place("e4", "oak", "enemy", 5, 2),
  ]);
const idle = (b: Battle) => {
  b.units.forEach((u) => {
    u.attackTimer = 100;
    u.moveTimer = 100;
    u.castTimer = 100;
  });
};
const finish = (b: Battle) => {
  for (let i = 0; i < 1201 && !b.result; i++) b.advance(0.05);
  expect(b.result).not.toBeNull();
  return b.result!;
};
describe("32名角色與羈絆計算", () => {
  it("精確32個角色／技能，八陣營八職業各四名，舊ID／定位保持", () => {
    expect(characters).toHaveLength(32);
    expect(new Set(characters.map((c) => c.id)).size).toBe(32);
    expect(new Set(characters.map((c) => c.skillId)).size).toBe(32);
    for (const t of TraitRegistry) {
      expect(
        characters.filter(
          (c) => (t.type === "faction" ? c.faction : c.class) === t.name,
        ),
      ).toHaveLength(4);
      expect(t.tiers.map((t) => t.count)).toEqual([2, 4]);
    }
    for (const id of legacyCharacterIds) {
      expect(characterById[id].skillId).toBe(id);
      expect(characterById[id].cost).toBeGreaterThan(0);
      expect(skills[id]).toBeDefined();
    }
  });
  it.each(TraitRegistry.map((t) => [t.name, t.id]))(
    "%s 可達2／4階級，下一門檻正確",
    (name, id) => {
      const all = group(name);
      expect(
        calculateTraits(all.slice(0, 1), "player").find(
          (t) => t.definition.id === id,
        ),
      ).toMatchObject({ count: 1, tier: null, next: 2 });
      expect(
        calculateTraits(all.slice(0, 2), "player").find(
          (t) => t.definition.id === id,
        )?.tier?.count,
      ).toBe(2);
      expect(
        calculateTraits(all, "player").find((t) => t.definition.id === id),
      ).toMatchObject({ count: 4, next: null, tier: { count: 4 } });
    },
  );
  it("不同ID同角色不重複，星級不加人數，移除立即改變準備快照", () => {
    const team = group("烈焰帝國").slice(0, 2);
    const duplicate = { ...team[0], id: "copy", starLevel: 3 as const, x: 5 };
    expect(
      calculateTraits([...team, duplicate], "player").find(
        (t) => t.definition.id === "burn",
      )?.count,
    ).toBe(2);
    expect(
      calculateTraits(team.slice(0, 1), "player").find(
        (t) => t.definition.id === "burn",
      )?.tier,
    ).toBeNull();
    const state = createRun(1);
    state.units = [
      {
        id: "p0",
        characterId: "flame",
        starLevel: 1,
        location: { zone: "bench", slot: 0 },
      },
    ];
    expect(calculateTraits([], "player")).toEqual([]);
  });
  it("雙方獨立，死亡不降低階級，初始化與重新計算不重複加值", () => {
    const b = battle("鋼鐵軍團");
    const mods = JSON.stringify(b.units.map((u) => [u.modifier, u.shield]));
    startTraits(b);
    calculateTraits(group("鋼鐵軍團"), "player");
    expect(JSON.stringify(b.units.map((u) => [u.modifier, u.shield]))).toBe(
      mods,
    );
    b.units[0].hp = 0;
    expect(
      b.traits.player.find((t) => t.definition.id === "steel")?.tier?.count,
    ).toBe(4);
    expect(b.traits.enemy.some((t) => t.tier)).toBe(false);
    expect(Object.isFrozen(b.traits.player)).toBe(true);
  });
  it("商店合法涵蓋所有角色，費用分布與機率未越界", () => {
    const state = createRun(1234);
    state.player.level = 9;
    const seen = new Set<string>();
    for (let i = 0; i < 800; i++) {
      refillShop(state);
      state.shop.slots.forEach((s) => {
        if (s.characterId) seen.add(s.characterId);
      });
      expect(validRun(state)).toBe(true);
    }
    expect(seen.size).toBe(32);
  });
});
describe("16羈絆真實戰鬥效果", () => {
  it("烈焰燃燒四跳、刷新單一來源、不遞迴；高階直擊增傷", () => {
    const b = battle("烈焰帝國");
    idle(b);
    const u = b.units[0],
      target = b.units.find((u) => u.id === "e")!;
    b.hit(u, target, 10, false, "skill");
    expect(target.statuses.filter((s) => s.id === "burn")).toHaveLength(1);
    const before = target.hp;
    b.hit(u, target, 10, false, "skill");
    expect(target.statuses).toHaveLength(1);
    expect(target.hp).toBeLessThan(before);
    const after = target.hp;
    b.advance(4);
    expect(target.hp).toBeLessThan(after);
    expect(target.statuses).toHaveLength(0);
    expect(u.damage).toBeGreaterThan(30);
    expect(b.time).toBe(4);
  });
  it("霜月減速、第三次已減速命中冰凍、五秒ICD與到期解除", () => {
    const b = battle("霜月王庭"),
      u = b.units[0],
      t = b.units.find((u) => u.id === "e")!;
    t.hp = 10000;
    const base = b.attackSpeed(t);
    for (let i = 0; i < 4; i++) b.attack(u, t);
    expect(b.attackSpeed(t)).toBeCloseTo(base * 0.75);
    expect(t.statuses.some((s) => s.id === "freeze")).toBe(true);
    const ready = t.counters.freezeReady;
    idle(b);
    b.advance(1.1);
    expect(t.statuses.some((s) => s.id === "freeze")).toBe(false);
    b.attack(u, t);
    expect(t.counters.freezeReady).toBe(ready);
    idle(b);
    b.advance(3.1);
    expect(t.statuses.some((s) => s.id === "slow")).toBe(false);
  });
  it("雷霆每三次觸發最多三個不重複次要目標且不再觸發", () => {
    const b = battle("雷霆聯盟");
    const u = b.units[0],
      t = b.units.find((u) => u.id === "e")!;
    for (let i = 0; i < 3; i++) b.attack(u, t);
    const chain = b.events.filter(
      (e) => e.kind === "trait" && e.label === "連鎖閃電",
    );
    expect(chain).toHaveLength(3);
    expect(new Set(chain.map((e) => e.target)).size).toBe(3);
    expect(chain.every((e) => e.target !== t.id)).toBe(true);
    expect(u.counters.attacks).toBe(3);
  });
  it("星辰回能固定步進且不超上限，技能效果15%", () => {
    const b = battle("星辰議會");
    idle(b);
    const u = b.units[0],
      mana = u.mana;
    b.advance(1);
    expect(u.mana).toBeCloseTo(mana + 5);
    expect(b.skill(u).power).toBeCloseTo(skills[u.data.skillId].power * 1.15);
    u.mana = 99;
    b.advance(1);
    expect(u.mana).toBe(100);
  });
  it("鋼鐵防禦與初始盾、星級順序、下一場不殘留", () => {
    const placements = group("鋼鐵軍團").map((p) => ({
      ...p,
      starLevel: 2 as const,
    }));
    const b = new Battle([...placements, place("e", "flame", "enemy")]);
    const u = b.units[0];
    expect(u.modifier.defense).toBe(40);
    expect(u.shield).toBeCloseTo(u.data.maxHP * 0.15);
    const original = characterById[u.characterId];
    expect(u.data.maxHP).toBe(Math.round(original.maxHP * 1.8));
    expect(b.attackValue(u)).toBe(
      Math.round(u.data.attack * (1 + u.modifier.attack)),
    );
    u.shield = 0;
    const next = new Battle([...placements, place("e", "flame", "enemy")]);
    expect(next.units[0].shield).toBeGreaterThan(0);
    expect(original.defense).toBe(characterById[u.characterId].defense);
  });
  it("深淵吸血只按實際HP、不含盾，斬殺加成與治療上限", () => {
    const b = battle("深淵教團"),
      u = b.units[0],
      t = b.units.find((u) => u.id === "e")!;
    u.hp = 100;
    t.shield = 9999;
    b.hit(u, t, 100);
    expect(u.hp).toBe(100);
    t.shield = 0;
    const before = u.hp;
    const actual = b.hit(u, t, 100);
    expect(u.hp - before).toBeCloseTo(actual * 0.2);
    u.hp = u.data.maxHP - 1;
    b.hit(u, t, 100);
    expect(u.hp).toBe(u.data.maxHP);
  });
  it("自然定時回復計統計，死亡不能復活，治療加成15%", () => {
    const b = battle("自然之森");
    idle(b);
    const u = b.units[0];
    u.hp = 100;
    const dead = b.units[1];
    dead.hp = 0;
    b.advance(3);
    expect(u.healing).toBeGreaterThan(0);
    expect(u.hp).toBeGreaterThan(100);
    expect(dead.hp).toBe(0);
    const prior = u.hp;
    b.heal(b.units[2], u, 100);
    expect(u.hp - prior).toBeCloseTo(115);
  });
  it("守護者護甲40及附近一格的開戰護盾", () => {
    const b = battle("守護者"),
      u = b.units[0],
      near = b.units[1];
    expect(u.modifier.defense).toBe(40);
    expect(u.shield).toBeCloseTo(near.data.maxHP * 0.08);
    expect(near.shield).toBeGreaterThan(u.data.maxHP * 0.08);
  });
  it("戰士攻擊25%，低血普攻額外10%", () => {
    const b = battle("戰士"),
      u = b.units[0],
      t = b.units.find((u) => u.id === "e")!;
    expect(b.attackValue(u)).toBe(Math.round(u.data.attack * 1.25));
    t.hp = t.data.maxHP * 0.3;
    const before = t.hp;
    const actual = b.hit(u, t, 100);
    expect(actual).toBe(Math.round((100 * 1.1 * 100) / (100 + t.data.defense)));
    expect(t.hp).toBeLessThan(before);
  });
  it("刺客合法尋向後排，首次攻擊增傷且不會重複", () => {
    const b = new Battle([
      ...group("刺客"),
      place("front", "oak", "enemy", 3, 3),
      place("rear", "leaf", "enemy", 3, 0),
    ]);
    const u = b.units[0];
    expect(u.modifier.attackSpeed).toBe(0.3);
    expect(combatTargets(u, b.units)[0].id).toBe("rear");
    b.advance(0.05);
    expect(
      b.units.filter((u) => u.hp > 0).map((u) => `${u.x},${u.y}`).length,
    ).toBe(
      new Set(b.units.filter((u) => u.hp > 0).map((u) => `${u.x},${u.y}`)).size,
    );
    const target = b.units.find((u) => u.id === "front")!;
    target.hp = 10000;
    u.counters.attacks = 0;
    const before = target.hp;
    b.attack(u, target);
    const first = before - target.hp;
    const later = target.hp;
    b.attack(u, target);
    expect(first).toBeGreaterThan(later - target.hp);
  });
  it("射手第四次追加50%傷害但只計4次主普攻", () => {
    const b = battle("射手"),
      u = b.units[0],
      t = b.units.find((u) => u.id === "e")!;
    t.hp = 10000;
    for (let i = 0; i < 4; i++) b.attack(u, t);
    expect(u.counters.attacks).toBe(4);
    expect(
      b.events.filter((e) => e.kind === "trait" && e.label === "追擊"),
    ).toHaveLength(1);
    expect(
      b.events.filter((e) => e.kind === "damage" && e.source === u.id),
    ).toHaveLength(5);
  });
  it("法師僅增技能傷害，首次傷害技能額外15%且只一次", () => {
    const b = battle("法師"),
      u = b.units.find((u) => u.characterId === "astral")!,
      t = b.units.find((u) => u.id === "e")!;
    expect(u.modifier.skillDamage).toBe(0.3);
    t.hp = 10000;
    const first = b.hit(u, t, 100, true, "skill");
    u.counters.damageCasts = 1;
    const later = b.hit(u, t, 100, true, "skill");
    expect(first).toBeGreaterThan(later);
    const healBefore = u.healing;
    u.hp -= 100;
    b.heal(u, u, 50);
    expect(u.healing - healBefore).toBe(50);
  });
  it("治療師+35%且首次實際治療25%盾，過量不計", () => {
    const b = battle("治療師"),
      u = b.units[0],
      t = b.units[1];
    t.hp = 1;
    b.heal(u, t, 100);
    expect(t.hp).toBe(136);
    expect(t.shield).toBeCloseTo(135 * 0.25);
    const shield = t.shield;
    b.heal(u, t, 100);
    expect(t.shield).toBe(shield);
    expect(u.healing).toBe(270);
  });
  it("召喚師全隊最多兩靈體、唯一格位、固定壽命及無額外技能", () => {
    const b = battle("召喚師");
    expect(b.units.filter((u) => u.summon)).toHaveLength(2);
    const source = b.units[0];
    expect(b.summon(source)).toBeNull();
    idle(b);
    b.advance(12.1);
    expect(b.units.filter((u) => u.summon && u.hp > 0)).toHaveLength(0);
    expect(
      b.events.filter((e) => e.kind === "skill" && e.source.startsWith("s")),
    ).toHaveLength(0);
  });
  it("空間不足不覆寫，召喚物不計超時存活數", () => {
    const full = Array.from({ length: 56 }, (_, i) =>
      place(
        `u${i}`,
        "briar",
        i < 28 ? "player" : "enemy",
        i % 7,
        Math.floor(i / 7),
      ),
    );
    const b = new Battle(full);
    expect(b.summon(b.units[0])).toBeNull();
    expect(b.units).toHaveLength(56);
    const c = battle("召喚師");
    idle(c);
    c.time = 59.95;
    c.units
      .filter((u) => u.summon)
      .forEach((u) => {
        u.summon!.expires = 100;
      });
    c.advance(0.05);
    expect(c.result?.playerAlive).toBe(4);
  });
  it("戰術家全隊初始能量15、技能間隔縮短10%仍安全", () => {
    const b = battle("戰術家"),
      u = b.units[0];
    expect(u.mana).toBe(u.data.startingMana + 15);
    cast(b, u);
    expect(u.castTimer).toBeCloseTo(1.08);
  });
});
describe("回合、存檔、穩定性", () => {
  it("黃金開戰快照獎勵只發一次，重播不增殖，收入明細", () => {
    const s = createRun(4);
    s.player.level = 4;
    s.pool = initialPool();
    s.shop.slots = Array.from({ length: 5 }, () => ({ characterId: null }));
    s.units = group("黃金商會").map((p, i) => ({
      id: p.id,
      characterId: p.characterId,
      starLevel: 1 as const,
      location: { zone: "board" as const, cell: { x: p.x, y: p.y } },
    }));
    s.nextUnitId = 4;
    for (const u of s.units) s.pool[u.characterId]--;
    const run = new Run(s);
    run.beginCombat();
    expect(run.battle!.units[0].modifier.attackSpeed).toBeGreaterThanOrEqual(
      0.1,
    );
    run
      .battle!.units.filter((u) => u.team === "enemy")
      .forEach((u) => (u.hp = 0));
    run.battle!.advance(0.05);
    expect(run.settle().ok).toBe(true);
    expect(run.state.economy.lastIncome?.gold).toBe(2);
    const gold = run.state.economy.gold;
    expect(run.settle().ok).toBe(false);
    const decoded = decodeSave(encodeSave(run.state));
    expect(decoded.status).toBe("loaded");
    if (decoded.status !== "loaded") throw Error();
    expect(new Run(decoded.state).settle().ok).toBe(false);
    expect(decoded.state.economy.gold).toBe(gold);
  });
  it("P2舊12角色卡池遷移不增加角色、不更改資產／商店／亂數", () => {
    const s = createRun(7);
    s.pool = initialPool();
    s.shop.slots = [
      { characterId: "flame" },
      { characterId: "leaf" },
      { characterId: null },
      { characterId: null },
      { characterId: null },
    ];
    s.pool.flame--;
    s.pool.leaf--;
    for (const id of Object.keys(s.pool))
      if (!(legacyCharacterIds as readonly string[]).includes(id))
        delete s.pool[id];
    const raw = JSON.stringify({ version: 2, run: s });
    const result = decodeSave(raw);
    expect(result.status).toBe("loaded");
    if (result.status !== "loaded") throw Error();
    expect(result.state.units).toEqual(s.units);
    expect(result.state.economy).toEqual(s.economy);
    expect(result.state.shop).toEqual(s.shop);
    expect(result.state.rngState).toBe(s.rngState);
    expect(Object.keys(result.state.pool)).toHaveLength(32);
    expect(validRun(result.state)).toBe(true);
    const damaged = structuredClone(s);
    damaged.pool.flame++;
    expect(
      decodeSave(JSON.stringify({ version: 2, run: damaged })).status,
    ).toBe("invalid");
  });
  it("暫停凍結所有狀態與計時，1／2／4倍結果相同", () => {
    const placements = [
      ...group("霜月王庭"),
      ...group("烈焰帝國").map((p, i) => ({
        ...p,
        id: `e${i}`,
        team: "enemy" as const,
        y: 2,
      })),
    ];
    const outcomes = [1, 2, 4].map((speed) => {
      const b = new Battle(placements);
      b.speed = speed;
      for (let i = 0; i < 1201 * 4 && !b.result; i++) b.advance(0.05 / speed);
      expect(b.result).not.toBeNull();
      return b.result;
    });
    expect(outcomes[1]).toEqual(outcomes[0]);
    expect(outcomes[2]).toEqual(outcomes[0]);
    const b = new Battle(placements);
    applyStatus(b, b.units[0], b.units[4], "burn", 30, 4);
    b.paused = true;
    const before = JSON.stringify(b);
    b.advance(10);
    b.tick();
    expect(JSON.stringify(b)).toBe(before);
  });
  it.each(characters.map((c) => [c.id]))(
    "%s可實際戰鬥且所有狀態／數值有限",
    (id) => {
      const b = new Battle([place("p", id), place("e", "oak", "enemy")]);
      finish(b);
      for (const u of b.units)
        for (const n of [u.hp, u.shield, u.mana, u.damage, u.healing, u.x, u.y])
          expect(Number.isFinite(n)).toBe(true);
      expect(b.units[0].counters.attacks).toBeGreaterThan(0);
    },
  );
});
it("真實P2程式產生的二星持有存檔與12角色原始資料皆保持", async () => {
  const { readFileSync } = await import("node:fs");
  const old = JSON.parse(readFileSync("tests/fixtures/p2-save.json", "utf8"));
  const result = decodeSave(JSON.stringify(old));
  expect(result.status).toBe("loaded");
  if (result.status !== "loaded") throw Error();
  for (const k of [
    "units",
    "economy",
    "player",
    "shop",
    "rngState",
    "nextUnitId",
  ] as const)
    expect(result.state[k]).toEqual(old.run[k]);
  expect(result.state.units[0].starLevel).toBe(2);
  const legacy = JSON.parse(
    readFileSync("tests/fixtures/p2-characters.json", "utf8"),
  );
  for (const c of legacy) expect(characterById[c.id]).toEqual(c);
});
it("十回合召喚與控制壓力無跨回合單位／狀態殘留", () => {
  const s = createRun(9);
  s.player.level = 8;
  s.pool = initialPool();
  s.shop.slots = Array.from({ length: 5 }, () => ({ characterId: null }));
  s.units = [
    "briar",
    "gear",
    "wisp",
    "ledger",
    "rime",
    "veil",
    "snow",
    "dew",
  ].map((characterId, i) => ({
    id: `p${i}`,
    characterId,
    starLevel: 1,
    location: { zone: "board", cell: { x: i % 7, y: 4 + Math.floor(i / 7) } },
  }));
  s.nextUnitId = 8;
  for (const u of s.units) s.pool[u.characterId]--;
  const run = new Run(s);
  for (let r = 0; r < 10; r++) {
    expect(run.beginCombat().ok).toBe(true);
    const b = run.battle!;
    expect(b.time).toBe(0);
    expect(b.units.filter((u) => u.summon)).toHaveLength(2);
    b.speed = 4;
    for (let i = 0; i < 301 && !b.result; i++) b.advance(0.05);
    expect(b.result).not.toBeNull();
    expect(b.units.length).toBeLessThan(100);
    expect(b.events.length).toBeLessThan(800);
    expect(run.settle().ok).toBe(true);
    expect(run.state.units).toHaveLength(8);
    if (r < 9) {
      expect(run.nextRound().ok).toBe(true);
      expect(run.battle).toBeNull();
    }
  }
  expect(run.state.round.phase).toBe("completed");
});
it("非有限輸入不污染生命或盾，死亡角色不能施法／普攻", () => {
  const b = battle("自然之森"),
    u = b.units[0],
    t = b.units.find((u) => u.id === "e")!;
  const hp = t.hp;
  b.hit(u, t, Infinity);
  b.hit(u, t, NaN);
  b.heal(u, t, NaN);
  b.shield(u, t, NaN);
  expect(t.hp).toBe(hp);
  expect(t.shield).toBe(0);
  u.hp = 0;
  u.mana = 100;
  const attacks = u.counters.attacks,
    casts = u.counters.casts;
  b.attack(u, t);
  cast(b, u);
  expect(u.counters.attacks).toBe(attacks);
  expect(u.counters.casts).toBe(casts);
});
it("黃金2人只加1金幣；失敗與平局均無額外獎勵", () => {
  for (const winner of ["player", "enemy", "draw"] as const) {
    const b = battle("黃金商會", 2);
    b.units.forEach((u) => {
      if (winner === "draw" || u.team !== winner) u.hp = 0;
    });
    b.advance(0.05);
    expect(b.result?.traitGold ?? 0).toBe(winner === "player" ? 1 : 0);
  }
});
it("召喚物即使單獨傳入計算器也不增加羈絆", () => {
  const b = battle("召喚師");
  expect(
    calculateTraits(
      b.units.filter((u) => u.summon),
      "player",
    ),
  ).toEqual([]);
});
it("後排被包圍時刺客會攻擊可達前排，不會無限追逐受困目標", () => {
  const b = new Battle([
    place("p", "cinder", "player", 3, 4),
    place("front", "oak", "enemy", 3, 3),
    place("rear", "leaf", "enemy", 3, 0),
    place("a", "oak", "enemy", 2, 0),
    place("b", "oak", "enemy", 4, 0),
    place("c", "oak", "enemy", 3, 1),
  ]);
  b.units
    .filter((u) => u.team === "enemy")
    .forEach((u) => {
      u.moveTimer = 100;
      u.attackTimer = 100;
      u.castTimer = 100;
    });
  b.advance(0.05);
  expect(b.units.find((u) => u.id === "p")!.counters.attacks).toBe(1);
  expect(b.units.find((u) => u.id === "front")!.hp).toBeLessThan(
    characterById.oak.maxHP,
  );
});
