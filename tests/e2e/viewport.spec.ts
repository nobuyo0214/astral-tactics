import { test, expect, type Page, type Locator } from "@playwright/test";
const sizes = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 },
];
const controls = [
  "#shop-refresh",
  "#buy-xp",
  "#shop-lock",
  "#run-start",
  "#run-pause",
  '[data-run-speed="1"]',
  '[data-run-speed="2"]',
  '[data-run-speed="4"]',
  "#run-home",
  "#run-to-bench",
  "#run-sell",
  "#run-results",
];
async function inViewport(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const b = (await locator.boundingBox())!,
    v = page.viewportSize()!;
  expect(b.x).toBeGreaterThanOrEqual(-0.5);
  expect(b.y).toBeGreaterThanOrEqual(-0.5);
  expect(b.x + b.width).toBeLessThanOrEqual(v.width + 0.5);
  expect(b.y + b.height).toBeLessThanOrEqual(v.height + 0.5);
}
async function unobscured(page: Page, locator: Locator) {
  await inViewport(page, locator);
  expect(
    await locator.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2,
      );
      return !!hit && (hit === el || el.contains(hit));
    }),
  ).toBe(true);
}
async function layout(page: Page) {
  const report = await page.evaluate((selectors) => {
    const selector =
      selectors.join(",") +
      ",canvas,#run-top,#run-notice,.bench-slot,.shop-card,[data-buy]";
    const elements = Array.from(
      document.querySelectorAll<HTMLElement>(selector),
    );
    return {
      bench: document.querySelectorAll(".bench-slot").length,
      shop: document.querySelectorAll(".shop-card").length,
      overflow: [
        document.documentElement,
        document.body,
        document.querySelector(".run-arena")!,
      ].map((e) => [
        e.scrollWidth <= innerWidth,
        e.scrollHeight <= innerHeight,
      ]),
      bad: elements.flatMap((el) => {
        const b = el.getBoundingClientRect(),
          hit = document.elementFromPoint(
            b.x + b.width / 2,
            b.y + b.height / 2,
          );
        return b.width <= 0 ||
          b.height <= 0 ||
          b.x < -0.5 ||
          b.y < -0.5 ||
          b.right > innerWidth + 0.5 ||
          b.bottom > innerHeight + 0.5 ||
          !hit ||
          !(hit === el || el.contains(hit))
          ? [el.id || el.className]
          : [];
      }),
      panels: Array.from(
        document.querySelectorAll(
          ".command-sidebar,.unit-sidebar,.shop-panel,.bench-panel,.shop-card",
        ),
      )
        .filter(
          (el) =>
            el.scrollHeight > el.clientHeight + 1 ||
            el.scrollWidth > el.clientWidth + 1,
        )
        .map((el) => el.className),
      ratio: (() => {
        const b = document.querySelector("canvas")!.getBoundingClientRect();
        return b.width / b.height;
      })(),
    };
  }, controls);
  expect(report.bench).toBe(9);
  expect(report.shop).toBe(5);
  expect(report.overflow).toEqual([
    [true, true],
    [true, true],
    [true, true],
  ]);
  expect(report.bad).toEqual([]);
  expect(report.panels).toEqual([]);
  expect(report.ratio).toBeCloseTo(520 / 568, 2);
}
async function point(page: Page, x: number, y: number) {
  const b = (await page.locator("canvas").boundingBox())!;
  return {
    x: b.x + ((29 + x * 66 + 33) * b.width) / 520,
    y: b.y + ((20 + y * 66 + 33) * b.height) / 568,
  };
}
async function clickCell(page: Page, x: number, y: number) {
  const p = await point(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function dragCell(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  const a = await point(page, from.x, from.y),
    b = await point(page, to.x, to.y);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: 6 });
  await page.mouse.up();
}
async function saved(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("astral-run-v2")!).run,
  );
}
async function buyAndDeploy(page: Page) {
  await page.locator('[data-buy="0"]').click();
  await page.locator('[data-buy="1"]').click();
  await page.locator('[data-bench-slot="0"]').click();
  await clickCell(page, 2, 6);
  const canvas = page.locator("canvas"),
    b = (await canvas.boundingBox())!;
  await page.locator('[data-bench-slot="1"]').dragTo(canvas, {
    targetPosition: {
      x: ((29 + 4 * 66 + 33) * b.width) / 520,
      y: ((20 + 6 * 66 + 33) * b.height) / 568,
    },
  });
  await expect(page.locator("#run-field-count")).toHaveText("2 / 2");
}
for (const size of sizes)
  test(`單畫面 ${size.width}×${size.height}：全部邊界、購買、交換、暫停、結算與下一回合`, async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.setViewportSize(size);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./");
    await page.locator("#run-new").click();
    await expect(page.locator("canvas")).toBeVisible();
    await layout(page);
    await buyAndDeploy(page);
    await layout(page);
    await dragCell(page, { x: 2, y: 6 }, { x: 4, y: 6 });
    let state = await saved(page);
    expect(
      state.units.find((u: { id: string }) => u.id === "p0").location.cell,
    ).toEqual({ x: 4, y: 6 });
    expect(
      state.units.find((u: { id: string }) => u.id === "p1").location.cell,
    ).toEqual({ x: 2, y: 6 });
    await page.locator('[data-info-tab="economy"]').click();
    await layout(page);
    await expect(page.locator("#run-economy")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#run-info")).toBeVisible();
    await page.locator("#show-unit-skill").click();
    await expect(page.locator("#run-skill")).toBeVisible();
    await layout(page);
    await page.keyboard.press("Escape");
    await page.locator("#shop-refresh").click();
    await page.locator("#buy-xp").click();
    await page.locator("#shop-lock").click();
    await expect(page.locator("#run-level")).toContainText("Lv.3");
    await page.locator('[data-run-speed="4"]').click();
    await layout(page);
    await page.screenshot({
      path: `public/screenshots/single-screen-${size.width}x${size.height}.png`,
      fullPage: false,
    });
    const positions = await Promise.all(
      controls.map((s) => page.locator(s).boundingBox()),
    );
    await page.mouse.wheel(200, 600);
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => ({ x: scrollX, y: scrollY }))).toEqual({
      x: 0,
      y: 0,
    });
    await page.locator('[data-run-speed="1"]').click();
    await page.locator("#run-start").click();
    await page.locator("#run-pause").click();
    const time = await page.locator("#run-timer").textContent();
    await page.waitForTimeout(200);
    await expect(page.locator("#run-timer")).toHaveText(time!);
    await layout(page);
    for (let i = 0; i < controls.length; i++) {
      const b = (await page.locator(controls[i]).boundingBox())!;
      expect(b.x).toBeCloseTo(positions[i]!.x, 0);
      expect(b.y).toBeCloseTo(positions[i]!.y, 0);
    }
    await page.locator('[data-run-speed="2"]').click();
    await page.locator('[data-run-speed="4"]').click();
    await page.locator("#run-pause").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 25000 });
    await inViewport(page, page.getByRole("dialog"));
    for (const s of ["#run-next", "#run-result-home", "#close-run-result"])
      await unobscured(page, page.locator(s));
    expect(
      await page
        .getByRole("dialog")
        .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.locator("#run-results").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.locator("#run-next").click();
    await expect(page.locator("#run-title")).toContainText("第 2 / 10");
    await layout(page);
    await page.locator('[data-info-tab="economy"]').click();
    await layout(page);
    expect(errors).toEqual([]);
  });
test("視窗連續改變尺寸後，邊緣棋格點選、原生拖曳、交換與拖回均準確", async ({
  page,
}) => {
  test.setTimeout(90000);
  await page.goto("./");
  await page.locator("#run-new").click();
  await buyAndDeploy(page);
  for (const size of [sizes[0], sizes[3], sizes[1], sizes[2]]) {
    await page.setViewportSize(size);
    await page.waitForTimeout(150);
    await layout(page);
    const units = (await saved(page)).units;
    const a = units.find((u: { id: string }) => u.id === "p0").location.cell,
      b = units.find((u: { id: string }) => u.id === "p1").location.cell;
    await dragCell(page, a, b);
    expect(
      (await saved(page)).units.find((u: { id: string }) => u.id === "p0")
        .location.cell,
    ).toEqual(b);
    const p = await point(page, b.x, b.y),
      bench = (await page.locator('[data-bench-slot="8"]').boundingBox())!;
    await page.mouse.move(p.x, p.y);
    await page.mouse.down();
    await page.mouse.move(
      bench.x + bench.width / 2,
      bench.y + bench.height / 2,
      { steps: 6 },
    );
    await page.mouse.up();
    await expect(page.locator('[data-bench-slot="8"]')).toHaveAttribute(
      "data-owned",
      "p0",
    );
    const other = (await saved(page)).units.find(
      (u: { id: string }) => u.id === "p1",
    ).location.cell;
    const corner = [
      { x: 0, y: 4 },
      { x: 6, y: 4 },
      { x: 0, y: 7 },
      { x: 6, y: 7 },
    ].find((c) => c.x !== other.x || c.y !== other.y)!;
    const canvas = page.locator("canvas"),
      box = (await canvas.boundingBox())!;
    await page.locator('[data-bench-slot="8"]').dragTo(canvas, {
      targetPosition: {
        x: ((29 + corner.x * 66 + 33) * box.width) / 520,
        y: ((20 + corner.y * 66 + 33) * box.height) / 568,
      },
    });
    expect(
      (await saved(page)).units.find((u: { id: string }) => u.id === "p0")
        .location.cell,
    ).toEqual(corner);
    await expect(page.locator("#run-field-count")).toHaveText("2 / 2");
  }
});
test("P1 自由戰鬥亦維持單畫面與全部操作", async ({ page }) => {
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.goto("./");
    await page.locator("#play").click();
    await expect(page.locator("canvas")).toBeVisible();
    const report = await page.evaluate(() => {
      const all = Array.from(
        document.querySelectorAll(
          "canvas,#start,#reset,#retry,#remove,#home,#free-log-toggle,#free-results,[data-char]",
        ),
      );
      return {
        count: all.length,
        overflow:
          document.documentElement.scrollHeight > innerHeight ||
          document.documentElement.scrollWidth > innerWidth,
        bad: all
          .filter((el) => {
            const r = el.getBoundingClientRect(),
              hit = document.elementFromPoint(
                r.x + r.width / 2,
                r.y + r.height / 2,
              );
            return (
              r.x < 0 ||
              r.y < 0 ||
              r.right > innerWidth + 0.5 ||
              r.bottom > innerHeight + 0.5 ||
              !hit ||
              !(hit === el || el.contains(hit))
            );
          })
          .map((e) => e.id || e.className),
      };
    });
    expect(report.count).toBe(20);
    expect(report.bad).toEqual([]);
    expect(report.overflow).toBe(false);
    await clickCell(page, 6, 7);
    await expect(page.locator("#counts")).toContainText("我方 1");
    await page.locator("#free-log-toggle").click();
    await inViewport(page, page.getByRole("dialog", { name: "戰場紀錄" }));
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "戰場紀錄" })).toHaveCount(0);
  }
});
test("1280×720 的十八名持有角色最終結算完整可見且可關閉", async ({ page }) => {
  const { Run, createRun } = await import("../../src/game/run/run");
  const { initialPool } = await import("../../src/game/run/shop");
  const { characters } = await import("../../src/game/data/characters");
  const { encodeSave } = await import("../../src/game/run/save");
  const state = createRun(42);
  state.player.level = 9;
  state.pool = initialPool();
  state.shop.slots = Array.from({ length: 5 }, () => ({ characterId: null }));
  state.units = Array.from({ length: 18 }, (_, i) => ({
    id: `p${i}`,
    characterId: characters[i % 12].id,
    starLevel: 1,
    location:
      i < 9
        ? { zone: "board", cell: { x: i % 7, y: 4 + Math.floor(i / 7) } }
        : { zone: "bench", slot: i - 9 },
  }));
  state.nextUnitId = 18;
  for (const u of state.units) state.pool[u.characterId]--;
  const run = new Run(state);
  for (let r = 0; r < 10; r++) {
    run.beginCombat();
    run.battle!.speed = 4;
    for (let step = 0; step < 100 && !run.battle!.result; step++)
      run.battle!.advance(0.25);
    expect(run.settle().ok).toBe(true);
    if (r < 9) expect(run.nextRound().ok).toBe(true);
  }
  expect(run.state.round.phase).toBe("completed");
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto("./");
  await page.evaluate(
    (raw) => localStorage.setItem("astral-run-v2", raw),
    encodeSave(run.state),
  );
  await page.reload();
  await page.locator("#run-continue").click();
  const modal = page.getByRole("dialog");
  await expect(modal.locator(".damage-list p")).toHaveCount(18);
  await inViewport(page, modal);
  expect(
    await modal.evaluate(
      (el) =>
        el.scrollHeight <= el.clientHeight + 1 &&
        el.scrollWidth <= el.clientWidth + 1,
    ),
  ).toBe(true);
  for (const s of ["#run-restart", "#run-result-home", "#close-run-result"])
    await unobscured(page, page.locator(s));
  await page.locator("#close-run-result").click();
  await layout(page);
  await page.locator("#run-results").click();
  await expect(modal).toBeVisible();
});
