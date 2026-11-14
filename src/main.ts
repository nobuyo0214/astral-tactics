import { observeBoardViewport } from "./ui/boardViewport";
import { RunScreen } from "./ui/RunScreen";
import { Run, createRun } from "./game/run/run";
import { loadRun } from "./game/run/save";
import Phaser from "phaser";
import "./styles/main.css";
import "./styles/gameplay.css";
import { characters, characterById, skills } from "./game/data/characters";
import { enemies, levels } from "./game/data/levels";
import { Deployment } from "./game/core/deployment";
import { Battle } from "./game/core/battle";
import { BoardScene, WIDTH, HEIGHT } from "./game/scenes/BoardScene";
import { loadSettings, saveSettings, tone } from "./ui/settings";
import type { Cell } from "./game/core/types";
const app = document.querySelector<HTMLDivElement>("#app")!;
const settings = loadSettings();
let runScreen: RunScreen | null = null;
let releaseBoardViewport: () => void = () => {};
let game: Phaser.Game | null = null,
  battle: Battle | null = null,
  deployment = new Deployment(),
  level = 0,
  selection: string | null = null,
  chosen = "flame",
  lastEvent = -1;
const button = (id: string, label: string, cls = "") =>
  `<button id="${id}" class="${cls}">${label}</button>`;
function bind(id: string, fn: () => void) {
  document.getElementById(id)?.addEventListener("click", () => {
    tone(settings.sound);
    fn();
  });
}
function dispose() {
  document.body.classList.remove("battle-paused", "game-view");
  releaseBoardViewport();
  runScreen?.destroy();
  runScreen = null;
  game?.destroy(true);
  game = null;
  battle = null;
}
function shell(content: string) {
  app.innerHTML = `<div class="stardust"></div>${content}<footer>ASTRAL TACTICS <span>原創策略自走棋 · P2 ALPHA</span></footer>`;
  document.body.classList.toggle("reduced-motion", !settings.animations);
}
function menu() {
  dispose();
  let saved: ReturnType<typeof loadRun>;
  try {
    saved = loadRun(localStorage);
  } catch {
    saved = { status: "unavailable", message: "瀏覽器不允許存取存檔。" };
  }
  shell(
    `<main class="menu"><div class="eyebrow">THE SHATTERED CONSTELLATION</div><div class="crest">✧</div><h1>星界戰棋</h1><p class="english">ASTRAL TACTICS</p><p class="intro">星環破碎之後，每一次佈陣，都是重寫命運的起點。</p><nav>${button("run-new", "經營試煉 <span>P2 · 全新旅程 ↗</span>", "primary")}${button("run-continue", "繼續經營 <span>本機存檔</span>")}${button("play", "自由戰鬥 <span>P1 · 開始遊戲 ↗</span>")}${button("codex", "角色圖鑑 <span>12 位星旅者</span>")}${button("settings", "遊戲設定 <span>⚙</span>")}${button("help", "操作說明 <span>?</span>")}</nav><small>P2 Alpha · 十回合經營試煉 / 自由戰鬥</small><p class="menu-save" id="menu-save"></p></main>`,
  );
  const openRun = (run: Run) => {
    dispose();
    runScreen = new RunScreen(app, run, settings, menu);
    runScreen.mount();
  };
  bind("run-new", () =>
    openRun(new Run(createRun(crypto.getRandomValues(new Uint32Array(1))[0]))),
  );
  (document.getElementById("run-continue") as HTMLButtonElement).disabled =
    saved.status !== "loaded";
  document.getElementById("menu-save")!.textContent =
    saved.status === "loaded"
      ? `已保存第 ${saved.state.round.number} 回合 · ${saved.state.player.hp} HP`
      : saved.status === "empty"
        ? "新旅程會自動儲存進度。"
        : saved.message;
  bind("run-continue", () => {
    if (saved.status === "loaded") openRun(new Run(saved.state));
  });
  bind("play", () => {
    deployment = new Deployment();
    selection = null;
    prepare();
  });
  bind("codex", codex);
  bind("settings", settingsPage);
  bind("help", help);
}
function page(title: string, body: string) {
  dispose();
  shell(
    `<main class="page"><header><div><div class="eyebrow">ASTRAL ARCHIVE</div><h1>${title}</h1></div>${button("back", "← 返回主選單")}</header>${body}</main>`,
  );
  bind("back", menu);
}
function codex() {
  page(
    "星旅者圖鑑",
    `<p class="muted">12 名原創角色 · 一星基礎數值 · 可於 P2 商店購買及升星</p><div class="codex">${characters.map((c) => `<article class="character"><div class="sigil" style="color:#${c.color.toString(16)}">${c.symbol}</div><small>${c.faction} / ${c.class} · ${c.cost} 費 · ★</small><h2>${c.name}</h2><p>${c.description}</p><div class="stats">HP ${c.maxHP} · 攻擊 ${c.attack} · 防禦 ${c.defense}<br>攻速 ${c.attackSpeed} · 射程 ${c.attackRange} · 移速 ${c.moveSpeed}<br>能量 ${c.startingMana} / ${c.maxMana}</div><h3>${skills[c.skillId].name}</h3><p>${skills[c.skillId].description}</p></article>`).join("")}</div>`,
  );
}
function settingsPage() {
  page(
    "遊戲設定",
    `<section class="settings panel"><label>合成音效 <input id="sound" type="checkbox" ${settings.sound ? "checked" : ""}></label><p>按鈕與技能提示音，不含外部音樂。</p><label>戰鬥動畫與背景星光 <input id="animations" type="checkbox" ${settings.animations ? "checked" : ""}></label><label>畫面效果 <select id="quality"><option value="high">精緻</option><option value="low">簡約</option></select></label><p id="saved">設定會自動儲存在此瀏覽器。</p></section>`,
  );
  (document.getElementById("quality") as HTMLSelectElement).value =
    settings.quality;
  for (const id of ["sound", "animations", "quality"])
    document.getElementById(id)!.addEventListener("change", () => {
      settings.sound = (
        document.getElementById("sound") as HTMLInputElement
      ).checked;
      settings.animations = (
        document.getElementById("animations") as HTMLInputElement
      ).checked;
      settings.quality = (
        document.getElementById("quality") as HTMLSelectElement
      ).value as "high" | "low";
      saveSettings(settings);
      document.body.classList.toggle("reduced-motion", !settings.animations);
      tone(settings.sound);
    });
}
function help() {
  page(
    "星庭作戰指南",
    `<div class="help-grid">${[
      [
        "01 / 部署",
        "選取下方角色，再點擊我方藍色棋格。最多部署五名；敵方紅色區域禁止部署。可重複選用同角色。",
      ],
      [
        "02 / 站位",
        "點選棋子再點目標格，或拖曳棋子移動；我方角色會交換位置。右鍵查看資訊，按「移回備戰區」移除選中棋子。拖至棋盤外緣亦可移除。",
      ],
      [
        "03 / 自動戰鬥",
        "前排守護者掩護射手與法師。最近敵人優先，同距離選低 HP，再按固定 ID。單位使用 BFS 尋路，不穿越其他存活單位。",
      ],
      [
        "04 / 能量與技能",
        "普攻獲得 22 能量，受擊獲得 8。滿 100 自動施放，施放後歸零，至少間隔 1.2 秒。護盾先吸收傷害，治療不會復活。",
      ],
      [
        "05 / 時間與勝負",
        "1×、2×、4× 改變模擬時間。暫停同時凍結戰鬥與特效。全滅即結算；60 秒時先比存活數，再比剩餘生命比例總和，相同為平局。",
      ],
      [
        "06 / 重整旗鼓",
        "戰鬥中鎖定部署。重新挑戰會保留原始站位、清除本場狀態；重設部署會清空我方。三種試煉隨時可在準備階段切換。",
      ],
      [
        "07 / 經營試煉",
        "從 10 金幣、Lv.2 開始。商店購買進入九格備戰席，刷新花 2 金幣、買 4 XP 花 4 金幣；上場上限等於等級。三個相同角色及星級自動合成，出售按原卡數全額退還。",
      ],
      [
        "08 / 回合與存檔",
        "經營試煉共十回合，結束發收入與自然 XP；利息以發獎前每 10 金幣 +1、上限 +5。重要操作自動存檔，重新整理後可從主選單繼續，戰鬥中刷新會回到開戰前準備階段。",
      ],
    ]
      .map(
        ([t, d]) => `<article class="panel"><h2>${t}</h2><p>${d}</p></article>`,
      )
      .join("")}</div>`,
  );
}
function info(id: string) {
  const c = characterById[id];
  document.getElementById("unit-info")!.innerHTML =
    `<div class="eyebrow">星旅者檔案 · ★ · ${c.cost} 費</div><h2>${c.name}</h2><p>${c.faction} / ${c.class}</p><div class="stats">HP <b>${c.maxHP}</b>　攻擊 <b>${c.attack}</b><br>防禦 <b>${c.defense}</b>　攻速 <b>${c.attackSpeed}</b><br>射程 <b>${c.attackRange}</b>　移速 <b>${c.moveSpeed}</b><br>起始能量 ${c.startingMana} / ${c.maxMana}</div><h3>${skills[c.skillId].name}</h3><p>${skills[c.skillId].description}</p>`;
}
function notice(message: string) {
  document.getElementById("notice")!.textContent = message;
}
function cellClick(cell: Cell, id?: string) {
  if (battle) {
    if (id) {
      const u = battle.units.find((u) => u.id === id);
      if (u) info(u.characterId);
    }
    return;
  }
  const unit = deployment.placements.find((u) => u.id === id);
  if (unit && selection && selection !== unit.id) {
    const moving = deployment.placements.find((p) => p.id === selection);
    if (moving) deployment.place(moving.characterId, cell, selection);
    selection = null;
    updateHUD();
    return;
  }
  if (unit) {
    selection = unit.id;
    chosen = unit.characterId;
    info(chosen);
    notice("已選取棋子：點擊棋格移動／交換，或移回備戰區。");
    return;
  }
  if (id) {
    const enemy = enemies(level).find((u) => u.id === id);
    if (enemy) info(enemy.characterId);
    return;
  }
  if (!deployment.place(chosen, cell, selection ?? undefined))
    notice("無法部署：請選擇我方空格，上場上限 5 名。");
  else {
    selection = null;
    notice("部署完成。前排承傷，後排輸出。");
  }
  updateHUD();
}
function drop(cell: Cell, id: string) {
  const u = deployment.placements.find((p) => p.id === id);
  if (!u || battle) return;
  if (!deployment.place(u.characterId, cell, id))
    notice("只能移動至我方區域。");
  selection = id;
  info(u.characterId);
}
function remove(id: string) {
  if (battle) return;
  deployment.remove(id);
  selection = null;
  updateHUD();
  notice("已移回備戰區，可重新選擇角色。");
}
function prepare() {
  dispose();
  document.body.classList.add("game-view");
  deployment.locked = false;
  lastEvent = -1;
  shell(
    `<main class="arena free-arena"><header class="arena-header"><a id="home" href="#">✧ 星界戰棋 <small>P1 ALPHA</small></a><div><span class="eyebrow">裂星遠征 / 測試試煉</span><h1 id="round-title">${levels[level].name}</h1></div><div id="phase" class="badge">部署階段</div></header><section class="battle-layout"><aside class="left-rail"><div class="eyebrow">CHOOSE YOUR TRIAL</div><h2>選擇試煉</h2>${levels.map((l, i) => `<button class="level ${i === level ? "active" : ""}" data-level="${i}"><small>${l.subtitle}</small><strong>${l.name}</strong><span>${l.ids.length} 名敵人 ${i === 0 ? "· 入門" : i === 1 ? "· 進階" : "· 挑戰"}</span></button>`).join("")}<div class="panel field-notes"><h3>戰術筆記</h3><p>${levels[level].description}</p><p>守護者在前，射手在後。<br>點選或拖曳配置你的星旅者。</p><div class="legend"><i></i>我方部署區 <i class="red"></i>敵方部署區</div></div></aside><section class="board-panel"><div class="board-meta"><span id="counts">我方 0 / 5 · 敵方 ${enemies(level).length}</span><span id="timer">00.00 / 60.00</span></div><div id="board" class="board-viewport" aria-label="7 欄 8 排戰鬥棋盤"></div><div class="board-bottom"><span>✧ 方格座標 A–G / 1–8</span><span>下半場為我方部署區</span></div></section><aside class="right-rail"><section id="unit-info" class="panel"></section><section class="panel controls"><div class="eyebrow">SIMULATION CLOCK</div><div class="speed">${[1, 2, 4].map((s) => `<button data-speed="${s}" class="${s === 1 ? "active" : ""}">${s}×</button>`).join("")}${button("pause", "暫停")}</div>${button("free-log-toggle", "戰場紀錄")}</section><section class="panel info-popover" id="free-log-panel" role="dialog" aria-label="戰場紀錄" hidden>${button("close-free-log", "關閉 ×")}<h3>戰場紀錄</h3><div id="log" aria-live="off">等待星旅者入場。</div></section></aside></section><section class="roster-panel"><div class="roster-heading"><div><span class="eyebrow">YOUR CONSTELLATION</span><h2>星旅者 / 備戰區 <small>12 名已解鎖</small></h2></div>${button("remove", "移回備戰區")}</div><div class="roster">${characters.map((c) => `<button class="roster-card ${c.id === chosen ? "selected" : ""}" data-char="${c.id}"><span style="color:#${c.color.toString(16)}">${c.symbol}</span><strong>${c.name}</strong><small>${c.class} · ${c.cost} 費 ★</small></button>`).join("")}</div></section><div class="action-bar"><p id="notice" role="status">選擇星旅者，再點擊下半場空格部署。</p><div>${button("reset", "重設部署")}${button("retry", "重新挑戰")}${button("free-results", "查看結算")}${button("start", "開始戰鬥 ↗", "primary")}</div></div></main><div id="result"></div>`,
  );
  bind("home", menu);
  document
    .getElementById("home")!
    .addEventListener("click", (e) => e.preventDefault());
  info(chosen);
  document.querySelectorAll<HTMLButtonElement>("[data-char]").forEach(
    (el) =>
      (el.onclick = () => {
        if (battle) return;
        selection = null;
        chosen = el.dataset.char!;
        info(chosen);
        document
          .querySelectorAll("[data-char]")
          .forEach((e) =>
            e.classList.toggle(
              "selected",
              (e as HTMLElement).dataset.char === chosen,
            ),
          );
        notice("已選擇 " + characterById[chosen].name + "，點擊我方空格部署。");
        tone(settings.sound);
      }),
  );
  document.querySelectorAll<HTMLButtonElement>("[data-level]").forEach(
    (el) =>
      (el.onclick = () => {
        if (battle) return;
        level = Number(el.dataset.level);
        prepare();
      }),
  );
  bind("remove", () => {
    if (selection) remove(selection);
    else notice("先點選棋盤上的我方角色。");
  });
  bind("reset", () => {
    deployment.reset();
    selection = null;
    updateHUD();
  });
  bind("retry", () => {
    selection = null;
    prepare();
  });
  bind("start", start);
  bind("free-results", () => {
    if (battle?.result) result();
  });
  bind("free-log-toggle", () => {
    document.getElementById("free-log-panel")!.hidden = false;
    document.getElementById("close-free-log")!.focus();
  });
  bind("close-free-log", () => {
    document.getElementById("free-log-panel")!.hidden = true;
    document.getElementById("free-log-toggle")!.focus();
  });
  bind("pause", () => {
    if (!battle || battle.result) return;
    battle.paused = !battle.paused;
    document.getElementById("pause")!.textContent = battle.paused
      ? "繼續"
      : "暫停";
    updateHUD();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-speed]").forEach(
    (el) =>
      (el.onclick = () => {
        if (!battle) return;
        battle.speed = Number(el.dataset.speed);
        document
          .querySelectorAll("[data-speed]")
          .forEach((e) => e.classList.toggle("active", e === el));
      }),
  );
  const scene = new BoardScene({
    placements: () => [...deployment.placements, ...enemies(level)],
    battle: () => battle,
    selected: () => selection,
    animations: () => settings.animations,
    quality: () => settings.quality === "high",
    click: cellClick,
    drop,
    inspect: info,
    bench: remove,
    update: (delta) => {
      if (!battle) return;
      const before = battle.result;
      battle.advance(Math.min(delta, 0.25));
      updateHUD();
      const recent = battle.events.filter(
        (e) => e.id > lastEvent && e.kind === "skill",
      );
      if (recent.length) {
        document.getElementById("log")!.textContent = recent
          .slice(-3)
          .map((e) => `${e.time.toFixed(1)}s · ${e.label}`)
          .join("\n");
        tone(settings.sound, 740);
      }
      lastEvent = battle.events.at(-1)?.id ?? lastEvent;
      if (!before && battle.result) result();
    },
  });
  game = new Phaser.Game({
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    parent: "board",
    backgroundColor: "#101b2b",
    scene: [scene],
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true },
    audio: { noAudio: true },
  });
  releaseBoardViewport = observeBoardViewport(
    game,
    document.getElementById("board")!,
  );
  updateHUD();
}
function start() {
  if (battle || !deployment.placements.length) {
    notice("請先部署至少一名角色。");
    return;
  }
  deployment.locked = true;
  selection = null;
  battle = new Battle([...deployment.placements, ...enemies(level)]);
  notice("戰鬥開始。部署已鎖定，可暫停與調整速度。");
  document
    .querySelectorAll<HTMLButtonElement>(
      "[data-char],[data-level],#reset,#remove,#start",
    )
    .forEach((b) => (b.disabled = true));
  updateHUD();
}
function updateHUD() {
  const summary = document.getElementById(
    "free-results",
  ) as HTMLButtonElement | null;
  if (summary) summary.disabled = !battle?.result;
  document.body.classList.toggle("battle-paused", battle?.paused ?? false);
  const alive = (team: string) =>
    battle
      ? battle.units.filter((u) => u.team === team && u.hp > 0).length
      : team === "player"
        ? deployment.placements.length
        : enemies(level).length;
  document.getElementById("counts")!.textContent =
    `我方 ${alive("player")} / 5 · 敵方 ${alive("enemy")}`;
  document.getElementById("timer")!.textContent =
    `${(battle?.time ?? 0).toFixed(2)} / 60.00`;
  document.getElementById("phase")!.textContent = battle?.result
    ? "戰鬥結束"
    : battle?.paused
      ? "已暫停"
      : battle
        ? "戰鬥階段"
        : "部署階段";
}
function result() {
  const r = battle!.result!;
  document.getElementById("result")!.innerHTML =
    `<div class="modal-backdrop"><section class="result panel" role="dialog" aria-modal="true" aria-label="戰鬥結算"><button id="close-free-result" class="modal-close" aria-label="關閉結算">×</button><div class="eyebrow">TRIAL COMPLETE / ${r.reason === "timeout" ? "超時結算" : "全滅結算"}</div><div class="crest">✧</div><h1>${r.winner === "player" ? "試煉勝利" : r.winner === "enemy" ? "試煉失敗" : "星庭平局"}</h1><p>${levels[level].name} · ${r.time.toFixed(2)} 秒</p><div class="result-stats"><span>我方存活<b>${r.playerAlive}</b></span><span>敵方存活<b>${r.enemyAlive}</b></span><span>造成傷害<b>${r.damage}</b></span><span>承受傷害<b>${r.taken}</b></span><span>治療總量<b>${r.healing}</b></span></div><div class="damage-list">${battle!.units
      .filter((u) => u.team === "player")
      .map((u) => `<p>${u.data.name}<span>${u.damage} 傷害</span></p>`)
      .join(
        "",
      )}</div>${button("again", "重新挑戰", "primary")}${button("return", "返回主選單")}</section></div>`;
  bind("close-free-result", () => {
    document.getElementById("result")!.innerHTML = "";
    document.getElementById("free-results")?.focus();
  });
  bind("again", prepare);
  bind("return", menu);
  document.getElementById("again")!.focus();
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    document.getElementById("close-free-result")?.click();
    const log = document.getElementById("free-log-panel");
    if (log && !log.hidden) document.getElementById("close-free-log")?.click();
  }
});
menu();
