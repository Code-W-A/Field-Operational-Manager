import { defineConfig, devices } from "@playwright/test"

const baseURL = process.env.E2E_BASE_URL || "https://fom-nrg.vercel.app"

export default defineConfig({
  testDir: "./e2e/real",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report-real" }]],
  globalSetup: "./e2e/real/global-setup.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 20_000,
    navigationTimeout: 45_000,
    permissions: ["geolocation", "camera"],
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
  },
  projects: [
    {
      name: "real-chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
          ],
        },
      },
    },
  ],
})
