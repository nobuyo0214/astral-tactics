import Phaser from "phaser";
import {
  BoardScene,
  WIDTH,
  HEIGHT,
  screenCell,
} from "../game/scenes/BoardScene";
import { characterById, skills } from "../game/data/characters";
import { effectiveCharacter, effectiveSkill } from "../game/core/attributes";
import { Run } from "../game/run/run";
import { boardPlacements } from "../game/run/roster";
import { roundEnemies, rounds } from "../game/run/rounds";
import {
  SHOP_ODDS,
  XP_REQUIRED,
  copiesForStar,
  STAR_SKILL,
  RULES,
} from "../game/run/config";
import { interest } from "../game/run/economy";
import { ownedCopies } from "../game/run/shop";
import { saveRun } from "../game/run/save";
import { tone, type Settings } from "./settings";
import type { ActionResult, OwnedUnit, UnitLocation } from "../game/run/types";
import type { Cell } from "../game/core/types";
const btn = (id: string, label: string, disabled = false, cls = "") =>
  `<button id="${id}" class="${cls}" ${disabled ? "disabled" : ""}>${label}</button>`;
export class RunScreen {
  private game: Phaser.Game | null = null;
  private selected: string | null = null;
  private speed = 1;
  private destroyed = false;
  private lastEvent = -1;
  private feedback = "選擇商店角色購買，再從備戰席部署至我方棋盤。";
  private saveWarning = "";
  constructor(
    private app: HTMLElement,
    private run: Run,
    private settings: Settings,
    private onMenu: () => void,
  ) {}
  mount() {
    this.app.innerHTML = `<div class="stardust"></div><main class="arena run-arena"><header class="arena-header"><button id="run-home" class="text-button">✧ 星界戰棋 <small>P2 / 經營試煉</small></button><div><span class="eyebrow">ECONOMY & TEAM BUILDING</span><h1 id="run-title"></h1></div><span id="run-phase" class="badge"></span></header><section id="run-top" class="run-top panel"></section><section class="battle-layout"><aside class="left-rail run-left"><section id="run-economy" class="panel"></section><section class="panel"><div class="eyebrow">TEN TRIALS</div><h2>重鑄星環</h2><p>購買 → 升星 → 部署 → 戰鬥</p><p>三個同星角色自動合成。棋盤位置優先保留。戰鬥後單位恢復，繼續下一回合。</p><p>點選或拖曳備戰席角色部署。點選棋子後可移回備戰席或出售。</p></section></aside><section class="board-panel"><div class="board-meta"><span id="run-counts"></span><span id="run-timer">0.00 / 60.00</span></div><div id="run-board" aria-label="經營試煉棋盤"></div><div class="board-bottom"><span>敵方預覽 / 上四排</span><span>我方部署 / 下四排</span></div></section><aside class="right-rail"><section class="panel" id="run-info"></section><section class="panel"><div class="eyebrow">SIMULATION CLOCK</div><div class="speed">${[1, 2, 4].map((s) => `<button data-run-speed="${s}" class="${s === 1 ? "active" : ""}">${s}×</button>`).join("")}${btn("run-pause", "暫停", true)}</div><p id="run-log">戰鬥限時 60 秒。可預先選擇速度。</p></section><section class="panel" id="run-odds"></section></aside></section><div class="run-actions"><p id="run-notice" role="status"></p><div>${btn("run-to-bench", "移回備戰席")}${btn("run-sell", "出售角色")}${btn("run-start", "開始戰鬥 ↗", false, "primary")}</div></div><section class="team-building"><section class="panel bench-panel"><div class="section-title"><div><div class="eyebrow">RESERVE · 9 SLOTS</div><h2>備戰席</h2></div><small>拖曳或點選移動 · 右鍵查看</small></div><div id="run-bench" class="bench-grid"></div></section><section class="panel shop-panel"><div class="section-title"><div><div class="eyebrow">CONSTELLATION EXCHANGE</div><h2>星旅者商店</h2></div><div id="shop-controls"></div></div><div id="run-shop" class="shop-grid"></div></section></section><p id="save-status" class="save-status"></p></main><div id="run-overlay"></div>`;
    this.el("run-home").onclick = () => {
      this.destroy();
      this.onMenu();
    };
    this.el("run-start").onclick = () =>
      this.execute(() => this.run.beginCombat());
    this.el("run-to-bench").onclick = () =>
      this.selected
        ? this.execute(() => this.run.toBench(this.selected!))
        : this.notify("請先選擇棋盤角色。");
    this.el("run-sell").onclick = () =>
      this.selected
        ? this.execute(() => this.run.sell(this.selected!))
        : this.notify("請先選擇要出售的角色。");
    this.el("run-pause").onclick = () => {
      const b = this.run.battle;
      if (!b || b.result) return;
      b.paused = !b.paused;
      this.clock();
    };
    this.app.querySelectorAll<HTMLButtonElement>("[data-run-speed]").forEach(
      (b) =>
        (b.onclick = () => {
          this.speed = Number(b.dataset.runSpeed);
          if (this.run.battle) this.run.battle.speed = this.speed;
          this.app
            .querySelectorAll("[data-run-speed]")
            .forEach((el) => el.classList.toggle("active", el === b));
        }),
    );
    const scene = new BoardScene({
      placements: () => [
        ...boardPlacements(this.run.state),
        ...roundEnemies(this.run.state.round.number),
      ],
      battle: () => this.run.battle,
      selected: () => this.selected,
      animations: () => this.settings.animations,
      quality: () => this.settings.quality === "high",
      click: (c, id) => this.boardClick(c, id),
      drop: (c, id) =>
        this.execute(() => this.run.move(id, { zone: "board", cell: c })),
      inspect: (char, id) => this.inspect(char, id),
      bench: (id) => this.execute(() => this.run.toBench(id)),
      outsideDrop: (id, x, y) => {
        const target = document
          .elementFromPoint(x, y)
          ?.closest<HTMLElement>("[data-bench-slot]");
        if (!target) return false;
        this.execute(() =>
          this.run.move(id, {
            zone: "bench",
            slot: Number(target.dataset.benchSlot),
          }),
        );
        return true;
      },
      update: (delta) => this.tick(delta),
    });
    this.game = new Phaser.Game({
      type: Phaser.AUTO,
      width: WIDTH,
      height: HEIGHT,
      parent: "run-board",
      backgroundColor: "#101b2b",
      scene: [scene],
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true },
      audio: { noAudio: true },
    });
    const host = this.el("run-board");
    host.ondragover = (e) => e.preventDefault();
    host.ondrop = (e) => {
      e.preventDefault();
      const id = e.dataTransfer?.getData("text/plain");
      const canvas = host.querySelector("canvas");
      if (!id || !canvas) return;
      const r = canvas.getBoundingClientRect();
      this.execute(() =>
        this.run.move(id, {
          zone: "board",
          cell: screenCell(
            ((e.clientX - r.left) * WIDTH) / r.width,
            ((e.clientY - r.top) * HEIGHT) / r.height,
          ),
        }),
      );
    };
    this.persist();
    this.render();
  }
  private el(id: string): HTMLElement {
    return this.app.querySelector<HTMLElement>("#" + id)!;
  }
  private notify(message: string) {
    this.feedback = message;
    this.el("run-notice").textContent = message;
  }
  private persist() {
    try {
      if (!saveRun(localStorage, this.run.state))
        this.saveWarning =
          "無法寫入本機存檔（空間不足或權限限制），請勿關閉頁面。";
      else this.saveWarning = "";
    } catch {
      this.saveWarning = "瀏覽器禁止存檔，本次進度僅保留在記憶體。";
    }
  }
  private execute(action: () => ActionResult) {
    const beforeGold = this.run.state.economy.gold,
      beforeLevel = this.run.state.player.level;
    const result = action();
    this.feedback = result.message;
    if (result.ok) {
      if (this.run.battle) this.run.battle.speed = this.speed;
      this.persist();
      if (result.upgrades.length) {
        const units = result.upgrades
          .map((id) => this.run.state.units.find((u) => u.id === id))
          .filter((u): u is OwnedUnit => !!u);
        this.feedback = units
          .map(
            (u) =>
              `${characterById[u.characterId].name} 升至 ${u.starLevel} 星！`,
          )
          .join(" ");
        tone(this.settings.sound, 880);
      } else tone(this.settings.sound);
    }
    if (!this.run.state.units.some((u) => u.id === this.selected))
      this.selected = null;
    this.render();
    if (result.upgrades.length)
      this.el("run-notice").classList.add("upgrade-flash");
    else this.el("run-notice").classList.remove("upgrade-flash");
    if (beforeGold !== this.run.state.economy.gold)
      this.el("run-gold").classList.add("gold-change");
    if (beforeLevel !== this.run.state.player.level) {
      this.el("run-level").classList.add("upgrade-flash");
      this.notify(
        `玩家升級至 Lv.${this.run.state.player.level}！上場人數上限已提高。`,
      );
    }
  }
  private render() {
    const s = this.run.state,
      prep = s.round.phase === "preparation",
      income = s.economy.lastIncome;
    this.el("run-title").textContent =
      `第 ${s.round.number} / 10 回合 · ${rounds[s.round.number - 1].name}`;
    this.el("run-top").innerHTML =
      `<div><small>玩家生命</small><strong class="hp">${s.player.hp}<em>/ 100</em></strong></div><div id="run-gold"><small>星金</small><strong class="gold">${s.economy.gold}<em>金幣</em></strong></div><div id="run-level"><small>玩家等級</small><strong>Lv.${s.player.level}</strong></div><div><small>經驗進度</small><strong>${s.player.xp}<em>/ ${s.player.level === 9 ? "MAX" : XP_REQUIRED[s.player.level]} XP</em></strong><progress max="${XP_REQUIRED[s.player.level] || 1}" value="${s.player.level === 9 ? 1 : s.player.xp}"></progress></div><div><small>連勝／連敗</small><strong>${s.economy.wins ? `${s.economy.wins} 連勝` : s.economy.losses ? `${s.economy.losses} 連敗` : "—"}</strong></div><div><small>目前上場</small><strong id="run-field-count">${boardPlacements(s).length} / ${s.player.level}</strong></div>`;
    this.el("run-economy").innerHTML =
      `<div class="eyebrow">ECONOMY FORECAST</div><h2>經濟管理</h2><p>本回合預估利息 <b class="gold">+${interest(s.economy.gold)}</b></p><small>結束時、獎勵發放前每 10 金幣 +1，上限 +5。</small><h3>上回合收入明細</h3>${income ? `<p>基本 +${income.base}<br>利息 +${income.interest}<br>連勝／連敗 +${income.streak}<br>特殊獎勵 +${income.special}</p><strong class="gold">總收入 +${income.total}</strong>` : "<p>尚未結算任何回合。</p>"}`;
    this.el("run-odds").innerHTML =
      `<div class="eyebrow">SHOP PROBABILITIES</div><h3>Lv.${s.player.level} 抽卡機率</h3><p>${SHOP_ODDS[s.player.level].map((n, i) => `${i + 1} 費：${n}%`).join("<br>")}</p>`;
    this.el("run-bench").innerHTML = Array.from({ length: 9 }, (_, slot) => {
      const u = s.units.find(
          (u) => u.location.zone === "bench" && u.location.slot === slot,
        ),
        c = u ? characterById[u.characterId] : null;
      return `<button class="bench-slot ${u?.id === this.selected ? "selected" : ""}" data-bench-slot="${slot}" ${u ? `data-owned="${u.id}" draggable="${prep}"` : ""} ${!prep ? "disabled" : ""}><small class="slot-number">${slot + 1}</small>${u && c ? `<span style="color:#${c.color.toString(16)}">${c.symbol}</span><strong>${c.name}</strong><small class="star">${"★".repeat(u.starLevel)}</small>` : '<span class="empty-slot">＋</span>'}</button>`;
    }).join("");
    this.el("shop-controls").innerHTML =
      `${btn("shop-refresh", "刷新 · 2 金幣", !prep || s.economy.gold < RULES.refreshCost)}${btn("shop-lock", s.shop.locked ? "🔒 已鎖定" : "鎖定商店", !prep, s.shop.locked ? "active" : "")}${btn("buy-xp", s.player.level === 9 ? "已達滿級" : "購買 4 XP · 4 金幣", !prep || s.economy.gold < RULES.xpCost || s.player.level === 9)}`;
    this.el("run-shop").innerHTML = s.shop.slots
      .map((slot, index) => {
        const c = slot.characterId ? characterById[slot.characterId] : null;
        return `<article class="shop-card ${c ? "" : "sold"}">${c ? `<div class="shop-sigil" style="color:#${c.color.toString(16)}">${c.symbol}<span>${c.cost} 金幣</span></div><h3>${c.name}</h3><p>${c.faction} / ${c.class}</p><small>持有 ${ownedCopies(s, c.id)} 張一星卡</small><button data-buy="${index}" ${!prep || s.economy.gold < c.cost ? "disabled" : ""}>${s.economy.gold < c.cost ? "金幣不足" : `購買 · ${c.cost} 金幣`}</button>` : '<div class="sold-mark">✧</div><p>已售出／卡池耗盡</p>'}</article>`;
      })
      .join("");
    this.el("shop-refresh").onclick = () =>
      this.execute(() => this.run.refresh());
    this.el("shop-lock").onclick = () =>
      this.execute(() => this.run.toggleLock());
    this.el("buy-xp").onclick = () => this.execute(() => this.run.buyXP());
    this.app
      .querySelectorAll<HTMLButtonElement>("[data-buy]")
      .forEach(
        (el) =>
          (el.onclick = () =>
            this.execute(() => this.run.buy(Number(el.dataset.buy)))),
      );
    this.app
      .querySelectorAll<HTMLButtonElement>("[data-bench-slot]")
      .forEach((el) => {
        el.onclick = () => {
          if (!prep) return;
          const slot = Number(el.dataset.benchSlot),
            id = el.dataset.owned;
          if (this.selected && this.selected !== id) {
            const selected = this.selected;
            this.selected = null;
            this.execute(() =>
              this.run.move(selected, { zone: "bench", slot }),
            );
          } else if (id) {
            this.selected = id;
            this.render();
          } else this.notify("先選取棋盤或備戰席角色。");
        };
        el.oncontextmenu = (e) => {
          e.preventDefault();
          if (el.dataset.owned) {
            this.selected = el.dataset.owned;
            this.render();
          }
        };
        el.ondragstart = (e) => {
          if (el.dataset.owned && prep) {
            e.dataTransfer?.setData("text/plain", el.dataset.owned);
            this.selected = el.dataset.owned;
          } else e.preventDefault();
        };
        el.ondragover = (e) => e.preventDefault();
        el.ondrop = (e) => {
          e.preventDefault();
          const id = e.dataTransfer?.getData("text/plain");
          if (id)
            this.execute(() =>
              this.run.move(id, {
                zone: "bench",
                slot: Number(el.dataset.benchSlot),
              }),
            );
        };
      });
    for (const id of ["run-start", "run-to-bench", "run-sell"])
      (this.el(id) as HTMLButtonElement).disabled = !prep;
    if (this.selected) {
      const u = s.units.find((u) => u.id === this.selected);
      if (u) this.inspect(u.characterId, u.id);
    } else
      this.el("run-info").innerHTML =
        '<div class="eyebrow">STAR TRAVELER</div><h2>你的星旅者</h2><p>購買後點選棋子或備戰席角色，查看星級、有效數值與出售價格。</p>';
    this.el("run-notice").textContent = this.feedback;
    this.el("save-status").textContent =
      this.saveWarning || "✓ 已自動儲存 · 戰鬥中重新整理會回到本回合開戰前";
    this.clock();
    this.overlay();
  }
  private inspect(characterId: string, id?: string) {
    const u = this.run.state.units.find((u) => u.id === id),
      combat = this.run.battle?.units.find((u) => u.id === id),
      enemy = roundEnemies(this.run.state.round.number).find(
        (u) => u.id === id,
      ),
      star = u?.starLevel ?? combat?.starLevel ?? enemy?.starLevel ?? 1,
      c = effectiveCharacter(characterId, star),
      skill = effectiveSkill(c.skillId, star);
    this.el("run-info").innerHTML =
      `<div class="eyebrow">${u ? "我方持有角色" : "星旅者檔案"} · ${c.cost} 費</div><h2>${c.name}</h2><p class="star">${"★".repeat(star)}</p><p>${c.faction} / ${c.class}</p><div class="stats">生命 <b>${c.maxHP}</b>　攻擊 <b>${c.attack}</b><br>防禦 ${c.defense}　攻速 ${c.attackSpeed}<br>射程 ${c.attackRange}　移速 ${c.moveSpeed}</div><h3>${skill.name}</h3><p>一星基礎：${skills[c.skillId].description}</p><small>星級技能強度 ${Math.round(STAR_SKILL[star - 1] * 100)}% · 效果值 ${Number(skill.power.toFixed(2))}</small>${u ? `<p class="gold">出售價格 ${c.cost * copiesForStar(star)} 金幣</p>` : ""}`;
  }
  private boardClick(cell: Cell, id?: string) {
    const s = this.run.state;
    if (s.round.phase !== "preparation") {
      if (id) {
        const unit = this.run.battle?.units.find((u) => u.id === id);
        if (unit) this.inspect(unit.characterId, id);
      }
      return;
    }
    if (this.selected && id !== this.selected) {
      const selected = this.selected;
      this.selected = null;
      this.execute(() => this.run.move(selected, { zone: "board", cell }));
      return;
    }
    const owned = s.units.find((u) => u.id === id);
    if (owned) {
      this.selected = owned.id;
      this.render();
      return;
    }
    const enemy = roundEnemies(s.round.number).find((u) => u.id === id);
    if (enemy) this.inspect(enemy.characterId, id);
    else this.notify("請先從備戰席選擇角色。");
  }
  private clock() {
    document.body.classList.toggle(
      "battle-paused",
      this.run.battle?.paused ?? false,
    );
    const s = this.run.state,
      b = this.run.battle;
    this.el("run-timer").textContent = `${(b?.time ?? 0).toFixed(2)} / 60.00`;
    this.el("run-counts").textContent =
      `我方 ${b ? b.units.filter((u) => u.team === "player" && u.hp > 0).length : boardPlacements(s).length} / ${s.player.level} · 敵方 ${b ? b.units.filter((u) => u.team === "enemy" && u.hp > 0).length : roundEnemies(s.round.number).length}`;
    this.el("run-phase").textContent = b?.paused
      ? "已暫停"
      : {
          preparation: "準備階段",
          combat: "戰鬥階段",
          settlement: "回合結算",
          completed: "試煉完成",
          gameOver: "挑戰失敗",
        }[s.round.phase];
    const pause = this.el("run-pause") as HTMLButtonElement;
    pause.disabled = s.round.phase !== "combat";
    pause.textContent = b?.paused ? "繼續" : "暫停";
  }
  private tick(delta: number) {
    if (this.destroyed) return;
    const b = this.run.battle;
    if (!b) return;
    const before = b.result;
    b.advance(Math.min(delta, 0.25));
    this.clock();
    const events = b.events.filter(
      (e) => e.id > this.lastEvent && e.kind === "skill",
    );
    if (events.length) {
      this.el("run-log").textContent = events
        .slice(-2)
        .map((e) => `${e.time.toFixed(1)}s ${e.label}`)
        .join(" · ");
      tone(this.settings.sound, 740);
    }
    this.lastEvent = b.events.at(-1)?.id ?? this.lastEvent;
    if (!before && b.result) {
      this.execute(() => this.run.settle());
    }
  }
  private overlay() {
    const s = this.run.state,
      phase = s.round.phase,
      host = this.el("run-overlay");
    if (phase === "preparation" || phase === "combat") {
      host.innerHTML = "";
      return;
    }
    const r = s.round.lastResult!,
      income = s.economy.lastIncome!,
      final = phase === "completed" || phase === "gameOver";
    host.innerHTML = `<div class="modal-backdrop"><section class="result panel" role="dialog" aria-modal="true" aria-label="${final ? "經營試煉總結" : "經營回合結算"}"><div class="eyebrow">${final ? "RUN COMPLETE" : "ROUND SETTLEMENT"} / ${r.reason === "timeout" ? "超時結算" : "全滅結算"}</div><div class="crest">✧</div><h1>${phase === "completed" ? "試煉完成" : phase === "gameOver" ? "挑戰失敗" : r.winner === "player" ? "本回合勝利" : r.winner === "enemy" ? "本回合失敗" : "本回合平局"}</h1><p>第 ${s.round.number} 回合 · ${r.time.toFixed(2)} 秒 · 雙方存活 ${r.playerAlive} / ${r.enemyAlive}</p><div class="result-stats"><span>玩家 HP<b>${s.player.hp}</b></span><span>金幣<b>${s.economy.gold}</b></span><span>等級<b>Lv.${s.player.level}</b></span><span>本回合收入<b>+${income.total}</b></span><span>造成傷害<b>${r.damage}</b></span></div><p>基本 ${income.base} + 利息 ${income.interest} + 連勝／連敗 ${income.streak} + 特殊 ${income.special}</p>${final ? `<div class="result-stats"><span>完成回合<b>${s.stats.completedRounds}</b></span><span>最高連勝<b>${s.stats.highestWinStreak}</b></span><span>累計傷害<b>${s.stats.totalDamage}</b></span><span>最高星級<b>${"★".repeat(s.stats.highestStar)}</b></span></div><h3>最終隊伍配置</h3><div class="damage-list">${s.units.map((u) => `<p>${characterById[u.characterId].name} ${"★".repeat(u.starLevel)}<span>${u.location.zone === "board" ? `${String.fromCharCode(65 + u.location.cell.x)}${u.location.cell.y + 1}` : `備戰席 ${u.location.slot + 1}`}</span></p>`).join("") || "<p>無持有角色</p>"}</div>${btn("run-restart", "重新開始", false, "primary")}` : btn("run-next", "前往下一回合", false, "primary")}${btn("run-result-home", "返回主選單")}</section></div>`;
    if (!final)
      this.el("run-next").onclick = () => {
        this.selected = null;
        this.lastEvent = -1;
        this.execute(() => this.run.nextRound());
      };
    else
      this.el("run-restart").onclick = () => {
        this.destroy();
        this.onMenu();
        document.getElementById("run-new")?.click();
      };
    this.el("run-result-home").onclick = () => {
      this.destroy();
      this.onMenu();
    };
    this.el(final ? "run-restart" : "run-next").focus();
  }
  destroy() {
    document.body.classList.remove("battle-paused");
    if (this.destroyed) return;
    this.destroyed = true;
    this.game?.destroy(true);
    this.game = null;
  }
}
