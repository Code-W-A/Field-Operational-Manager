import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "**/production-boundary.spec.ts",
  reporter: "list",
  workers: 1,
})
