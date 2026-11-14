import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  // Cloud / CI software WebGL renderers share a GPU process. Keep interaction
  // timing reliable rather than competing across simultaneous game windows.
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://127.0.0.1:5173/astral-tactics/",
    headless: true,
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
      args: ["--no-sandbox"],
    },
    viewport: { width: 1366, height: 768 },
  },
  webServer: {
    command: "npm run dev -- --port 5173",
    url: "http://127.0.0.1:5173/astral-tactics/",
    reuseExistingServer: false,
  },
  reporter: "list",
});
