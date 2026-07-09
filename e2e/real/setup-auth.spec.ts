import fs from "node:fs"
import { expect, test } from "@playwright/test"

import { STORAGE_STATE } from "./env"

test("real auth storage states are generated", async () => {
  for (const storageStatePath of Object.values(STORAGE_STATE)) {
    expect(fs.existsSync(storageStatePath), `${storageStatePath} should exist`).toBe(true)
  }
})
