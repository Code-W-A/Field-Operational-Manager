import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), "utf8")

test("manual work creation validates suspended contracts at form and persistence boundaries", () => {
  const form = read("components/lucrare-form.tsx")
  const firestore = read("lib/firebase/firestore.ts")
  const selector = read("components/contract-select.tsx")

  assert.match(form, /isContractSuspended\(contractData\)/)
  assert.match(firestore, /isContractSuspended\(contractSnapshot\.data\(\)\)/)
  assert.match(selector, /if \(isContractSuspended\(c\)\) return false/)
})

test("automatic revision generation skips suspended contracts", () => {
  const functions = read("firebase-functions/src/index.ts")

  assert.match(functions, /if \(isContractSuspended\(contract\)\)/)
  assert.match(functions, /skipped suspended contract/)
})
