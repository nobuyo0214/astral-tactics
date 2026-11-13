import { defineConfig } from "vitest/config";
export default defineConfig({
  base: "/astral-tactics/",
  test: { include: ["tests/*.test.ts"] },
  build: {
    rollupOptions: { output: { manualChunks: { phaser: ["phaser"] } } },
  },
});
