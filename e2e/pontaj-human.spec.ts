import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test"

const HARNESS_URL = "/e2e/pontaj-human"
const AUTH_STATE = "e2e/.auth/admin.json"

async function mockCamera(page: Page, result: "granted" | "denied") {
  await page.addInitScript((cameraResult) => {
    const mediaDevices = {
      getUserMedia: async () => {
        if (cameraResult === "denied") {
          throw new DOMException("Camera permission denied", "NotAllowedError")
        }
        return {
          getTracks: () => [{ stop: () => undefined }],
        }
      },
    }
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: mediaDevices,
    })
  }, result)
}

async function newHumanContext(params: {
  browser: Browser
  camera: "granted" | "denied"
  location?: { latitude: number; longitude: number }
  permissions?: string[]
}): Promise<{ context: BrowserContext; page: Page }> {
  const context = await params.browser.newContext({
    baseURL: "http://127.0.0.1:3000",
    storageState: AUTH_STATE,
    geolocation: params.location,
    permissions: params.permissions ?? ["geolocation"],
  })
  const page = await context.newPage()
  await mockCamera(page, params.camera)
  return { context, page }
}

test.describe("Pontaj full human-like", () => {
  test("rutele reale de pontaj se încarcă prin auto-auth E2E", async ({ page }) => {
    await page.goto("/dashboard/resurse-umane/pontaj", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/resurse-umane\/condica-prezenta/)

    await page.goto("/dashboard/resurse-umane/pontaj/dashboard", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/resurse-umane\/pontaj\/dashboard/)
    await expect(page.getByText("Vizualizare pontaje și statistici")).toBeVisible({ timeout: 30_000 })

    await page.goto("/dashboard/resurse-umane/pontaj/sync", { waitUntil: "domcontentloaded" })
    await expect(page).toHaveURL(/\/dashboard\/resurse-umane\/pontaj\/sync/)
    await expect(page.getByText("Sincronizează pontajul pentru o zi specifică")).toBeVisible({ timeout: 30_000 })
  })

  test("field: cameră permisă + geolocație la birou + sync condică + reconciliere", async ({ browser }) => {
    const { context, page } = await newHumanContext({
      browser,
      camera: "granted",
      location: { latitude: 44.43, longitude: 26.1 },
    })
    try {
      await page.goto(HARNESS_URL)
      await expect(page.getByTestId("pontaj-human-title")).toBeVisible()

      await page.getByTestId("probe-location").click()
      await expect(page.getByTestId("attendance-mode")).toHaveText("office")
      await expect(page.getByTestId("location-lat")).toHaveText("44.43")

      await page.getByTestId("human-field-start").click()
      await expect(page.getByTestId("flow-message")).toHaveText("field_started")
      await expect(page.getByTestId("human-field-state")).toHaveText("active")
      await expect(page.getByTestId("selfie-status")).toHaveText("ok")

      await page.getByTestId("human-field-start").click()
      await expect(page.getByTestId("flow-message")).toHaveText("duplicate_active")

      await page.getByTestId("human-field-stop").click()
      await expect(page.getByTestId("flow-message")).toHaveText("field_stopped")
      await expect(page.getByTestId("human-field-state")).toHaveText("completed")

      await page.getByTestId("human-manual-sync").click()
      await expect(page.getByTestId("human-has-pontaj")).toHaveText("true")
      await expect(page.getByTestId("human-has-overtime")).toHaveText("true")
      await expect(page.getByTestId("human-has-manual")).toHaveText("true")
      await expect(page.getByTestId("human-timesheet-hours")).toHaveText("10.5")
      await expect(page.getByTestId("human-reconciliation-status")).toHaveText("confirmed")
      await expect(page.getByTestId("human-reconciliation-found")).toHaveText("90")
      await expect(page.getByTestId("human-reconciliation-diff")).toHaveText("0")

      await page.getByTestId("human-problems-only").check()
      await expect(page.getByTestId("human-reconciliation-visible")).toHaveText("false")
    } finally {
      await context.close()
    }
  })

  test("field: cameră refuzată continuă fără selfie, dar locația rămâne obligatorie", async ({ browser }) => {
    const { context, page } = await newHumanContext({
      browser,
      camera: "denied",
      location: { latitude: 44.5, longitude: 26.2 },
    })
    try {
      await page.goto(HARNESS_URL)
      await page.getByTestId("human-field-start").click()

      await expect(page.getByTestId("selfie-status")).toHaveText("missing")
      await expect(page.getByTestId("flow-message")).toHaveText("field_started")
      await expect(page.getByTestId("attendance-mode")).toHaveText("field")
      await expect(page.getByTestId("human-field-state")).toHaveText("active")
    } finally {
      await context.close()
    }
  })

  test("field: geolocație refuzată blochează startul chiar dacă selfie-ul merge", async ({ browser }) => {
    const { context, page } = await newHumanContext({
      browser,
      camera: "granted",
      permissions: [],
    })
    try {
      await page.goto(HARNESS_URL)
      await page.getByTestId("human-field-start").click()

      await expect(page.getByTestId("selfie-status")).toHaveText("ok")
      await expect(page.getByTestId("flow-message")).toHaveText("location_error")
      await expect(page.getByTestId("human-field-state")).toHaveText("idle")
    } finally {
      await context.close()
    }
  })

  test("kiosk: selfie obligatoriu, fallback la locația biroului și stop complet", async ({ browser }) => {
    const { context, page } = await newHumanContext({
      browser,
      camera: "granted",
      permissions: [],
    })
    try {
      await page.goto(HARNESS_URL)
      await page.getByTestId("human-kiosk-start").click()

      await expect(page.getByTestId("flow-message")).toHaveText("kiosk_started")
      await expect(page.getByTestId("human-kiosk-state")).toHaveText("active")
      await expect(page.getByTestId("attendance-mode")).toHaveText("office")

      await page.getByTestId("human-kiosk-stop").click()
      await expect(page.getByTestId("flow-message")).toHaveText("kiosk_stopped")
      await expect(page.getByTestId("human-kiosk-state")).toHaveText("completed")
    } finally {
      await context.close()
    }
  })

  test("kiosk: camera refuzată blochează startul pentru că selfie-ul este obligatoriu", async ({ browser }) => {
    const { context, page } = await newHumanContext({
      browser,
      camera: "denied",
      location: { latitude: 44.43, longitude: 26.1 },
    })
    try {
      await page.goto(HARNESS_URL)
      await page.getByTestId("human-kiosk-start").click()

      await expect(page.getByTestId("selfie-status")).toHaveText("required_failed")
      await expect(page.getByTestId("flow-message")).toHaveText("kiosk_camera_required")
      await expect(page.getByTestId("human-kiosk-state")).toHaveText("idle")
    } finally {
      await context.close()
    }
  })
})
