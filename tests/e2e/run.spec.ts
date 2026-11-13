import { test, expect, type Page } from "@playwright/test";
async function boardPoint(page: Page, x: number, y: number) {
  const box = (await page.locator("canvas").boundingBox())!;
  return {
    x: box.x + ((29 + x * 66 + 33) * box.width) / 520,
    y: box.y + ((20 + y * 66 + 33) * box.height) / 568,
  };
}
async function cell(page: Page, x: number, y: number) {
  await page.locator("canvas").scrollIntoViewIfNeeded();
  const p = await boardPoint(page, x, y);
  await page.mouse.click(p.x, p.y);
}
async function saved(page: Page) {
  return page.evaluate(
    () => JSON.parse(localStorage.getItem("astral-run-v2")!).run,
  );
}
for (const width of [1366, 1920])
  test(`P2 ${width}：購買／部署／商店／XP／檢查點／回合／P1回歸`, async ({
    page,
  }) => {
    test.setTimeout(70000);
    await page.setViewportSize({ width, height: width === 1366 ? 768 : 1080 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./");
    await page.locator("#run-new").click();
    await expect(page.locator("canvas")).toBeVisible();
    await expect(page.locator("#run-gold")).toContainText("10");
    await expect(page.locator("[data-bench-slot]")).toHaveCount(9);
    await expect(page.locator(".shop-card")).toHaveCount(5);
    await page.locator("#run-start").click();
    await expect(page.locator("#run-notice")).toContainText("至少一名");
    await page.locator('[data-buy="0"]').click();
    await page.locator('[data-buy="1"]').click();
    await expect(page.locator("#run-gold")).toContainText("8");
    await page.locator('[data-bench-slot="0"]').click();
    await cell(page, 2, 7);
    await expect(page.locator("#run-field-count")).toHaveText("1 / 2");
    // Native drag from bench to Phaser canvas using its displayed coordinates.
    const canvas = page.locator("canvas");
    await canvas.scrollIntoViewIfNeeded();
    const box = (await canvas.boundingBox())!;
    await page
      .locator('[data-bench-slot="1"]')
      .dragTo(canvas, {
        targetPosition: {
          x: ((29 + 4 * 66 + 33) * box.width) / 520,
          y: ((20 + 7 * 66 + 33) * box.height) / 568,
        },
      });
    await expect(page.locator("#run-field-count")).toHaveText("2 / 2");
    await page.locator("#shop-refresh").click();
    await expect(page.locator("#run-gold")).toContainText("6");
    await page.locator("#buy-xp").click();
    await expect(page.locator("#run-level")).toContainText("Lv.3");
    await expect(page.locator("#run-gold")).toContainText("2");
    await page.locator("#shop-lock").click();
    const before = await saved(page);
    expect(before.shop.locked).toBe(true);
    await page.locator('[data-run-speed="4"]').click();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width === 1920)
      await page.screenshot({ path: "public/p2-economy.png", fullPage: true });
    await page.locator("#run-start").click();
    await expect(page.locator("#run-phase")).toHaveText("戰鬥階段");
    await expect(page.locator("[data-buy]").first()).toBeDisabled();
    await expect(page.locator("#shop-refresh")).toBeDisabled();
    await page.reload();
    await page.locator("#run-continue").click();
    await expect(page.locator("#run-phase")).toHaveText("準備階段");
    expect((await saved(page)).units).toEqual(before.units);
    expect((await saved(page)).economy.gold).toBe(2);
    await page.locator('[data-run-speed="4"]').click();
    await page.locator("#run-start").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 25000 });
    const settled = await saved(page);
    expect(settled.round.settledThrough).toBe(1);
    expect(settled.stats.completedRounds).toBe(1);
    await page.reload();
    await page.locator("#run-continue").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect((await saved(page)).economy.gold).toBe(settled.economy.gold);
    await page.locator("#run-next").click();
    await expect(page.locator("#run-title")).toContainText("第 2 / 10");
    expect((await saved(page)).shop).toEqual(before.shop);
    const roundTwo = await saved(page);
    await page.reload();
    await page.locator("#run-continue").click();
    expect(await saved(page)).toEqual(roundTwo);
    await expect(page.locator("#run-timer")).toHaveText("0.00 / 60.00");
    await page.locator("#run-home").click();
    await page.locator("#play").click();
    await expect(page.locator("[data-char]")).toHaveCount(12);
    await expect(page.locator("[data-level]")).toHaveCount(3);
    await cell(page, 2, 4);
    await expect(page.locator("#counts")).toContainText("我方 1");
    expect(errors).toEqual([]);
  });
test("損壞與不相容存檔不阻擋主選單，可重新開始", async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => localStorage.setItem("astral-run-v2", "{broken"));
  await page.reload();
  await expect(page.locator("#run-continue")).toBeDisabled();
  await expect(page.locator("#menu-save")).toContainText("存檔已損壞");
  await page.locator("#run-new").click();
  await expect(page.locator("#run-gold")).toContainText("10");
  await page.locator("#run-home").click();
  await page.evaluate(() =>
    localStorage.setItem("astral-run-v2", JSON.stringify({ version: 999 })),
  );
  await page.reload();
  await expect(page.locator("#menu-save")).toContainText("版本不相容");
  await expect(page.locator("#run-continue")).toBeDisabled();
  await page.locator("#play").click();
  await expect(page.locator("canvas")).toBeVisible();
});
test("P2 備戰席交換、棋盤拖回備戰席與販售", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1600 });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("./");
  await page.locator("#run-new").click();
  await page.locator('[data-buy="0"]').click();
  await page.locator('[data-buy="1"]').click();
  await page
    .locator('[data-bench-slot="0"]')
    .dragTo(page.locator('[data-bench-slot="1"]'));
  expect(
    (await saved(page)).units.find((u: { id: string }) => u.id === "p0")
      .location.slot,
  ).toBe(1);
  await page.locator('[data-bench-slot="1"]').click();
  await cell(page, 3, 7);
  await expect(page.locator("#run-field-count")).toHaveText("1 / 2");
  await page.locator('[data-bench-slot="4"]').scrollIntoViewIfNeeded();
  const p = await boardPoint(page, 3, 7),
    target = (await page.locator('[data-bench-slot="4"]').boundingBox())!;
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 15 },
  );
  await page.mouse.up();
  await expect(page.locator('[data-bench-slot="4"]')).toHaveAttribute(
    "data-owned",
    "p0",
  );
  await expect(page.locator("#run-field-count")).toHaveText("0 / 2");
  await page.locator('[data-bench-slot="4"]').click();
  await expect(page.locator("#run-info")).toContainText("出售價格 1");
  await page.locator("#run-sell").click();
  await expect(page.locator("#run-gold")).toContainText("9");
  expect((await saved(page)).units).toHaveLength(1);
  await page.locator("#run-start").click();
  await expect(page.locator("#run-notice")).toContainText("至少一名");
  expect(errors).toEqual([]);
});
// Terminal views are restored from results produced by real core simulation.
test("十回合真實模擬存檔的最終畫面、重新開始及失敗畫面", async ({ page }) => {
  const { createRun, Run } = await import("../../src/game/run/run");
  const { initialPool } = await import("../../src/game/run/shop");
  const { encodeSave } = await import("../../src/game/run/save");
  const state = createRun(321);
  state.pool = initialPool();
  state.shop.slots = Array.from({ length: 5 }, () => ({ characterId: null }));
  state.units = [
    {
      id: "p0",
      characterId: "flame",
      starLevel: 3,
      location: { zone: "board", cell: { x: 2, y: 4 } },
    },
    {
      id: "p1",
      characterId: "leaf",
      starLevel: 3,
      location: { zone: "board", cell: { x: 4, y: 6 } },
    },
  ];
  state.nextUnitId = 2;
  state.pool.flame -= 9;
  state.pool.leaf -= 9;
  state.stats.highestStar = 3;
  const run = new Run(state);
  for (let i = 0; i < 10; i++) {
    expect(run.beginCombat().ok).toBe(true);
    run.battle!.speed = 4;
    for (let step = 0; step < 301 && !run.battle!.result; step++)
      run.battle!.advance(0.05);
    expect(run.settle().ok).toBe(true);
    if (i < 9) expect(run.nextRound().ok).toBe(true);
  }
  await page.goto("./");
  await page.evaluate(
    (raw) => localStorage.setItem("astral-run-v2", raw),
    encodeSave(run.state),
  );
  await page.reload();
  await page.locator("#run-continue").click();
  await expect(
    page.getByRole("heading", { name: "試煉完成", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".result-stats").last()).toContainText("完成回合");
  await expect(page.locator(".result-stats").last()).toContainText(
    String(run.state.stats.totalDamage),
  );
  await page.locator("#run-restart").click();
  await expect(page.locator("#run-title")).toContainText("第 1 / 10");
  await expect(page.locator("#run-gold")).toContainText("10");
  expect((await saved(page)).units).toHaveLength(0);
  const failing = structuredClone(state);
  failing.player.hp = 1;
  const loss = new Run(failing);
  loss.beginCombat();
  loss
    .battle!.units.filter((u) => u.team === "player")
    .forEach((u) => (u.hp = 0));
  loss.battle!.advance(0.05);
  loss.settle();
  await page.evaluate(
    (raw) => localStorage.setItem("astral-run-v2", raw),
    encodeSave(loss.state),
  );
  await page.reload();
  await page.locator("#run-continue").click();
  await expect(
    page.getByRole("heading", { name: "挑戰失敗", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#run-next")).toHaveCount(0);
});
