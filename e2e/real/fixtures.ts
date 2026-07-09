import { expect, test as base, type Page, type TestInfo } from "@playwright/test"

type BrowserProblem = {
  source: "console" | "pageerror"
  message: string
}

function isIgnoredConsoleError(message: string) {
  return [
    "ResizeObserver loop completed",
    "ResizeObserver loop limit exceeded",
  ].some((needle) => message.includes(needle))
}

async function attachDiagnostics(testInfo: TestInfo, problems: BrowserProblem[]) {
  if (!problems.length) return
  await testInfo.attach("browser-problems.json", {
    body: JSON.stringify(problems, null, 2),
    contentType: "application/json",
  })
}

export const test = base.extend<{ appPage: Page }>({
  appPage: async ({ page }, use, testInfo) => {
    const problems: BrowserProblem[] = []

    page.on("console", (msg) => {
      if (msg.type() !== "error") return
      const text = msg.text()
      if (isIgnoredConsoleError(text)) return
      problems.push({ source: "console", message: text })
    })

    page.on("pageerror", (error) => {
      problems.push({ source: "pageerror", message: error.message })
    })

    await use(page)
    await attachDiagnostics(testInfo, problems)
    expect(problems, "Critical browser console/page errors").toEqual([])
  },
})

export { expect }

export async function expectAppShell(page: Page) {
  await expect(page.locator("body")).toBeVisible()
  await expect(page.getByText(/Autentificare/i)).toHaveCount(0)
}

export async function closeTopmostDialog(page: Page) {
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 10_000 })
}
