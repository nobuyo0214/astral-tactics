import { writeFileSync, mkdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { Battle } from "../src/game/core/battle";
import { characterById } from "../src/game/data/characters";
import type { Placement, Team } from "../src/game/core/types";
const teams: Record<string, string[]> = {
  純戰士: ["flame", "bolt", "judge", "forge", "flame", "bolt", "bolt", "judge"],
  純法師: ["plume", "spark", "astral", "snow", "snow", "snow", "snow", "snow"],
  射手守護者: ["ember", "oak", "leaf", "thunder", "oak", "oak", "oak", "oak"],
  烈焰持續傷害: [
    "flame",
    "ember",
    "plume",
    "cinder",
    "spark",
    "coin",
    "veil",
    "comet",
  ],
  霜月控制: ["rime", "veil", "snow", "dew", "rime", "veil", "snow", "dew"],
  雷霆爆發: [
    "thunder",
    "bolt",
    "spark",
    "relay",
    "astral",
    "grove",
    "veil",
    "coin",
  ],
  自然治療: ["grove", "leaf", "oak", "briar", "plume", "spark", "coin", "veil"],
  深淵吸血: [
    "shade",
    "vessel",
    "wisp",
    "omen",
    "ember",
    "thunder",
    "astral",
    "forge",
  ],
  星辰技能: [
    "astral",
    "lumen",
    "judge",
    "comet",
    "relay",
    "ballista",
    "shade",
    "ledger",
  ],
  黃金經濟: [
    "gilt",
    "coin",
    "ledger",
    "broker",
    "gilt",
    "coin",
    "ledger",
    "coin",
  ],
  多羈絆混合: [
    "lumen",
    "astral",
    "grove",
    "oak",
    "grove",
    "grove",
    "grove",
    "leaf",
  ],
};
function formation(ids: string[], team: Team, seed: number): Placement[] {
  let n = seed >>> 0;
  const random = () => {
    n = (1664525 * n + 1013904223) >>> 0;
    return n / 4294967296;
  };
  const xs = [0, 1, 2, 3, 4, 5, 6].sort(() => 0);
  for (let i = 6; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]];
  }
  let front = 0,
    back = 0;
  return ids.map((characterId, i) => {
    const melee = characterById[characterId].attackRange <= 1,
      index = melee ? front++ : back++;
    const row = melee ? 4 + Math.floor(index / 7) : 7 - Math.floor(index / 7);
    return {
      id: `${team === "player" ? "p" : "e"}${i}`,
      characterId,
      starLevel: 1,
      team,
      x: xs[index % 7],
      y: team === "player" ? row : 7 - row,
    };
  });
}
const names = Object.keys(teams),
  stats = Object.fromEntries(
    names.map((name) => [
      name,
      {
        name,
        roster: teams[name],
        cost: teams[name].reduce((n, id) => n + characterById[id].cost, 0),
        units: 8,
        star: 1,
        level: 8,
        played: 0,
        wins: 0,
        draws: 0,
        time: 0,
        damage: 0,
        healing: 0,
        taken: 0,
        timeouts: 0,
      },
    ]),
  );
for (const stat of Object.values(stats))
  if (stat.cost !== 20) throw new Error(`${stat.name} 預算不符`);
const started = performance.now();
let maxUnits = 0,
  maxEvents = 0,
  steps = 0;
const matches: unknown[] = [];
for (let a = 0; a < names.length; a++)
  for (let c = a + 1; c < names.length; c++)
    for (const seed of [11, 97])
      for (const swap of [false, true]) {
        const p = names[swap ? c : a],
          e = names[swap ? a : c];
        const battle = new Battle([
          ...formation(teams[p], "player", seed),
          ...formation(teams[e], "enemy", seed),
        ]);
        for (let i = 0; i < 1201 && !battle.result; i++) {
          battle.advance(0.05);
          steps++;
          maxUnits = Math.max(maxUnits, battle.units.length);
          maxEvents = Math.max(maxEvents, battle.events.length);
          if (
            battle.units.some(
              (u) =>
                !Number.isFinite(u.hp) ||
                !Number.isFinite(u.damage) ||
                u.statuses.length > 3,
            )
          )
            throw Error("無效戰鬥數值");
        }
        const r = battle.result!;
        if (!r) throw Error("未結束");
        matches.push({
          player: p,
          enemy: e,
          seed,
          winner: r.winner,
          seconds: r.time,
        });
        for (const [name, team] of [
          [p, "player"],
          [e, "enemy"],
        ] as const) {
          const s = stats[name],
            units = battle.units.filter((u) => u.team === team);
          s.played++;
          if (r.winner === team) s.wins++;
          if (r.winner === "draw") s.draws++;
          s.time += r.time;
          s.damage += units.reduce((n, u) => n + u.damage, 0);
          s.healing += units.reduce((n, u) => n + u.healing, 0);
          s.taken += units.reduce((n, u) => n + u.taken, 0);
          if (r.reason === "timeout") s.timeouts++;
        }
      }
const round = (n: number) => Math.round(n * 100) / 100;
const report = {
  rules:
    "每隊8名、一星、Lv.8、總費用20；兩個站位種子；雙向換邊；全配對。非隨機傷害。",
  seeds: [11, 97],
  battles: matches.length,
  steps,
  maxUnits,
  maxRetainedEvents: maxEvents,
  wallMilliseconds: round(performance.now() - started),
  teams: Object.values(stats).map((s) => ({
    ...s,
    winRate: round((s.wins / s.played) * 100),
    averageTime: round(s.time / s.played),
    averageDamage: round(s.damage / s.played),
    averageHealing: round(s.healing / s.played),
    averageTaken: round(s.taken / s.played),
    timeoutRate: round((s.timeouts / s.played) * 100),
  })),
  matches,
};
mkdirSync("docs", { recursive: true });
writeFileSync(
  "docs/trait-balance-results.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(JSON.stringify({ ...report, matches: undefined }, null, 2));
