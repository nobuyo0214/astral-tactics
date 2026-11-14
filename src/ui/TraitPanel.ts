import { calculateTraits } from "../game/traits/calculator";
import { TraitRegistry } from "../game/traits/registry";
import { characterById, skills } from "../game/data/characters";
import type { Placement, Team } from "../game/core/types";
import type { ActiveTrait, TraitSnapshot } from "../game/traits/types";
export class TraitPanel {
  private team: Team = "player";
  private page = 0;
  private rows: ActiveTrait[] = [];
  private placements: Placement[] = [];
  private locked: TraitSnapshot | null = null;
  private signature = "";
  private resize = () => this.hide();
  private tooltip = document.createElement("div");
  private escape = (e: KeyboardEvent) => {
    if (e.key === "Escape") this.hide();
  };
  constructor(private host: HTMLElement) {
    this.tooltip.className = "trait-tooltip";
    this.tooltip.role = "tooltip";
    this.tooltip.hidden = true;
    document.body.append(this.tooltip);
    document.addEventListener("keydown", this.escape);
    window.addEventListener("resize", this.resize);
  }
  update(placements: Placement[], locked: TraitSnapshot | null = null) {
    if (locked && locked === this.locked) return;
    const signature = placements
      .map((p) => p.team + p.characterId)
      .sort()
      .join("|");
    if (!locked && !this.locked && signature === this.signature) return;
    this.signature = signature;
    this.placements = placements;
    this.locked = locked;
    this.draw();
  }
  private draw() {
    this.rows = this.locked
      ? [...this.locked[this.team]]
      : calculateTraits(this.placements, this.team);
    const pages = Math.max(1, Math.ceil(this.rows.length / 6));
    this.page = Math.min(this.page, pages - 1);
    this.hide();
    this.host.innerHTML = `<div class="trait-team"><button data-team="player" class="${this.team === "player" ? "active" : ""}">我方羈絆</button><button data-team="enemy" class="${this.team === "enemy" ? "active" : ""}">敵方羈絆</button></div><p class="trait-caption">${this.locked ? "開戰快照已鎖定" : "僅計棋盤上不同角色"} · 2／4 人啟動</p><div class="trait-list">${
      this.rows
        .slice(this.page * 6, this.page * 6 + 6)
        .map(
          (t) =>
            `<button class="trait-row ${t.tier ? "active" : "inactive"}" data-trait="${t.definition.id}"><span style="color:#${t.definition.color.toString(16)}">${t.definition.icon}</span><strong>${t.definition.name}</strong><small>${t.count}/${t.next ?? 4} ${t.next ? "→" + t.next : "最高階"}</small></button>`,
        )
        .join("") || "<p>部署角色後顯示羈絆。</p>"
    }</div><div class="trait-pages"><button data-page="-1" ${this.page === 0 ? "disabled" : ""}>←</button><span>${this.page + 1} / ${pages}</span><button data-page="1" ${this.page === pages - 1 ? "disabled" : ""}>→</button></div>`;
    this.host.querySelectorAll<HTMLButtonElement>("[data-team]").forEach(
      (b) =>
        (b.onclick = () => {
          this.team = b.dataset.team as Team;
          this.page = 0;
          this.draw();
        }),
    );
    this.host.querySelectorAll<HTMLButtonElement>("[data-page]").forEach(
      (b) =>
        (b.onclick = () => {
          this.page += Number(b.dataset.page);
          this.draw();
        }),
    );
    this.host
      .querySelectorAll<HTMLButtonElement>("[data-trait]")
      .forEach((b) => {
        const show = () => {
          const t = this.rows.find((t) => t.definition.id === b.dataset.trait)!;
          this.show(
            `<h3>${t.definition.icon} ${t.definition.name} · ${t.count} 名</h3><p>${t.definition.description}</p>${t.definition.tiers.map((tier) => `<p><b>${tier.count} 人</b> ${tier.description}</p>`).join("")}<p>目前上場：${t.members.map((id) => characterById[id].name).join("、")}</p><p>${t.next ? `還需要 ${t.next - t.count} 名不同角色` : "已達最高階"}</p>`,
            b,
          );
        };
        b.onpointerenter = show;
        b.onfocus = show;
        b.onclick = show;
        b.onpointerleave = () => this.hide();
        b.onblur = () => this.hide();
      });
  }
  bindCard(el: HTMLElement, characterId: string) {
    const show = () => {
      const c = characterById[characterId],
        before = calculateTraits(this.placements, "player"),
        after = calculateTraits(
          [
            ...this.placements,
            { id: "preview", characterId, team: "player", x: 0, y: 7 },
          ],
          "player",
        );
      const traits = TraitRegistry.filter(
        (t) => t.name === c.faction || t.name === c.class,
      );
      const activates = after.filter(
        (t) =>
          t.tier &&
          t.tier.count >
            (before.find((a) => a.definition.id === t.definition.id)?.tier
              ?.count ?? 0),
      );
      this.show(
        `<h3>${c.name} · ${c.cost} 金幣 · ★</h3><p>${skills[c.skillId].name}：${skills[c.skillId].description}</p>${traits.map((t) => `<p>${t.icon} <b>${t.name}</b>：${t.tiers.map((s) => `${s.count}人 ${s.description}`).join("；")}</p>`).join("")}<p class="gold">${activates.length ? "購買並上場後，可啟動／升階：" + activates.map((t) => t.definition.name).join("、") : "購買不會計入羈絆，需實際上場。"}</p>`,
        el,
      );
    };
    el.onpointerenter = show;
    el.onpointerleave = () => this.hide();
    el.addEventListener("focusin", show);
    el.addEventListener("focusout", () => this.hide());
  }
  private show(html: string, anchor: HTMLElement) {
    this.tooltip.innerHTML = html;
    this.tooltip.hidden = false;
    const r = anchor.getBoundingClientRect(),
      box = this.tooltip.getBoundingClientRect();
    this.tooltip.style.left = `${Math.max(10, Math.min(innerWidth - box.width - 10, r.right + 8))}px`;
    this.tooltip.style.top = `${Math.max(10, Math.min(innerHeight - box.height - 10, r.top))}px`;
  }
  hide() {
    this.tooltip.hidden = true;
  }
  destroy() {
    this.tooltip.remove();
    document.removeEventListener("keydown", this.escape);
    window.removeEventListener("resize", this.resize);
  }
}
