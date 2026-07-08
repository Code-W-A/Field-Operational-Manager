import test from "node:test"
import assert from "node:assert/strict"
import {
  E2E_FAKE_NOW_STORAGE_KEY,
  getE2eFakeNowMs,
  parseE2eFakeNowMs,
  setE2eFakeNowMs,
} from "@/lib/utils/test-clock"

const originalEnv = process.env.NEXT_PUBLIC_E2E_TEST_MODE
const originalWindow = (globalThis as any).window

function installWindow(initialValue?: string) {
  const store = new Map<string, string>()
  if (initialValue != null) store.set(E2E_FAKE_NOW_STORAGE_KEY, initialValue)

  ;(globalThis as any).window = {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value)
      },
      removeItem: (key: string) => {
        store.delete(key)
      },
    },
  }

  return store
}

test.afterEach(() => {
  process.env.NEXT_PUBLIC_E2E_TEST_MODE = originalEnv
  ;(globalThis as any).window = originalWindow
})

test("parseE2eFakeNowMs accepts ISO strings, numeric strings, numbers and Date values", () => {
  const iso = "2026-03-10T08:00:00+02:00"
  const ms = new Date(iso).getTime()

  assert.equal(parseE2eFakeNowMs(iso), ms)
  assert.equal(parseE2eFakeNowMs(String(ms)), ms)
  assert.equal(parseE2eFakeNowMs(ms), ms)
  assert.equal(parseE2eFakeNowMs(new Date(ms)), ms)
})

test("parseE2eFakeNowMs rejects invalid values", () => {
  assert.equal(parseE2eFakeNowMs(""), null)
  assert.equal(parseE2eFakeNowMs("not-a-date"), null)
  assert.equal(parseE2eFakeNowMs(Number.NaN), null)
  assert.equal(parseE2eFakeNowMs(null), null)
})

test("getE2eFakeNowMs ignores localStorage when E2E mode is off", () => {
  process.env.NEXT_PUBLIC_E2E_TEST_MODE = "false"
  installWindow("2026-03-10T08:00:00+02:00")

  assert.equal(getE2eFakeNowMs(), null)
})

test("getE2eFakeNowMs reads localStorage only when E2E mode is on", () => {
  process.env.NEXT_PUBLIC_E2E_TEST_MODE = "true"
  const iso = "2026-03-10T08:00:00+02:00"
  installWindow(iso)

  assert.equal(getE2eFakeNowMs(), new Date(iso).getTime())
})

test("setE2eFakeNowMs writes and clears localStorage only in E2E mode", () => {
  process.env.NEXT_PUBLIC_E2E_TEST_MODE = "true"
  const store = installWindow()
  const iso = "2026-03-10T08:00:00+02:00"

  assert.equal(setE2eFakeNowMs(iso), new Date(iso).getTime())
  assert.equal(store.get(E2E_FAKE_NOW_STORAGE_KEY), iso)

  assert.equal(setE2eFakeNowMs(null), null)
  assert.equal(store.has(E2E_FAKE_NOW_STORAGE_KEY), false)

  process.env.NEXT_PUBLIC_E2E_TEST_MODE = "false"
  assert.equal(setE2eFakeNowMs(iso), null)
  assert.equal(store.has(E2E_FAKE_NOW_STORAGE_KEY), false)
})
