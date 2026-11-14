import { PNG } from "pngjs";
import { test, expect, type Page } from "@playwright/test";
import { createRun } from "../../src/game/run/run";
import { initialPool } from "../../src/game/run/shop";
import { encodeSave } from "../../src/game/run/save";
import { writeFileSync } from "node:fs";
function fixture() {
  const s = createRun(19);
  s.player.level = 4;
  s.pool = initialPool();
  s.units = [
    {
      id: "p0",
      characterId: "flame",
      starLevel: 1,
      location: { zone: "board", cell: { x: 2, y: 4 } },
    },
    {
      id: "p1",
      characterId: "ember",
      starLevel: 1,
      location: { zone: "board", cell: { x: 4, y: 4 } },
    },
    {
      id: "p2",
      characterId: "plume",
      starLevel: 1,
      location: { zone: "bench", slot: 0 },
    },
  ];
  s.nextUnitId = 3;
  s.shop.slots = ["cinder", "rime", "relay", "leaf", "briar"].map(
    (characterId) => ({ characterId }),
  );
  for (const u of s.units) s.pool[u.characterId]--;
  for (const slot of s.shop.slots) s.pool[slot.characterId!]--;
  return s;
}
async function bounds(page: Page) {
  return page.evaluate(() => {
    const elements = Array.from(
      document.querySelectorAll(
        ".run-arena canvas,.bench-slot,.shop-card,.command-sidebar button,.info-tabs button,.trait-row",
      ),
    );
    return {
      doc:
        document.documentElement.scrollWidth <= innerWidth &&
        document.documentElement.scrollHeight <= innerHeight,
      bad: elements
        .filter((e) => {
          const b = e.getBoundingClientRect();
          return (
            b.width > 0 &&
            (b.left < 0 ||
              b.top < 0 ||
              b.right > innerWidth + 0.5 ||
              b.bottom > innerHeight + 0.5)
          );
        })
        .map((e) => e.id || e.className),
      panels: Array.from(
        document.querySelectorAll(".unit-sidebar,.command-sidebar,.shop-card"),
      )
        .filter(
          (e) =>
            e.scrollHeight > e.clientHeight + 1 ||
            e.scrollWidth > e.clientWidth + 1,
        )
        .map((e) => e.className),
    };
  });
}
async function tooltipBounds(page: Page) {
  await expect(page.getByRole("tooltip")).toBeVisible();
  expect(
    await page.getByRole("tooltip").evaluate((e) => {
      const b = e.getBoundingClientRect();
      return (
        b.left >= 0 &&
        b.top >= 0 &&
        b.right <= innerWidth &&
        b.bottom <= innerHeight
      );
    }),
  ).toBe(true);
}
for (const [width, height] of [
  [1280, 720],
  [1366, 768],
  [1600, 900],
  [1920, 1080],
])
  test(`P3 ${width}×${height} 羈絆、Tooltip、購買部署與完整回合`, async ({
    page,
  }) => {
    test.setTimeout(70000);
    await page.setViewportSize({ width, height });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("./");
    await page.evaluate(
      (raw) => localStorage.setItem("astral-run-v2", raw),
      encodeSave(fixture()),
    );
    await page.reload();
    await page.locator("#run-continue").click();
    await page.locator('[data-info-tab="traits"]').click();
    await expect(page.locator('[data-trait="burn"]')).toContainText("2/4");
    await page.locator(".shop-card").first().hover();
    await tooltipBounds(page);
    await expect(page.getByRole("tooltip")).toContainText("需實際上場");
    await page.keyboard.press("Escape");
    const canvas = page.locator("canvas");
    let box = (await canvas.boundingBox())!;
    await page.locator('[data-bench-slot="0"]').dragTo(canvas, {
      targetPosition: {
        x: ((29 + 1 * 66 + 33) * box.width) / 520,
        y: ((20 + 6 * 66 + 33) * box.height) / 568,
      },
    });
    await page.locator('[data-info-tab="traits"]').click();
    await expect(page.locator('[data-trait="burn"]')).toContainText("3/4");
    await page.locator(".shop-card").first().hover();
    await tooltipBounds(page);
    await expect(page.getByRole("tooltip")).toContainText("購買並上場");
    await page.keyboard.press("Escape");
    await page.locator('[data-buy="0"]').click();
    await page.locator('[data-info-tab="traits"]').click();
    await expect(page.locator('[data-trait="burn"]')).toContainText("3/4");
    box = (await canvas.boundingBox())!;
    await page.locator('[data-bench-slot="0"]').dragTo(canvas, {
      targetPosition: {
        x: ((29 + 5 * 66 + 33) * box.width) / 520,
        y: ((20 + 5 * 66 + 33) * box.height) / 568,
      },
    });
    await expect(page.locator('[data-trait="burn"]')).toContainText("4/4");
    await expect(page.locator('[data-trait="burn"]')).toContainText("最高階");
    await page.locator('[data-trait="burn"]').hover();
    await tooltipBounds(page);
    await expect(page.getByRole("tooltip")).toContainText("燼影遊俠");
    await page.mouse.move(10, 10);
    expect(await bounds(page)).toEqual({ doc: true, bad: [], panels: [] });
    const pixels = PNG.sync.read(await canvas.screenshot());
    // Sample the interior of three empty cells, including the formerly missing
    // bottom-right corner. A blank canvas or a half-shifted texture must fail.
    const color = (x: number, y: number) => {
      const px = Math.floor(((29 + x * 66 + 18) * pixels.width) / 520),
        py = Math.floor(((20 + y * 66 + 18) * pixels.height) / 568),
        i = (py * pixels.width + px) * 4;
      return [pixels.data[i], pixels.data[i + 1], pixels.data[i + 2]];
    };
    for (const [x, y] of [
      [0, 0],
      [6, 3],
      [6, 7],
    ]) {
      const [r, g, b] = color(x, y);
      expect(r).toBeGreaterThan(16);
      expect(b).toBeGreaterThan(35);
      if (y < 4) expect(r).toBeGreaterThan(30);
      else expect(g).toBeGreaterThan(38);
    }
    await page.screenshot({
      path: `public/screenshots/p3-traits-${width}x${height}.png`,
      fullPage: false,
    });
    await page.locator("#run-start").click();
    await page.locator("#run-pause").click();
    await page.locator('[data-info-tab="traits"]').click();
    await expect(page.locator(".trait-caption")).toContainText("已鎖定");
    await page.locator('[data-run-speed="4"]').click();
    await page.locator("#run-pause").click();
    await expect(page.getByRole("dialog")).toBeVisible({ timeout: 25000 });
    await page.locator("#run-next").click();
    await expect(page.locator("#run-title")).toContainText("第 2");
    expect(await bounds(page)).toEqual({ doc: true, bad: [], panels: [] });
    expect(errors).toEqual([]);
  });
test("自由戰鬥分頁可選新角色、羈絆面板與32名圖鑑完整", async ({ page }) => {
  await page.goto("./");
  await page.locator("#play").click();
  await page.locator("#roster-next").click();
  await expect(page.locator('[data-char="cinder"]')).toBeVisible();
  await page.locator('[data-char="cinder"]').click();
  const b = (await page.locator("canvas").boundingBox())!;
  await page.mouse.click(
    b.x + ((29 + 3 * 66 + 33) * b.width) / 520,
    b.y + ((20 + 4 * 66 + 33) * b.height) / 568,
  );
  await page.locator("#free-traits-tab").click();
  await expect(page.locator('[data-trait="assassin"]')).toBeVisible();
  await page.locator("#home").click();
  await page.locator("#codex").click();
  await expect(page.locator(".character")).toHaveCount(32);
});
test("P3召喚與狀態壓力場景幀時間採樣（非硬體60FPS承諾）", async ({ page }) => {
  test.setTimeout(70000);
  const reports: unknown[] = [];
  for (const low of [false, true]) {
    const s = fixture();
    s.player.level = 8;
    s.round = {
      number: 10,
      phase: "preparation",
      settledThrough: 9,
      lastResult: {
        winner: "draw",
        reason: "timeout",
        time: 60,
        playerAlive: 1,
        enemyAlive: 1,
        damage: 0,
        taken: 0,
        healing: 0,
      },
    };
    s.stats.completedRounds = 9;
    s.economy.lastIncome = {
      base: 5,
      interest: 0,
      streak: 0,
      special: 0,
      total: 5,
    };
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
    await page.goto("./");
    await page.evaluate(
      ({ raw, low }) => {
        localStorage.setItem("astral-run-v2", raw);
        localStorage.setItem(
          "astral-settings",
          JSON.stringify({
            sound: false,
            animations: !low,
            quality: low ? "low" : "high",
          }),
        );
      },
      { raw: encodeSave(s), low },
    );
    await page.reload();
    await page.locator("#run-continue").click();
    await page.locator('[data-run-speed="4"]').click();
    await page.locator("#run-start").click();
    const sample = await page.evaluate(async () => {
      const times: number[] = [];
      let last = performance.now();
      for (let i = 0; i < 90; i++)
        await new Promise<void>((resolve) =>
          requestAnimationFrame((t) => {
            times.push(t - last);
            last = t;
            resolve();
          }),
        );
      times.sort((a, b) => a - b);
      return {
        samples: times.length,
        medianMs: times[45],
        p95Ms: times[85],
        timer: document.getElementById("run-timer")!.textContent,
        skillLog: document.getElementById("run-log")!.textContent,
      };
    });
    reports.push({ quality: low ? "animations off / low" : "high", ...sample });
    expect(sample.samples).toBe(90);
    expect(sample.p95Ms).toBeLessThan(1000);
  }
  writeFileSync(
    "docs/browser-frame-sample.json",
    JSON.stringify(
      {
        environment:
          "Linux headless Chromium software WebGL, 8 summoner/frost vs round10, 4x",
        reports,
      },
      null,
      2,
    ) + "\n",
  );
});
