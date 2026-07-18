import path from "node:path"
import { defineConfig, devices } from "@playwright/test"

const projectId = "demo-fom-pontaj-e2e"
const baseURL = "http://127.0.0.1:3100"
const authDir = path.resolve("tests/e2e/.auth")
const useKioskFakeMedia = process.env.PONTAJ_KIOSK_FAKE_MEDIA === "true"

Object.assign(process.env, {
  E2E_PONTAJ_PROJECT_ID: projectId,
  GCLOUD_PROJECT: projectId,
  FIREBASE_CONFIG: JSON.stringify({ projectId, storageBucket: `${projectId}.appspot.com` }),
  FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080",
  FIREBASE_AUTH_EMULATOR_HOST: "127.0.0.1:9099",
  FIREBASE_STORAGE_EMULATOR_HOST: "127.0.0.1:9199",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  NEXT_PUBLIC_DISABLE_HR_SEED: "true",
  NEXT_PUBLIC_E2E_TEST_MODE: "false",
  NEXT_PUBLIC_SENTRY_DSN: "",
  SENTRY_DSN: "",
  SENTRY_AUTH_TOKEN: "",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: `${projectId}.firebaseapp.com`,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_APP_ID: "demo-app-id",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  APP_DEPLOYMENT_ENV: "local",
  MAIL_TRANSPORT_MODE: process.env.MAIL_TRANSPORT_MODE || "sink",
  MAIL_SINK_ALLOWED_DOMAINS: "e2e.invalid",
  PONTAJ_REUSE_NEXT_BUILD: "true",
})

const webServerEnv = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
)

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["json", { outputFile: "test-results/pontaj-stage6-results.json" }], ["html", { open: "never", outputFolder: "playwright-report-pontaj-stage6" }]],
  globalSetup: "./tests/e2e/pontaj/infrastructure/global-setup.ts",
  globalTeardown: "./tests/e2e/pontaj/infrastructure/global-teardown.ts",
  use: {
    baseURL,
    locale: "ro-RO",
    timezoneId: "Europe/Bucharest",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    permissions: ["geolocation"],
    geolocation: { latitude: 44.4268, longitude: 26.1025 },
    ...(useKioskFakeMedia
      ? { launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] } }
      : {}),
  },
  webServer: [
    {
      command: "node tests/e2e/pontaj/infrastructure/start-emulators.mjs",
      url: "http://127.0.0.1:4401",
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      env: {
        ...webServerEnv,
        HOME: "/private/tmp/fom-firebase-home",
        XDG_CACHE_HOME: "/private/tmp/fom-firebase-cache",
        XDG_CONFIG_HOME: "/private/tmp/fom-firebase-config",
        FIREBASE_CLI_DISABLE_UPDATE_CHECK: "true",
      },
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node tests/e2e/pontaj/infrastructure/start-next.mjs",
      url: `${baseURL}/login`,
      reuseExistingServer: false,
      timeout: 300_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
      env: webServerEnv,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "pontaj-vectors",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: path.join(authDir, "technician.json"),
      },
    },
  ],
})
