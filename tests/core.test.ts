import { describe, it, expect } from "vitest";
import { Battle, STEP } from "../src/game/core/battle";
import { Deployment } from "../src/game/core/deployment";
import { characters, skills } from "../src/game/data/characters";
import { enemies } from "../src/game/data/levels";
import { nextStep, key, targets, inside } from "../src/game/ai/grid";
import { cast } from "../src/game/systems/skills";
import type { Placement } from "../src/game/core/types";
const p = (
  id: string,
  characterId = "flame",
  x = 3,
  y = 4,
  team: "player" | "enemy" = "player",
): Placement => ({ id, characterId, x, y, team });
const duel = () => new Battle([p("p"), p("e", "flame", 3, 3, "enemy")]);
function finish(b: Battle) {
  for (let i = 0; i < 1201 && !b.result; i++) b.advance(STEP);
  return b.result!;
}
describe("資料與部署", () => {
  it("12 名完整一星角色與各自技能", () => {
    expect(characters).toHaveLength(12);
    expect(new Set(characters.map((c) => c.skillId)).size).toBe(12);
    for (const c of characters) {
      expect(c.starLevel).toBe(1);
      expect(c.maxHP).toBeGreaterThan(0);
      expect(skills[c.skillId]).toBeDefined();
      expect(c.cost).toBeGreaterThanOrEqual(1);
      expect(c.cost).toBeLessThanOrEqual(5);
    }
  });
  it("限制區域、無效座標、上限及戰鬥鎖定", () => {
    const d = new Deployment();
    expect(d.place("flame", { x: 0, y: 0 })).toBe(false);
    expect(d.place("flame", { x: NaN, y: 4 })).toBe(false);
    for (let i = 0; i < 5; i++)
      expect(d.place("flame", { x: i, y: 4 })).toBe(true);
    expect(d.place("flame", { x: 5, y: 4 })).toBe(false);
    d.locked = true;
    d.remove(d.placements[0].id);
    d.reset();
    expect(d.placements).toHaveLength(5);
    expect(d.place("leaf", { x: 6, y: 7 })).toBe(false);
  });
  it("交換、移除及重設", () => {
    const d = new Deployment();
    d.place("flame", { x: 1, y: 4 });
    d.place("leaf", { x: 2, y: 4 });
    d.place("flame", { x: 2, y: 4 }, d.placements[0].id);
    expect(d.placements.map((u) => u.x)).toEqual([2, 1]);
    d.remove(d.placements[0].id);
    expect(d.placements).toHaveLength(1);
    d.reset();
    expect(d.placements).toHaveLength(0);
  });
  it("三關固定 3/4/5 名合法敵人", () => {
    for (let i = 0; i < 3; i++) {
      const e = enemies(i);
      expect(e).toHaveLength(i + 3);
      expect(new Set(e.map(key)).size).toBe(e.length);
      expect(e.every((p) => p.y < 4 && inside(p))).toBe(true);
    }
  });
});
describe("AI 與時間", () => {
  it("距離、HP、ID 排序與死亡重選", () => {
    const b = new Battle([
      p("p"),
      p("b", "leaf", 2, 3, "enemy"),
      p("a", "flame", 4, 3, "enemy"),
    ]);
    b.units[1].hp = 50;
    b.units[2].hp = 50;
    expect(targets(b.units[0], b.units)[0].id).toBe("a");
    b.units[2].hp = 0;
    expect(targets(b.units[0], b.units)[0].id).toBe("b");
  });
  it("BFS 繞路且不穿越單位，無路傳回 null", () => {
    expect(
      nextStep({ x: 3, y: 5 }, { x: 3, y: 1 }, 1, new Set(["3,4"])),
    ).toEqual({ x: 2, y: 5 });
    expect(
      nextStep({ x: 0, y: 0 }, { x: 6, y: 7 }, 1, new Set(["0,1", "1,0"])),
    ).toBeNull();
  });
  it("固定時間步進：1/2/4 倍得到相同狀態", () => {
    const states = [1, 2, 4].map((speed) => {
      const b = duel();
      b.speed = speed;
      for (let i = 0; i < 40; i++) b.advance(0.1 / speed);
      return b.units.map((u) => [u.hp, u.mana, u.x, u.y]);
    });
    expect(states[1]).toEqual(states[0]);
    expect(states[2]).toEqual(states[0]);
  });
  it("暫停凍結 HP、護盾、buff、事件與時間", () => {
    const b = duel();
    b.advance(1);
    b.paused = true;
    const before = JSON.stringify(b);
    b.advance(20);
    b.tick();
    expect(JSON.stringify(b)).toBe(before);
  });
  it("死亡單位不再行動，無目標安全結束", () => {
    const b = duel();
    b.units[0].hp = 0;
    b.advance(0.05);
    expect(b.units[0].damage).toBe(0);
    expect(b.result?.winner).toBe("enemy");
    const empty = new Battle([]);
    expect(() => empty.advance(1)).not.toThrow();
    expect(empty.result?.winner).toBe("draw");
  });
});
describe("技能與傷害", () => {
  it.each(characters.map((c) => [c.id]))("%s 能施放獨立技能", (id) => {
    const b = new Battle([
      p("p", id),
      p("ally", "oak", 2, 4),
      p("e", "oak", 3, 3, "enemy"),
      p("e2", "leaf", 2, 3, "enemy"),
      p("e3", "leaf", 4, 3, "enemy"),
    ]);
    b.units[1].hp = 50;
    b.units[0].mana = 100;
    cast(b, b.units[0]);
    expect(b.units[0].mana).toBe(0);
    expect(b.events.some((e) => e.kind === "skill")).toBe(true);
    const u = b.units[0],
      kind = skills[id].kind;
    if (kind === "empower") expect(u.empowered).toBe(true);
    else if (kind === "haste" || kind === "armor") expect(u.buff).toBe(kind);
    else if (kind === "heal") expect(b.units[1].hp).toBeGreaterThan(50);
    else if (kind === "shield" || kind === "ward")
      expect(u.shield).toBeGreaterThan(0);
    else
      expect(
        b.units.some((u) => u.team === "enemy" && u.hp < u.data.maxHP),
      ).toBe(true);
  });
  it("治療上限、護盾先吸收、物理魔法公式與最低傷害", () => {
    const b = duel(),
      [a, t] = b.units;
    b.heal(a, a, 9999);
    expect(a.hp).toBe(a.data.maxHP);
    b.shield(a, t, 500);
    b.hit(a, t, 100);
    expect(t.hp).toBe(t.data.maxHP);
    expect(t.shield).toBe(424);
    t.shield = 0;
    b.hit(a, t, 100, true);
    expect(t.hp).toBe(t.data.maxHP - 86);
    b.hit(a, t, 0);
    expect(t.hp).toBe(t.data.maxHP - 87);
    expect(t.shield).toBeGreaterThanOrEqual(0);
  });
  it("滿能量自動施放、buff 到期、施放間隔", () => {
    const b = new Battle([p("p", "leaf"), p("e", "oak", 3, 3, "enemy")]);
    b.units[0].mana = 100;
    b.advance(0.05);
    expect(b.units[0].buff).toBe("haste");
    b.units[0].mana = 100;
    b.advance(0.05);
    expect(b.events.filter((e) => e.kind === "skill")).toHaveLength(1);
    b.units[0].mana = 0;
    b.units.forEach((u) => {
      u.attackTimer = 100;
    });
    b.advance(5.1);
    expect(b.units[0].buff).toBeNull();
  });
});
describe("結算及完整模擬", () => {
  it("勝利、失敗、同時全滅平局", () => {
    for (const winner of ["player", "enemy", "draw"]) {
      const b = duel();
      b.units.forEach((u) => {
        if (winner === "draw" || u.team !== winner) u.hp = 0;
      });
      b.advance(0.05);
      expect(b.result?.winner).toBe(winner);
    }
  });
  it("60 秒超時依存活數、生命比例、平局結算", () => {
    for (const mode of ["count", "ratio", "draw"]) {
      const b = new Battle([
        p("p"),
        p("e", "flame", 3, 0, "enemy"),
        ...(mode === "count" ? [p("p2", "oak", 0, 7)] : []),
      ]);
      b.units.forEach((u) => {
        u.attackTimer = 100;
        u.moveTimer = 100;
      });
      if (mode === "ratio") b.units[1].hp = 1;
      const r = finish(b);
      expect(r.reason).toBe("timeout");
      expect(r.time).toBe(60);
      expect(r.winner).toBe(mode === "draw" ? "draw" : "player");
    }
  });
  it.each([0, 1, 2])("關卡 %i 全程合法、有限且可重現", (level) => {
    const placements = [
      ...["ember", "flame", "grove", "spark", "leaf"].map((c, i) =>
        p(`p${i}`, c, i + 1, i < 2 ? 4 : 6),
      ),
      ...enemies(level),
    ];
    const run = () => {
      const b = new Battle(placements);
      for (let i = 0; i < 1201 && !b.result; i++) {
        b.advance(0.05);
        const live = b.units.filter((u) => u.hp > 0);
        expect(new Set(live.map(key)).size).toBe(live.length);
        for (const u of b.units) {
          expect(inside(u)).toBe(true);
          for (const v of [u.hp, u.mana, u.shield, u.x, u.y])
            expect(Number.isFinite(v)).toBe(true);
          expect(u.shield).toBeGreaterThanOrEqual(0);
        }
      }
      expect(b.result).not.toBeNull();
      return b;
    };
    const a = run(),
      b = run();
    expect(a.result).toEqual(b.result);
    expect(a.units.some((u) => u.damage > 0)).toBe(true);
    expect(a.units.some((u) => u.hp === 0)).toBe(true);
    expect(a.units.some((u) => u.mana !== u.data.startingMana)).toBe(true);
  });
  it("重開不殘留 HP、計時、部署資料不被戰鬥修改", () => {
    const placements = [p("p"), p("e", "leaf", 3, 3, "enemy")],
      original = JSON.stringify(placements);
    const a = new Battle(placements);
    finish(a);
    const b = new Battle(placements);
    expect(b.time).toBe(0);
    expect(b.units.every((u) => u.hp === u.data.maxHP)).toBe(true);
    expect(JSON.stringify(placements)).toBe(original);
  });
});
